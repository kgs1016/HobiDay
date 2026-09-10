begin;
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
 select ('dead0000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
insert into auth.users(id) select pg_temp.uid(n) from generate_series(1,8)n;
insert into profiles(id,nickname,gender,age,area,level,career,home_gym,is_public)
select pg_temp.uid(n),'member-'||n,'m',25,'서울',3,3,'gym',false from generate_series(1,8)n;
-- 101 future hostless legacy; 102 future host1; 103 ongoing host1; 104 finished host1;
-- 105 ongoing host3 with departing guest2; 106 future host3 with only guest2.
insert into sessions(id,host_id,gym,starts_at,ends_at,capacity,level_min,level_max,age_min,age_max,status,chat_opened_at)
select pg_temp.uid(100+n),case when n=1 then null when n<=4 then pg_temp.uid(1) else pg_temp.uid(3) end,
 'gym',case when n in (1,2,6) then now()+interval '1 day' else now()-interval '2 hours' end,
 case when n=4 then now()-interval '1 hour' when n in (3,5) then now()+interval '1 hour' else now()+interval '1 day 2 hours' end,
 4,1,2,20,39,case when n=4 then 'done' else 'confirmed' end,now()-interval '3 hours'
from generate_series(1,6)n;
insert into signups(session_id,user_id,gender,status)
select pg_temp.uid(100+s),pg_temp.uid(u),'m','confirmed' from generate_series(1,5)s cross join generate_series(1,4)u;
insert into signups(session_id,user_id,gender,status) values(pg_temp.uid(106),pg_temp.uid(2),'m','confirmed'),(pg_temp.uid(106),pg_temp.uid(3),'m','confirmed');
insert into matches(id,user_a,user_b) values(pg_temp.uid(201),pg_temp.uid(1),pg_temp.uid(3)),(pg_temp.uid(202),pg_temp.uid(2),pg_temp.uid(3)),(pg_temp.uid(203),pg_temp.uid(3),pg_temp.uid(4));
insert into messages(match_id,sender_id,body) values(pg_temp.uid(201),pg_temp.uid(1),'direct-host'),(pg_temp.uid(202),pg_temp.uid(2),'direct-guest'),(pg_temp.uid(203),pg_temp.uid(4),'direct-active');
insert into messages(session_id,sender_id,sender_name,body) values(pg_temp.uid(101),null,'old name','old text'),(pg_temp.uid(102),pg_temp.uid(1),'host name','future host text'),(pg_temp.uid(105),pg_temp.uid(2),'guest name','guest group text'),(pg_temp.uid(105),pg_temp.uid(4),null,'active text');

-- APPLY MIGRATION HERE

do $$ declare rooms jsonb; begin
  assert (select status from sessions where id=pg_temp.uid(101))='cancelled', 'old hostless future meetup cancelled';
  assert not session_chat_open(pg_temp.uid(101)), 'old hostless group chat closed';
  assert not exists(select 1 from messages where sender_id is null and sender_name is not null), 'old snapshot labels cleared';
  perform set_config('request.jwt.claim.sub',pg_temp.uid(3)::text,true);
  assert not exists(select 1 from jsonb_array_elements(session_list()::jsonb)x where x->>'id'=pg_temp.uid(101)::text), 'orphan excluded from discovery';

  -- Typical in-app account deletion.
  perform set_config('request.jwt.claim.sub',pg_temp.uid(1)::text,true);
  assert account_delete()->>'ok'='true', 'host account deletion succeeds';
  assert (select status from sessions where id=pg_temp.uid(102))='cancelled', 'future host meetup cancelled';
  assert (select status from sessions where id=pg_temp.uid(103))='cancelled', 'ongoing host meetup cancelled';
  assert (select status from sessions where id=pg_temp.uid(104))='done', 'completed meetup preserved';
  assert (select departed_members from sessions where id=pg_temp.uid(104))=1, 'completed anonymous attendance preserved';
  assert not session_chat_open(pg_temp.uid(102)) and not session_chat_open(pg_temp.uid(104)), 'host-deleted chats close even inside retention window';
  assert not exists(select 1 from matches where id=pg_temp.uid(201)), 'direct chat cascades with deleted host';
  assert not exists(select 1 from messages where match_id=pg_temp.uid(201)), 'deleted direct chat messages cascade';
  perform set_config('request.jwt.claim.sub',pg_temp.uid(3)::text,true);
  assert chat_send(pg_temp.uid(201),'no') ->> 'error'='not_allowed', 'deleted direct chat cannot send';
  assert session_chat_send(pg_temp.uid(102),'no')->>'error'='not_allowed', 'hostless group cannot send';
  assert session_chat_messages(pg_temp.uid(102))->>'error'='not_allowed', 'hostless group cannot read';
  assert exists(select 1 from jsonb_array_elements(my_match_history()::jsonb)x where x->>'id'=pg_temp.uid(104)::text), 'remaining member sees finished history';
  assert (inbox_counts()->>'unread_messages')::int=4, 'closed orphan/host chats excluded from badge; active chats retained';

  -- Admin/service deletion must run the same cleanup as the app.
  delete from auth.users where id=pg_temp.uid(2);
  assert not exists(select 1 from matches where id=pg_temp.uid(202)), 'direct deletion also cascades direct chat';
  assert (select status from sessions where id=pg_temp.uid(106))='cancelled', 'future meetup below two is cancelled';
  assert session_chat_open(pg_temp.uid(106)), 'ordinary participant departure keeps cancellation notice window';
  assert session_chat_open(pg_temp.uid(105)), 'another host active group remains open';
  assert (select status from sessions where id=pg_temp.uid(105))='confirmed', 'active other-host meetup preserved';
  assert exists(select 1 from messages where session_id=pg_temp.uid(105) and body='guest group text' and sender_id is null and sender_name is null), 'group conversation preserved anonymously';
  assert exists(select 1 from messages where body='active text' and sender_id=pg_temp.uid(4)), 'other member messages untouched';
  assert session_chat_send(pg_temp.uid(105),'still open')->>'ok'='true', 'remaining peers can keep chatting';
  assert chat_send(pg_temp.uid(203),'still open')->>'ok'='true', 'unrelated direct chat untouched';
  assert (inbox_counts()->>'unread_messages')::int=3, 'badge follows remaining active messages';
  rooms:=my_session_chats()::jsonb;
  assert not exists(select 1 from jsonb_array_elements(rooms)x where x->>'session_id' in(pg_temp.uid(101)::text,pg_temp.uid(102)::text,pg_temp.uid(103)::text,pg_temp.uid(104)::text)), 'all hostless rooms absent from list';
  assert jsonb_array_length(my_chats()::jsonb)=1, 'only surviving direct chat listed';
  assert not has_function_privilege('authenticated','cleanup_departed_participation()','execute'), 'cleanup not directly exposed';
end $$;
rollback;
