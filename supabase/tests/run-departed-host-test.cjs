// 격리된 @electric-sql/pglite 환경에서 실행한다. NODE_PATH로 설치된 모듈 경로를 지정할 수 있다.
const fs=require('fs'), {PGlite}=require('@electric-sql/pglite');
const root=require('node:path').resolve(__dirname,'..');
const read=name=>fs.readFileSync(root+'/migrations/'+name,'utf8');
function table(src,name){const start=src.indexOf('create table if not exists '+name+' ('); if(start<0)throw Error(name);return src.slice(start,src.indexOf('\n);',start)+4);}
function fn(src,name){const match=src.match(new RegExp('create (?:or replace )?function '+name+'\\('));if(!match)throw Error(name);const start=match.index;const open=src.indexOf('$$',start), end=src.indexOf('$$;',open+2);return src.slice(start,end+3);}
(async()=>{const db=new PGlite();await db.exec(`create schema auth;create role anon;create role authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
const base=read('20260801000000_base_schema.sql');for(const name of ['profiles','sessions','signups'])await db.exec(table(base,name));
await db.exec(`alter table profiles add column photo text;alter table sessions alter column host_id drop not null;alter table sessions drop constraint sessions_host_id_fkey;alter table sessions add constraint sessions_host_id_fkey foreign key(host_id) references profiles(id) on delete set null;alter table sessions drop constraint sessions_capacity_check;alter table sessions add check(capacity between 2 and 8);create table messages(sender_id uuid references profiles(id) on delete set null,sender_name text);`);
const blocks=read('20260815223000_report_block.sql');await db.exec(table(blocks,'blocks'));await db.exec(fn(blocks,'blocked_with'));
const reviews=read('20260909120000_player_reviews.sql');await db.exec(table(reviews,'reviews'));await db.exec(fn(reviews,'attended'));
// Supporting profile visibility uses the existing real definition with inert unrelated relationships.
await db.exec(`create table matches(user_a uuid,user_b uuid);create table requests(from_id uuid,to_id uuid,status text,created_at timestamptz,responded_at timestamptz);create function session_member(uuid,uuid) returns json language sql as $$select '{}'::json$$;`);
await db.exec(fn(read('20260910000000_request_profile_links.sql'),'profile_visible'));
await db.exec(fn(reviews,'user_profile'));await db.exec(fn(reviews,'profile_reviews'));await db.exec(fn(read('20260908210000_all_features_free.sql'),'account_delete'));

// Additional real query dependencies; notification delivery is a local no-op.
await db.exec(`
alter table sessions add column gym_id uuid, add column chat_opened_at timestamptz, add column cancelled_at timestamptz;
create table gyms(id uuid primary key,name text,thumbnail_url text);
alter table matches add column id uuid primary key default gen_random_uuid(), add column session_id uuid references sessions(id) on delete cascade, add column created_at timestamptz default now(), add column a_left_at timestamptz, add column b_left_at timestamptz, add column closed_at timestamptz;
alter table matches add foreign key(user_a) references profiles(id) on delete cascade, add foreign key(user_b) references profiles(id) on delete cascade;
alter table messages add column id bigserial primary key, add column match_id uuid references matches(id) on delete cascade, add column session_id uuid references sessions(id) on delete cascade, add column body text, add column kind text default 'user', add column created_at timestamptz default now();
create table chat_reads(match_id uuid,user_id uuid,last_read_at timestamptz);
create table session_chat_reads(session_id uuid,user_id uuid,last_read_at timestamptz);
create function notify_add(uuid,text,text,text) returns void language sql as $$select$$;
create function my_hosted_requests() returns json language sql as $$select '[]'::json$$;
`);
const quiet=read('20260825310000_keep_words_quiet_block.sql');
await db.exec(fn(quiet,'blocked_by_me'));
await db.exec(fn(read('20260825220000_one_collapse_path.sql'),'session_chat_open'));
await db.exec(fn(read('20260825320000_block_splits_meetups.sql'),'session_chat_member'));
for(const name of ['session_collapse','inbox_counts'])await db.exec(fn(read('20260908210000_all_features_free.sql'),name));
for(const name of ['my_chats','chat_messages','session_chat_messages'])await db.exec(fn(quiet,name));
await db.exec(fn(read('20260825230000_leave_notice.sql'),'chat_send'));
await db.exec(fn(read('20260821140000_push_notify_lists.sql'),'session_chat_send'));
await db.exec(fn(read('20260907140000_drop_gender_ratio.sql'),'my_session_chats'));
await db.exec(read('20260910030000_departed_reviews_and_history.sql'));
const test=fs.readFileSync(root+'/tests/departed_host_sessions_and_chats.sql','utf8').split('-- APPLY MIGRATION HERE');
await db.exec(test[0]);await db.exec(read('20260910040000_departed_host_sessions_and_chats.sql'));await db.exec(test[1].slice(test[1].indexOf('\n')));
// Re-run prior review/attendance cases against the new deletion hook as well.
await db.exec(read('20260910040000_departed_host_sessions_and_chats.sql'));
const prior=fs.readFileSync(root+'/tests/departed_reviews_and_history.sql','utf8').split('-- APPLY MIGRATION HERE');
await db.exec(prior[0]);await db.exec(prior[1].slice(prior[1].indexOf('\n')));
console.log('PASS: prior review/likes and four-person attendance cases with the new hook.');
console.log('PASS: orphan backfill; account/direct deletion; future and ongoing hosts; completed attendance; active member withdrawal; direct/group chat access, sends, badges and no retained sender names.');
await db.close();})().catch(e=>{console.error(e.message,e.where);process.exit(1)});
