// NODE_PATH=/private/tmp/hobiday-edit-tests/node_modules node supabase/tests/run-app-update-policy-test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname, '../migrations/20260912120000_native_app_update_policy.sql'), 'utf8');

(async () => {
  const db = new PGlite();
  const scalar = async (query, args = []) => Object.values((await db.query(query, args)).rows[0])[0];
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.app_config(id integer primary key, sessions_open boolean not null default true,
        people_open boolean not null default true, open_at timestamptz, notice text);
      insert into public.app_config(id) values(1);
      alter table public.app_config enable row level security;
      grant usage on schema public to anon, authenticated;`);
    await db.exec(sql);
    await db.exec('set role anon');
    let policy = await scalar('select public.app_update_policy()');
    assert.equal(policy.ios_latest_version, '1.1');
    assert.equal(policy.android_latest_version, '1.1');
    assert.equal(policy.ios_minimum_version, null);
    await assert.rejects(db.query('select * from public.app_config'), /permission denied/);
    await db.exec('reset role');
    await db.query(`update public.app_config set ios_latest_version='1.2',
      android_latest_version='1.3', android_minimum_version='1.2' where id=1`);
    await db.exec('set role authenticated');
    policy = await scalar('select public.app_update_policy()');
    assert.equal(policy.ios_latest_version, '1.2');
    assert.equal(policy.android_minimum_version, '1.2');
    await db.exec('reset role');
    await assert.rejects(db.query("update public.app_config set ios_latest_version='bad' where id=1"), /check constraint/);
    console.log('PASS app update policy SQL: safe defaults, anonymous RPC, private table and validated platform versions');
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
