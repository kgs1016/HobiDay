// Isolated PostgreSQL: NODE_PATH=<installed modules> node supabase/tests/run-profile-start-test.cjs
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'migrations', name), 'utf8');
function table(src, name) {
  const match = src.match(new RegExp('create table (?:if not exists )?' + name + ' \\('));
  if (!match) throw Error(name);
  return src.slice(match.index, src.indexOf('\n);', match.index) + 4);
}
function fn(src, name) {
  const match = src.match(new RegExp('create (?:or replace )?function ' + name + '\\('));
  if (!match) throw Error(name);
  const open = src.indexOf('$$', match.index);
  return src.slice(match.index, src.indexOf('$$;', open + 2) + 3);
}
(async () => {
  const db = new PGlite();
  await db.exec(`create schema auth; create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;`);
  const base = read('20260801000000_base_schema.sql');
  for (const name of ['profiles', 'sessions', 'signups']) await db.exec(table(base, name));
  await db.exec(`alter table profiles add column photo text;
    grant select,insert,update,delete on profiles to authenticated;
    alter table profiles enable row level security;
    create policy own_profile on profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());`);
  const blocks = read('20260815223000_report_block.sql');
  await db.exec(table(blocks, 'blocks'));
  await db.exec(fn(blocks, 'blocked_with'));
  const reviews = read('20260909120000_player_reviews.sql');
  await db.exec(table(reviews, 'reviews'));
  // Unrelated session-member fallback is inert. Public/private/block/request guards use real definitions.
  await db.exec(`create table matches(user_a uuid,user_b uuid);
    create table requests(from_id uuid,to_id uuid,status text,created_at timestamptz,responded_at timestamptz);
    create function session_member(uuid,uuid) returns json language sql as $$select '{}'::json$$;`);
  await db.exec(fn(read('20260910000000_request_profile_links.sql'), 'profile_visible'));
  await db.exec(fn(reviews, 'user_profile'));
  await db.exec(table(read('20260907120000_climbing_ascents.sql'), 'climbing_ascents'));
  const batches = read('20260909180000_ascent_batches.sql');
  await db.exec(batches.slice(0, batches.indexOf('create function climbing_ascent_batch_save')));
  await db.exec('alter table climbing_ascents add column manual_difficulty integer check(manual_difficulty between 1 and 11)');
  await db.exec(fn(read('20260909200000_shoe_stages_rolling.sql'), 'climbing_progress_for_v2'));
  const policy = read('20260909220000_hobi_color_achievement.sql');
  for (const name of ['hobi_v_level_v1','hobi_points_v1','climbing_shoe_stage_v3']) await db.exec(fn(policy, name));
  const catalog = read('20260910010000_gym_color_catalog_v2.sql');
  await db.exec(catalog.slice(0, catalog.indexOf('create function climbing_ascent_batch_save_v3')));
  for (const name of ['climbing_progress_for_v4','climbing_progress_v4','public_climbing_achievements_v4']) await db.exec(fn(catalog, name));
  await db.exec(read('20260910050000_profile_frequency_and_shoe_start.sql'));
  await db.exec(read('20260910060000_shoe_start_reset.sql'));
  await db.exec(fs.readFileSync(path.join(__dirname,'profile_frequency_and_shoe_start.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'shoe_start_reset.sql'),'utf8'));
  await db.exec(read('20260910070000_shoe_reset_record_window.sql'));
  await db.exec(fs.readFileSync(path.join(__dirname,'shoe_reset_record_window.sql'),'utf8'));
  await db.close();
  console.log('PASS: profile/start compatibility, reset accumulation boundary, preserved history, immediate promotion, public access and rolling window');
})().catch(e => { console.error(e.message, e.where); process.exitCode = 1; });
