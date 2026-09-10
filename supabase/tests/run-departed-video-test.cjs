// NODE_PATH로 격리된 @electric-sql/pglite 설치 경로를 지정한다. 운영 DB는 사용하지 않는다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'migrations', name), 'utf8');
function table(src, name) {
  const start = src.indexOf('create table if not exists ' + name + ' (');
  assert.ok(start >= 0, name);
  return src.slice(start, src.indexOf('\n);', start) + 4);
}
function fn(src, name) {
  const match = src.match(new RegExp('create (?:or replace )?function (?:public\\.)?' + name + '\\('));
  assert.ok(match, name);
  const open = src.indexOf('$$', match.index);
  return src.slice(match.index, src.indexOf('$$;', open + 2) + 3);
}
const uid = n => 'de1e0000-0000-4000-8000-' + String(n).padStart(12, '0');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    await db.exec(table(read('20260801000000_base_schema.sql'), 'profiles'));
    await db.exec('alter table profiles add column photo text;');
    const community = read('20260906120000_community.sql');
    for (const name of ['posts', 'post_comments']) await db.exec(table(community, name));
    await db.exec(`alter table posts add column video_path text, add column thumbnail_path text,
      add column category text default 'board', add column topic text default 'daily', add column pinned_rank smallint;
      create table app_admins(user_id uuid primary key);
      create function notify_add(uuid,text,text,text) returns void language sql as $$select$$;
    `);
    const blocks = read('20260815223000_report_block.sql');
    await db.exec(table(blocks, 'blocks'));
    await db.exec(fn(blocks, 'blocked_with'));
    const video = read('20260906160000_video_feedback.sql');
    await db.exec(table(video, 'post_likes'));
    for (const name of ['video_post_list', 'community_media_readable', 'video_like_set']) {
      await db.exec(fn(video, name));
    }
    await db.exec(fn(community, 'comment_create'));
    await db.exec(fn(read('20260909234500_board_topics_and_pins.sql'), 'post_detail'));
    await db.exec(fn(read('20260910040000_departed_host_sessions_and_chats.sql'), 'account_delete'));
    for (let n = 1; n <= 4; n++) {
      await db.query('insert into auth.users values ($1)', [uid(n)]);
      await db.query(`insert into profiles(id,nickname,gender,age,area,level,home_gym)
        values ($1,'test-member','m',25,'서울',3,'test-place')`, [uid(n)]);
    }
    async function post(n, author, isVideo = true, deletedAt = null) {
      await db.query(`insert into posts(id,author_id,title,body,video_path,thumbnail_path,deleted_at)
        values ($1,$2,'test post','test body',$3,$4,$5)`,
      [uid(n), author == null ? null : uid(author), isVideo ? `test/${n}/video.mp4` : null,
        isVideo ? `test/${n}/thumbnail.jpg` : null, deletedAt]);
    }
    async function as(n) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [n == null ? '' : uid(n)]);
    }
    async function scalar(sql, params = []) {
      return Object.values((await db.query(sql, params)).rows[0])[0];
    }
    async function invisible(n) {
      const feed = await scalar('select video_post_list()');
      assert.ok(!feed.some(row => row.id === uid(n)), 'departed video absent from feed');
      assert.equal(await scalar('select post_detail($1)', [uid(n)]), null, 'detail unavailable');
      for (const file of ['video.mp4', 'thumbnail.jpg']) {
        assert.equal(await scalar('select community_media_readable($1)', [`test/${n}/${file}`]), false,
          'neither video nor thumbnail can receive a fresh signed URL');
      }
      assert.equal((await scalar('select video_like_set($1,true)', [uid(n)])).error, 'not_found');
      assert.equal((await scalar("select comment_create($1,'test comment')", [uid(n)])).error, 'not_found');
    }
    await post(101, null); // Already departed before this migration.
    await post(102, 2); // App account_delete.
    await post(103, 3); // Direct profile deletion.
    await post(104, 1); // Active video.
    await post(105, null, true, '2026-01-01T00:00:00Z');
    await post(106, null, false); // Existing text-board retention stays unchanged.
    await post(107, 4); // Direct auth.users deletion.
    await as(1);
    assert.equal((await scalar('select video_post_list()')).length, 5, 'reproduces the previous orphan leak');
    assert.equal(await scalar("select community_media_readable('test/101/video.mp4')"), true);
    const migration = read('20260910090000_departed_video_posts.sql');
    await db.exec(migration);
    await invisible(101);
    assert.ok(await scalar('select post_detail($1)', [uid(104)]), 'active detail preserved');
    assert.equal(await scalar("select community_media_readable('test/104/video.mp4')"), true);
    await as(2);
    assert.equal((await scalar('select account_delete()')).ok, true);
    assert.equal(await scalar('select count(*)::int from auth.users where id=$1', [uid(2)]), 0);
    await as(1);
    await invisible(102);
    await db.query('delete from profiles where id=$1', [uid(3)]);
    await invisible(103);
    await db.query('delete from auth.users where id=$1', [uid(4)]);
    await invisible(107);
    assert.equal((await scalar('select video_post_list()')).length, 1, 'only active video remains');
    assert.ok(await scalar('select post_detail($1)', [uid(106)]), 'text board policy preserved');
    assert.equal(await scalar("select deleted_at = '2026-01-01T00:00:00Z' from posts where id=$1", [uid(105)]), true);
    await db.query('update posts set deleted_at=null where id=$1', [uid(101)]);
    await invisible(101);
    await post(108, null);
    await invisible(108);
    await db.exec(migration); // Reapplication preserves data and works safely.
    assert.equal(await scalar('select count(*)::int from posts'), 8, 'private evidence retained');
    await as(null);
    assert.equal(await scalar("select community_media_readable('test/104/video.mp4')"), false);
    await as(1);
    await db.query('insert into app_admins values ($1)', [uid(1)]);
    assert.equal(await scalar("select community_media_readable('test/101/video.mp4')"), true,
      'existing admin evidence access preserved');
    assert.equal(await scalar("select has_function_privilege('authenticated','hide_departed_video_post()','execute')"), false);
    console.log('PASS: orphan backfill; app/direct deletion; feed/detail/media/likes/comments; active videos; board retention; no resurrection; private evidence; repeat migration.');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
