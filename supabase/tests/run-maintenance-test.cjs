const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const tester = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';

(async () => {
  const db = new PGlite();
  const claims = async (role, uid = null, request = '/rpc/session_list') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.path',$2,false)", [JSON.stringify({ role, ...(uid ? { sub: uid } : {}) }), request]);
    await db.exec(`set role ${role}`);
  };
  const status = async () => (await db.query('select app_access_status() as value')).rows[0].value;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls; create role authenticator;
      create schema auth; create schema storage; create schema cron;
      create table auth.users(id uuid primary key,email text,deleted_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
      alter table storage.objects enable row level security;
      create policy existing_storage_read on storage.objects for select to anon,authenticated using(true);
      create policy existing_storage_write on storage.objects for all to authenticated using((storage.foldername(name))[1]=auth.uid()::text) with check((storage.foldername(name))[1]=auth.uid()::text);
      grant usage on schema auth,storage to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
      create table app_config(id integer primary key,sessions_open boolean,people_open boolean,open_at timestamptz,notice text);
      insert into app_config values(1,true,true,null,null);
      create table messages(id uuid default gen_random_uuid(),body text);
      alter table messages enable row level security;
      create policy existing_message_read on messages for select to anon,authenticated using(true);
      create policy existing_message_write on messages for insert to authenticated with check(true);
      grant select,insert on messages to anon,authenticated;
      insert into messages(body) values('preserved member message');
      create table blocks(blocker_id uuid,blocked_id uuid);
      create table matches(user_a uuid,user_b uuid);
      create table requests(from_id uuid,to_id uuid);
      create table sessions(id uuid,host_id uuid);
      create table signups(session_id uuid,user_id uuid,status text);
      create table notifications(id uuid default gen_random_uuid(),user_id uuid,title text,body text,url text,created_at timestamptz default now(),pushed_at timestamptz,push_attempts integer default 0,push_retry_at timestamptz default now(),push_lease uuid);
      create table notification_push_receipts(notification_id uuid,token text);
      create table cron.job(jobid bigint primary key,jobname text,active boolean);
      insert into cron.job values(1,'sessions-remind',true),(2,'reviews-ask',false),(3,'notifications-push',true);
      create function cron.alter_job(job_id bigint,active boolean) returns void language sql as $$update cron.job set active=$2 where jobid=$1$$;
      insert into auth.users values('${tester}','line19981016@gmail.com',null),('${member}','member@example.com',null),('${other}','other@example.com',null);
      insert into matches values('${tester}','${member}');
      insert into storage.objects(bucket_id,name) values('profile-photos','${member}/photo.jpg'),('profile-photos','${other}/photo.jpg');
    `);
    await db.exec(fs.readFileSync(path.join(root, 'migrations/20260821120000_launch_gate.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'migrations/20261009120000_renewal_maintenance.sql'), 'utf8'));
    await claims('anon');
    assert.equal((await status()).allowed,true, 'installation must keep the app open');
    await db.exec('select check_app_maintenance()');
    assert.equal((await db.query('select count(*)::integer as n from messages')).rows[0].n,1);

    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(root, 'ops/renewal-close.sql'), 'utf8'));
    await db.exec(fs.readFileSync(path.join(root, 'ops/renewal-close.sql'), 'utf8'));
    assert.equal((await db.query('select count(*)::integer as n from app_testers')).rows[0].n,1);
    assert.equal((await db.query("select active from cron.job where jobname='sessions-remind'")).rows[0].active,false);

    for(const [role,id] of [['anon',null],['authenticated',member]]) {
      await claims(role,id);
      assert.equal((await status()).maintenance,true);
      assert.equal((await status()).allowed,false);
      await assert.rejects(db.exec('select check_app_maintenance()'),e=>e.code==='PT503');
      assert.equal((await db.query('select count(*)::integer as n from messages')).rows[0].n,0,'direct table access must close');
      assert.equal((await db.query('select app_flags() as f')).rows[0].f.sessions_open,false);
      await claims(role,id,'/rpc/app_access_status');
      await db.exec('select check_app_maintenance()');
      await assert.rejects(db.exec('select * from app_maintenance'),/permission denied/);
    }
    await claims('authenticated',member);
    await assert.rejects(db.exec("insert into messages(body) values('forbidden')"),/row-level security/);
    const ownMedia=await db.query('select name from storage.objects');
    assert.deepEqual(ownMedia.rows.map(x=>x.name),[`${member}/photo.jpg`]);
    await assert.rejects(db.exec(`insert into storage.objects(bucket_id,name) values('profile-photos','${member}/new.jpg')`),/row-level security/);
    await claims('authenticated',member,'/rpc/account_delete');
    await db.exec('select check_app_maintenance()');
    await db.exec(`delete from storage.objects where name='${member}/photo.jpg'`);

    await claims('authenticated',tester);
    assert.equal((await status()).allowed,true);
    assert.equal((await status()).tester,true);
    await db.exec('select check_app_maintenance()');
    await db.exec("insert into messages(body) values('tester message')");
    assert.equal((await db.query('select count(*)::integer as n from messages')).rows[0].n,2);

    // Cron/service claims are allowed, but pushes to normal members cannot escape the pause.
    await claims('service_role');
    await db.exec('select check_app_maintenance()');
    await db.exec('reset role');
    assert.equal((await db.query(`select can_notify('${tester}','${member}') as ok`)).rows[0].ok,false);
    await db.exec(`insert into notifications(user_id,title) values('${tester}','tester notification'),('${member}','member notification')`);
    const queued=(await db.query('select notifications_push_claim() as q')).rows[0].q;
    assert.equal(queued.length,1);
    assert.equal(queued[0].user_id,tester);

    await db.exec(fs.readFileSync(path.join(root, 'ops/renewal-reopen.sql'), 'utf8'));
    assert.equal((await db.query("select active from cron.job where jobname='sessions-remind'")).rows[0].active,true);
    assert.equal((await db.query("select active from cron.job where jobname='reviews-ask'")).rows[0].active,false,'reopening preserves previously disabled jobs');
    await claims('authenticated',member);
    assert.equal((await status()).allowed,true);
    await db.exec('select check_app_maintenance()');
    assert.equal((await db.query('select count(*)::integer as n from messages')).rows[0].n,2,'data survives closing and reopening');
    console.log('PASS: install open; close/retry; guest/member RPC + RLS block; tester access; own-media deletion; notifications; reopen + preserved data/jobs');
  } finally { await db.close(); }
})().catch(e=>{ console.error(e);process.exitCode=1; });
