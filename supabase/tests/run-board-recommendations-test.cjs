// NODE_PATH=/private/tmp/hobiday-edit-tests/node_modules node supabase/tests/run-board-recommendations-test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync(path.join(__dirname, '../migrations/20260912110000_board_recommendations_and_hot.sql'), 'utf8');
const id = n => 'b0110000-0000-4000-8000-' + String(n).padStart(12, '0');

(async () => {
  const db = new PGlite();
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const as = async (n, role = 'authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n ? id(n) : '']);
    await db.exec('set role ' + role);
  };
  try {
    await db.exec(`
      create schema auth;
      create role anon;
      create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,
        nickname text, photo text, ready boolean not null default true);
      create table public.blocks(blocker uuid, blocked uuid);
      create function public.blocked_with(target uuid) returns boolean language sql stable security definer as
        $$select exists(select 1 from public.blocks where
          (blocker=auth.uid() and blocked=target) or (blocked=auth.uid() and blocker=target))$$;
      create function public.my_participation_profile_ready() returns boolean language sql stable security definer as
        $$select coalesce((select ready from public.profiles where id=auth.uid()),false)$$;
      create table public.posts(
        id uuid primary key, author_id uuid references public.profiles(id) on delete set null,
        title text not null, body text not null, category text not null default 'board', topic text,
        pinned_rank integer, video_path text, thumbnail_path text,
        editorial_author_name text, editorial_author_photo text,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
      create table public.post_comments(
        id uuid primary key, post_id uuid not null references public.posts(id) on delete cascade,
        author_id uuid references public.profiles(id) on delete set null,
        body text not null, created_at timestamptz not null default now(), deleted_at timestamptz);
      create table public.post_likes(
        post_id uuid not null references public.posts(id) on delete cascade,
        user_id uuid not null references public.profiles(id) on delete cascade,
        primary key(post_id,user_id));
      alter table public.posts enable row level security;
      alter table public.post_comments enable row level security;
      alter table public.post_likes enable row level security;
      grant usage on schema public,auth to authenticated,anon;
    `);
    await db.exec(migration);
    for (let n = 1; n <= 6; n++) {
      await db.query('insert into auth.users values($1)', [id(n)]);
      await db.query('insert into public.profiles(id,nickname,ready) values($1,$2,$3)', [id(n), `member${n}`, n !== 6]);
    }
    await db.query(`insert into public.posts(id,author_id,title,body,topic,created_at) values
      ($1,$2,'추천 많은 글','내용','daily',now()-interval '1 day'),
      ($3,$4,'추천 두 개 글','내용','question',now()-interval '2 days'),
      ($5,$2,'오래된 글','내용','daily',now()-interval '45 days')`,
      [id(101),id(1),id(102),id(2),id(103)]);
    await db.query(`insert into public.posts(id,author_id,title,body,topic,pinned_rank) values
      ($1,null,'운영 공지','내용','daily',1)`, [id(104)]);
    await db.query(`insert into public.post_comments(id,post_id,author_id,body) values
      ($1,$2,$3,'첫 댓글'),($4,$2,$5,'둘째 댓글')`, [id(201),id(101),id(2),id(202),id(3)]);

    await as(2);
    assert.equal((await scalar('select public.post_recommend_set($1,true)',[id(101)])).ok,true);
    assert.equal((await scalar('select public.post_recommend_set($1,true)',[id(101)])).recommend_count,1,'retry is idempotent');
    assert.equal((await scalar('select public.post_recommend_set($1,true)',[id(102)])).error,'self');
    assert.equal((await scalar('select public.post_recommend_set($1,true)',[id(104)])).error,'not_found','pinned notices cannot rank');
    await as(3);
    await scalar('select public.post_recommend_set($1,true)',[id(101)]);
    await scalar('select public.post_recommend_set($1,true)',[id(102)]);
    assert.equal((await scalar('select public.comment_recommend_set($1,true)',[id(201)])).recommended,true);
    assert.equal((await scalar('select public.comment_recommend_set($1,true)',[id(202)])).error,'self');
    await as(4);
    await scalar('select public.post_recommend_set($1,true)',[id(101)]);
    await scalar('select public.post_recommend_set($1,true)',[id(102)]);
    await scalar('select public.post_recommend_set($1,true)',[id(103)]);
    await as(5);
    let hot = await scalar("select public.board_feed_v2(null,'',true,null,null,20)");
    assert.deepEqual(hot.items.map(row => row.id),[id(101),id(102)],'HOT ranks recent posts and excludes old posts');
    assert.equal(hot.items[0].hot_score,13,'3 recommendations and 2 unique commenters are weighted');
    assert.equal(hot.pinned.length,1,'fixed notices remain above the HOT list');
    let detail = await scalar('select public.post_detail($1)',[id(101)]);
    assert.equal(detail.like_count,3);
    assert.equal(detail.comments[0].recommend_count,1);
    assert.equal(detail.comments[0].recommended,false);
    await db.exec('reset role');
    await db.query('insert into public.blocks values($1,$2)',[id(5),id(4)]);
    await as(5);
    hot = await scalar("select public.board_feed_v2(null,'',true,null,null,20)");
    assert.equal(hot.items[0].recommend_count,2,'blocked members do not affect visible counts');
    await as(6);
    assert.equal((await scalar('select public.post_recommend_set($1,true)',[id(101)])).error,'profile_incomplete');
    assert.equal((await scalar('select public.comment_recommend_set($1,true)',[id(201)])).error,'profile_incomplete');
    assert.equal((await scalar('select public.post_recommend_set($1,false)',[id(101)])).ok,true,'removal stays available');
    await as(3);
    assert.equal((await scalar('select public.post_recommend_set($1,false)',[id(101)])).recommend_count,2);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('insert into public.post_comment_recommendations values($1,$2,now())',[id(201),id(3)]),/permission denied/);
    await as(null,'anon');
    await assert.rejects(db.query('select public.post_recommend_set($1,true)',[id(101)]),/permission denied/);
    console.log('PASS board recommendations: uniqueness, self/pin/profile guards, comment state, HOT score/window, block filtering and permissions');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
