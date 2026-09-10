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
const test=fs.readFileSync(root+'/tests/departed_reviews_and_history.sql','utf8').split('-- APPLY MIGRATION HERE');await db.exec(test[0]);await db.exec(read('20260910030000_departed_reviews_and_history.sql'));await db.exec(test[1].slice(test[1].indexOf('\n')));
console.log('PASS: legacy review cleanup; actual account deletion/FK cascade; likes/counts; four-person history; host/peer withdrawal; blocking, private peer visibility and history permissions.');await db.close();})().catch(e=>{console.error(e.message,e.where);process.exit(1)});
