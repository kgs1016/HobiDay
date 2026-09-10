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
    const legacy=await scalar("select session_create('legacy gym',now()+interval '1 day',now()+interval '1 day 2 hours',8,1,2,19,60,false,null)");
    await db.exec(read('20260910110000_session_capacity_six.sql'));
    for(const cap of [null,1,7,8]) {
      assert.equal((await scalar("select session_create('test gym',now()+interval '1 day',now()+interval '1 day 2 hours',$1,1,2,19,60,false,null)",[cap])).error,'bad_capacity');
    }
    const six=await scalar("select session_create('six gym',now()+interval '1 day',now()+interval '1 day 2 hours',6,1,2,19,60,false,null)");
    assert.ok(six.id);
    await assert.rejects(db.query('update sessions set capacity=7 where id=$1',[six.id]),/2~6/);
    await db.query("update sessions set status='cancelled',capacity=capacity where id=$1",[legacy.id]);
    assert.equal(await scalar('select capacity from sessions where id=$1',[legacy.id]),8,'existing member limits are not silently reduced');
    const created=await scalar("select session_create('test gym',now()+interval '1 day',now()+interval '1 day 2 hours',3,1,2,19,60,false,null)");
    assert.ok(created.id,JSON.stringify(created));
    assert.equal(await scalar('select gender from signups where user_id=$1',[id(2)]),null);
    await as(3);
    const joined=await scalar('select session_join($1)',[created.id]);
    assert.equal(joined.error,undefined,JSON.stringify(joined));
    assert.equal(await scalar('select status from signups where user_id=$1',[id(3)]),'waiting');
    assert.equal((await scalar('select request_send($1,$2)',[id(1),'hello'])).ok,true);
    const post=await scalar("select post_create('hello','test body')");
    assert.equal(post.ok,true,JSON.stringify(post));
    await as(4);
    assert.equal((await scalar("select comment_create($1,'test comment')",[post.id])).ok,true);
    const vp=id(100);const video=id(4)+'/'+vp+'/video.mp4';const thumb=id(4)+'/'+vp+'/thumbnail.jpg';
    await db.query(`insert into storage.objects values('community-videos',$1,'{"mimetype":"video/mp4"}'),
      ('community-videos',$2,'{"mimetype":"image/jpeg"}')`,[video,thumb]);
    assert.equal((await scalar("select video_post_create($1,'test video',$2,$3)",[vp,video,thumb])).ok,true);
    await db.query("update profiles set gender='m',is_public=true,photo=null where id=$1",[id(2)]);
    assert.equal(await scalar('select photo from profiles where id=$1',[id(2)]),'/images/avatars/member-man.svg');
    await db.query("update profiles set gender='f',photo=null where id=$1",[id(3)]);
    assert.equal(await scalar('select photo from profiles where id=$1',[id(3)]),'/images/avatars/member-woman.svg');
    await assert.rejects(db.query("update profiles set gender='f' where id=$1",[id(2)]),/성별/);
    await assert.rejects(db.query('update profiles set age=18 where id=$1',[id(2)]),/check constraint/);
    await as(null);assert.equal(await scalar('select ensure_my_profile()'),null);
    assert.equal(await scalar("select has_function_privilege('anon','ensure_my_profile()','execute')"),false);
    await as(4);assert.equal((await scalar('select account_delete()')).ok,true);
    assert.equal(await scalar('select ensure_my_profile()'),null,'deleted identity cannot recreate itself');
    assert.equal(await scalar('select count(*)::int from profiles where id=$1',[id(4)]),0);
    console.log('PASS: 2–6 capacity enforcement and legacy preservation; legacy/new empty profiles; private defaults; real-photo retention; null demographics; session create/join; conversation request; post/comment/video; first gender choice; constraints; own-only recovery; account deletion.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
