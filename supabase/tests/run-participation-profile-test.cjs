// Run with NODE_PATH pointing to an isolated @electric-sql/pglite installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const read = file => fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8');
function table(src, name) {
  const start = src.indexOf('create table if not exists ' + name + ' (');
  assert.ok(start >= 0, name);
  return src.slice(start, src.indexOf('\n);', start) + 4);
}
function fn(src, name) {
  const m = src.match(new RegExp('create (?:or replace )?function (?:public\\.)?' + name + '\\('));
  assert.ok(m, name);
  const opening = src.indexOf('$$', m.index);
  return src.slice(m.index, src.indexOf('$$;', opening + 2) + 3);
}
const id = n => 'a0110000-0000-4000-8000-' + String(n).padStart(12, '0');
(async () => {
  const db = new PGlite();
  const scalar = async (sql, args = []) => Object.values((await db.query(sql,args)).rows[0])[0];
  const as = async n => db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
  try {
    await db.exec(`create schema auth;create role anon;create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
    const base = read('20260801000000_base_schema.sql');
    for(const name of ['profiles','sessions','signups']) await db.exec(table(base,name));
    await db.exec(`alter table profiles add column photo text;
      alter table profiles alter column area drop not null, alter column home_gym drop not null, alter column level drop not null;
      alter table profiles add constraint profiles_public_needs_photo check(not is_public or photo is not null);
      alter table sessions add column gym_id uuid;
      alter table sessions drop constraint sessions_capacity_check;
      alter table sessions add constraint sessions_capacity_check check(capacity between 2 and 8);
      alter table signups add column decided_at timestamptz;
      create table gyms(id uuid,name text,is_active boolean);
      create function notify_add(uuid,text,text,text) returns void language sql as $$select$$;`);
    await db.exec(read('20260816203000_lock_gender.sql'));
    const blocks=read('20260815223000_report_block.sql');
    await db.exec(table(blocks,'blocks'));await db.exec(fn(blocks,'blocked_with'));
    await db.exec(table(read('20260810181218_requests.sql'),'requests'));
    const session=read('20260907140000_drop_gender_ratio.sql');
    for(const name of ['session_has_seat','session_create']) await db.exec(fn(session,name));
    const free=read('20260908210000_all_features_free.sql');
    for(const name of ['request_send','session_join']) await db.exec(fn(free,name));
    const community=read('20260906120000_community.sql');
    for(const name of ['posts','post_comments']) await db.exec(table(community,name));
    await db.exec(fn(community,'post_create'));await db.exec(fn(community,'comment_create'));
    await db.exec(`alter table posts add column video_path text,add column thumbnail_path text;
      create schema storage;create table storage.objects(bucket_id text,name text,metadata jsonb);`);
    await db.exec(fn(read('20260906160000_video_feedback.sql'),'video_post_create'));
    await db.exec(fn(read('20260910040000_departed_host_sessions_and_chats.sql'),'account_delete'));
    // Existing real photo and missing legacy profiles must both survive the rollout.
    await db.query('insert into auth.users values ($1),($2)',[id(1),id(2)]);
    await db.query(`insert into profiles(id,nickname,gender,age,photo,is_public)
      values($1,'existing','f',27,'existing/real.jpg',true)`,[id(1)]);
    await db.exec(read('20260910100000_optional_profiles.sql'));
    assert.equal(await scalar('select photo from profiles where id=$1',[id(1)]),'existing/real.jpg');
    await db.query('insert into auth.users values ($1),($2)',[id(3),id(4)]);
    for(const n of [2,3,4]) {
      const p=await scalar('select to_jsonb(p) from profiles p where id=$1',[id(n)]);
      assert.equal(p.gender,null);assert.equal(p.age,null);assert.equal(p.is_public,false);
      assert.equal(p.photo,'/images/avatars/member-neutral.svg');
    }
    await as(2);
    const original=await scalar('select ensure_my_profile()');
    assert.deepEqual(await scalar('select ensure_my_profile()'),original,'retry does not overwrite member data');
    await db.exec(read('20260910110000_session_capacity_six.sql'));
    await db.exec(`create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      grant usage on schema public,auth,storage to authenticated,anon;
      grant insert,select on storage.objects to authenticated;
      alter table storage.objects enable row level security;`);
    await db.exec(read('20260910120000_participation_profile.sql'));
    assert.equal(await scalar('select my_participation_profile_ready()'),false);
    const create = () => scalar("select session_create('test gym',now()+interval '1 day',now()+interval '1 day 2 hours',4,1,2,19,60,false,null)");
    await assert.rejects(create(), /profile_incomplete/);
    await assert.rejects(scalar('select request_send($1,$2)',[id(1),'hello']), /profile_incomplete/);
    await assert.rejects(scalar("select post_create('hello','body')"), /profile_incomplete/);
    await assert.rejects(db.query("insert into posts(author_id,title,body) values($1,'direct','body')",[id(2)]),/profile_incomplete/);
    await assert.rejects(db.query('update profiles set is_public=true where id=$1',[id(2)]),/profiles_public_needs_basic_info/);
    // Null demographic values cannot pass the public-profile constraint.
    await db.query("update profiles set gender='m',age=27,photo=null,is_public=true where id=$1",[id(2)]);
    assert.equal(await scalar('select my_participation_profile_ready()'),true);
    assert.equal(await scalar('select photo from profiles where id=$1',[id(2)]),'/images/avatars/member-man.svg');
    const created=await create();assert.ok(created.id);
    const post=await scalar("select post_create('hello','body')");assert.ok(post.id);
    assert.equal((await scalar('select request_send($1,$2)',[id(1),'hello'])).ok,true);
    await as(3);
    await assert.rejects(scalar('select session_join($1)',[created.id]),/profile_incomplete/);
    await assert.rejects(scalar("select comment_create($1,'comment')",[post.id]),/profile_incomplete/);
    const vp=id(100),video=id(3)+'/'+vp+'/video.mp4',thumb=id(3)+'/'+vp+'/thumbnail.jpg';
    await db.exec('set role authenticated');
    await assert.rejects(db.query("insert into storage.objects values('community-videos',$1,'{}')",[video]),/row-level security/);
    await db.exec('reset role');
    await db.query(`insert into storage.objects values('community-videos',$1,'{"mimetype":"video/mp4"}'),
      ('community-videos',$2,'{"mimetype":"image/jpeg"}')`,[video,thumb]);
    await assert.rejects(scalar("select video_post_create($1,'test video',$2,$3)",[vp,video,thumb]),/profile_incomplete/);
    await db.query("update profiles set gender='f',age=19,photo=null where id=$1",[id(3)]);
    assert.equal((await scalar('select session_join($1)',[created.id])).error,undefined);
    const comment=await scalar("select comment_create($1,'comment')",[post.id]);assert.equal(comment.ok,true);
    assert.equal((await scalar("select video_post_create($1,'test video',$2,$3)",[vp,video,thumb])).ok,true);
    await db.exec('set role authenticated');
    await db.query("insert into storage.objects values('community-videos',$1,'{}')",[id(3)+'/allowed.mp4']);
    await assert.rejects(db.query("insert into storage.objects values('community-videos',$1,'{}')",[id(2)+'/forbidden.mp4']),/row-level security/);
    await db.exec('reset role');
    await db.query('update profiles set age=null where id=$1',[id(3)]);
    await db.query("update signups set status='cancelled' where user_id=$1",[id(3)]);
    await assert.rejects(db.query("update signups set status='waiting' where user_id=$1",[id(3)]),/profile_incomplete/);
    await db.query('update posts set deleted_at=now() where id=$1',[vp]);
    await db.query('update post_comments set deleted_at=now() where author_id=$1',[id(3)]);
    assert.ok(await scalar('select count(*) from sessions'),'browsing data retained');
    await as(null);
    assert.equal(await scalar("select has_function_privilege('anon','my_participation_profile_ready()','execute')"),false);
    await as(3);assert.equal((await scalar('select account_delete()')).ok,true);
    console.log('PASS participation SQL: incomplete RPC/direct writes blocked; minimum profile with default avatar accepted; create/join/request/post/comment/video; media RLS and ownership; NULL-safe publishing; cancellation/deletion; account removal.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
