// NODE_PATH=<PGlite modules> node supabase/tests/run-open-app-test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const read = name => fs.readFileSync(path.join(__dirname, '../migrations', name), 'utf8');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    `);
    // Use the original table and RPC, without executing unrelated retired credit SQL.
    const original = read('20260813184013_credits.sql');
    const start = original.indexOf('create table if not exists app_config (');
    await db.exec(original.slice(start, original.indexOf('\n);', start) + 4));
    await db.exec('alter table app_config enable row level security');
    await db.exec(read('20260821120000_launch_gate.sql'));
    const open = read('20260910080000_open_app.sql');

    // Both existing locked installations and a missing config row must open.
    for (const existing of [true, false]) {
      await db.exec('delete from app_config');
      if (existing) await db.exec(`insert into app_config values
        (1,false,false,'2026-09-09 22:00+09','앱 준비 중')`);
      await db.exec(open);
      await db.exec(open); // Safe retry after an interrupted deployment.
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`);
        const { rows } = await db.query('select public.app_flags() as flags');
        assert.deepEqual(rows[0].flags, {
          sessions_open: true, people_open: true, open_at: null, notice: null, tester: false,
        }, 'ordinary members and guests get an open app, without tester privileges');
        await assert.rejects(db.query('select * from app_config'), /permission denied/);
        await db.exec('reset role');
      }
    }
    await db.exec('delete from app_config; insert into app_config default values');
    const { rows } = await db.query('select sessions_open,people_open from app_config');
    assert.deepEqual(rows[0], { sessions_open: true, people_open: true });
    console.log('PASS: legacy app flags open for guests/members, notice removed, missing row, retry, defaults, private config');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
