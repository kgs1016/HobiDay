// NODE_PATH=/path/to/test/node_modules node supabase/tests/run-legacy-compatibility-test.cjs
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated;');
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/20260914090000_legacy_read_compatibility.sql'), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec('set role authenticated');
    const { rows } = await db.query('select my_credits() as credits, my_videos() as videos, my_confirm_proposals() as proposals');
    assert.deepEqual(rows[0], { credits: { balance: 0, history: [], retired: true }, videos: [], proposals: [] });
    await db.exec('reset role');
    const { rows: functions } = await db.query("select proname, prosecdef, has_function_privilege('anon',oid,'execute') as anon from pg_proc where pronamespace='public'::regnamespace");
    assert.equal(functions.length, 3);
    assert.ok(functions.every(f => !f.prosecdef && !f.anon));
    assert.equal((await db.query("select count(*)::int as count from pg_tables where schemaname='public'")).rows[0].count, 0, 'no retired table or credit ledger restored');
    console.log('PASS legacy compatibility: repeat application, empty response shapes, authenticated-only, no privileged functions or retired data');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
