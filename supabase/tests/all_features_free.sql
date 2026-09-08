-- 실제 DB에서도 실행 가능하다. 테스트 계정·신청·메시지는 전부 롤백한다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
insert into auth.users(id)
select ('f4ee0000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
from generate_series(1,15) n;
insert into profiles(id,nickname,gender,age,level,career,height,photo,is_public)
select ('f4ee0000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'free-test-'||n, 'm', 25, 3, 3, 170, 'test/free-'||n||'.webp', n <> 15
from generate_series(1,15) n;
insert into sessions(id,host_id,gym,starts_at,ends_at,capacity,level_min,level_max,age_min,age_max,status)
values ('f4ee0000-0000-4000-8000-000000000101','f4ee0000-0000-4000-8000-000000000002','free-test',
now()+interval '1 day',now()+interval '1 day 2 hours',4,1,5,20,39,'open');
insert into signups(session_id,user_id,gender,status)
values ('f4ee0000-0000-4000-8000-000000000101','f4ee0000-0000-4000-8000-000000000002','m','confirmed');

-- 과거 원장은 보관되지만 신규 이용자는 잔액을 갖지 않는다.
do $$ begin
  assert to_regclass('public.credit_ledger') is null, 'no active ledger';
  assert to_regclass('retired.credit_ledger') is not null, 'historical ledger preserved';
  assert not has_schema_privilege('authenticated','retired','USAGE'), 'history is not exposed';
  assert not has_table_privilege('authenticated','retired.credit_ledger','SELECT'), 'history cannot be read directly';
  assert not has_table_privilege('authenticated','retired.credit_ledger','INSERT'), 'history cannot be credited directly';
  assert not has_table_privilege('service_role','retired.credit_ledger','INSERT'), 'legacy service calls cannot credit history';
  assert not has_function_privilege('anon','request_send(uuid,text)','EXECUTE'), 'anonymous send stays denied';
  assert not has_function_privilege('anon','session_join(uuid)','EXECUTE'), 'anonymous join stays denied';
  assert to_regprocedure('public.credit_rule(text)') is null, 'price rules removed';
  assert to_regprocedure('public.credit_grant(uuid,text,text)') is null, 'rewards removed';
  assert to_regprocedure('public.my_credits()') is null, 'balance API removed';
  assert to_regprocedure('public.claim_profile_bonus()') is null, 'signup bonus API removed';
  assert to_regprocedure('public.request_daily_limit()') is null, 'paid daily quota removed';
  assert to_regprocedure('public.session_fee_refund(uuid,uuid)') is null, 'refund system removed';
  assert to_regprocedure('public.mission_done(uuid,integer,text)') is null, 'legacy video reward removed';
  assert to_regclass('public.deleted_accounts') is null, 'bonus-only email retention removed';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','f4ee0000-0000-4000-8000-000000000001',true);
do $$
declare target uuid; result jsonb;
begin
  -- 잔액이 전혀 없는 신규 이용자도 여러 상대에게 무료로 신청할 수 있다.
  for n in 2..14 loop
    target := ('f4ee0000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
    result := request_send(target, '같이 등반해요')::jsonb;
    assert result = '{"ok":true}'::jsonb, 'free send without balance or per-day price gate';
  end loop;
  assert request_send('f4ee0000-0000-4000-8000-000000000002')->>'error' = 'already', 'duplicate pending request blocked';
  assert request_send('f4ee0000-0000-4000-8000-000000000001')->>'error' = 'self', 'self request blocked';
  assert request_send('f4ee0000-0000-4000-8000-000000000015')->>'error' = 'not_public', 'private profile blocked';
  assert request_send('f4ee0000-0000-4000-8000-000000000099')->>'error' = 'not_found', 'missing profile blocked';
  result := session_join('f4ee0000-0000-4000-8000-000000000101')::jsonb;
  assert result = '{"status":"waiting"}'::jsonb, 'free meetup still needs host approval';
  assert session_join('f4ee0000-0000-4000-8000-000000000101')->>'status' = 'waiting', 'join retry stays one request';
  assert session_cancel('f4ee0000-0000-4000-8000-000000000101')->>'ok' = 'true', 'waiting cancellation works without refunds';
  assert session_join('f4ee0000-0000-4000-8000-000000000101')->>'status' = 'waiting', 'free rejoin after cancellation';
  result := inbox_counts()::jsonb;
  assert not result ? 'daily_limit' and not result ? 'sent_today', 'inbox no longer tracks paid allowance';
end $$;

-- 수락과 재신청 경로를 실제 RPC로 확인한다.
select set_config('request.jwt.claim.sub','f4ee0000-0000-4000-8000-000000000002',true);
do $$ declare request_id uuid;
begin
  select (r->>'id')::uuid into request_id from json_array_elements(requests_received()) r where r->>'from_id'='f4ee0000-0000-4000-8000-000000000001';
  assert request_respond(request_id,false)->>'ok' = 'true', 'declining still works';
  assert session_reject('f4ee0000-0000-4000-8000-000000000101','f4ee0000-0000-4000-8000-000000000001')->>'ok' = 'true', 'meetup rejection works without refund helper';
end $$;
select set_config('request.jwt.claim.sub','f4ee0000-0000-4000-8000-000000000001',true);
do $$ begin
  assert request_send('f4ee0000-0000-4000-8000-000000000002')->>'ok' = 'true', 'declined chat can be resent for free';
  assert session_join('f4ee0000-0000-4000-8000-000000000101')->>'status' = 'waiting', 'declined meetup can be requested again';
end $$;
select set_config('request.jwt.claim.sub','f4ee0000-0000-4000-8000-000000000002',true);
do $$ declare request_id uuid;
begin
  select (r->>'id')::uuid into request_id from json_array_elements(requests_received()) r where r->>'from_id'='f4ee0000-0000-4000-8000-000000000001';
  assert request_respond(request_id,true)->>'ok' = 'true', 'accepting opens chat';
  assert session_approve('f4ee0000-0000-4000-8000-000000000101','f4ee0000-0000-4000-8000-000000000001')->>'ok' = 'true', 'host approval works';
end $$;
select set_config('request.jwt.claim.sub','f4ee0000-0000-4000-8000-000000000001',true);
do $$ begin
  assert request_send('f4ee0000-0000-4000-8000-000000000002')->>'error' = 'already', 'accepted chat is not duplicated';
  assert block_user('f4ee0000-0000-4000-8000-000000000002')->>'ok' = 'true', 'block handles shared meetup and chat without refunds';
  assert request_send('f4ee0000-0000-4000-8000-000000000002')->>'error' = 'blocked', 'outgoing block still enforced';
end $$;
select set_config('request.jwt.claim.sub','f4ee0000-0000-4000-8000-000000000002',true);
do $$ begin
  assert request_send('f4ee0000-0000-4000-8000-000000000001')->>'error' = 'blocked', 'reverse block still enforced';
end $$;
select set_config('request.jwt.claim.sub','f4ee0000-0000-4000-8000-000000000015',true);
do $$ begin
  assert account_delete()->>'ok' = 'true', 'account deletion no longer depends on bonus history';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert request_send('f4ee0000-0000-4000-8000-000000000002')->>'error' = 'no_profile', 'missing identity still blocked';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from retired.credit_ledger where user_id::text like 'f4ee0000-%'), 'free activity never writes history';
  assert not exists (select 1 from auth.users where id='f4ee0000-0000-4000-8000-000000000015'), 'account was deleted';
end $$;
rollback;
