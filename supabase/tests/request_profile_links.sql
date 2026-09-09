-- 관계가 있는 비공개 신청자/상대만 열고, 만료·차단·무관한 사용자는 차단한다.
begin;
insert into auth.users(id)
select ('fa710000-0000-4000-8000-00000000000' || n)::uuid from generate_series(1,4) n;
insert into profiles(id,nickname,gender,age,is_public,photo)
select id, 'request-profile-' || right(id::text,1), 'm', 25, false, id::text || '/avatar.webp'
from auth.users where id::text like 'fa710000-%';
insert into requests(from_id,to_id,status)
values ('fa710000-0000-4000-8000-000000000001','fa710000-0000-4000-8000-000000000002','pending');
insert into sessions(id,host_id,gym,starts_at,ends_at,capacity,level_min,level_max,age_min,age_max,status)
values ('fa710000-0000-4000-8000-000000000010','fa710000-0000-4000-8000-000000000004','test',
 now()+interval '1 day',now()+interval '1 day 2 hours',4,1,5,20,39,'open');
insert into signups(session_id,user_id,gender,status)
values ('fa710000-0000-4000-8000-000000000010','fa710000-0000-4000-8000-000000000001','m','waiting');

set local role authenticated;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000001',true);
do $$ begin
 assert user_profile('fa710000-0000-4000-8000-000000000002')->>'id' = 'fa710000-0000-4000-8000-000000000002', 'sent private profile opens before any messages';
 assert requests_sent()->0->>'photo' = 'fa710000-0000-4000-8000-000000000002/avatar.webp', 'sent recipient photo available';
 assert (inbox_counts()->>'requests')::int = 0, 'outgoing requests do not create an inbox badge';
 assert user_profile(null,'fa710000-0000-4000-8000-000000000010')->>'id' = 'fa710000-0000-4000-8000-000000000004', 'applicant opens host with session-only URL';
 assert not profile_visible('fa710000-0000-4000-8000-000000000003'), 'unrelated private profile hidden';
 assert not has_function_privilege('anon','requests_sent()','execute');
 assert not has_function_privilege('anon','profile_visible(uuid,uuid)','execute');
end $$;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000002',true);
do $$ begin
 assert user_profile('fa710000-0000-4000-8000-000000000001')->>'id' = 'fa710000-0000-4000-8000-000000000001', 'received private applicant opens';
 assert (inbox_counts()->>'requests')::int = 1, 'only received pending counted';
 assert (select count(*) from public_climbing_achievements(array['fa710000-0000-4000-8000-000000000001'::uuid])) = 1, 'shoe summary shares visibility';
end $$;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000004',true);
do $$ begin
 assert user_profile('fa710000-0000-4000-8000-000000000001','fa710000-0000-4000-8000-000000000010')->>'id' = 'fa710000-0000-4000-8000-000000000001', 'host can review waiting private applicant';
 assert not profile_visible('fa710000-0000-4000-8000-000000000001'), 'waiting applicant requires session context';
 assert (inbox_counts()->>'requests')::int = 1, 'hosted pending counted';
end $$;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000003',true);
do $$ begin
 assert not profile_visible('fa710000-0000-4000-8000-000000000001','fa710000-0000-4000-8000-000000000010'), 'unrelated caller cannot inspect waiting applicant with guessed session';
end $$;

reset role;
insert into blocks(blocker_id,blocked_id)
values ('fa710000-0000-4000-8000-000000000002','fa710000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000001',true);
do $$ begin
 assert not profile_visible('fa710000-0000-4000-8000-000000000002'), 'blocked-by target hidden';
 assert json_array_length(requests_sent()) = 0, 'blocked request omitted';
end $$;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000002',true);
do $$ begin
 assert not profile_visible('fa710000-0000-4000-8000-000000000001'), 'blocked target hidden';
 assert (inbox_counts()->>'requests')::int = 0, 'blocked received not counted';
end $$;
reset role;
delete from blocks where blocker_id = 'fa710000-0000-4000-8000-000000000002';
update requests set created_at=now()-interval '8 days' where from_id='fa710000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000001',true);
do $$ begin
 assert not profile_visible('fa710000-0000-4000-8000-000000000002'), 'expired pending no longer grants access';
 assert json_array_length(requests_sent()) = 0;
end $$;
reset role;
update requests set created_at=now()-interval '2 days',status='declined',responded_at=now()-interval '1 hour'
where from_id='fa710000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000001',true);
do $$ begin assert profile_visible('fa710000-0000-4000-8000-000000000002'), 'recent sent result remains viewable'; end $$;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000002',true);
do $$ begin assert not profile_visible('fa710000-0000-4000-8000-000000000001'), 'processed received request removed'; end $$;
reset role;
update requests set responded_at=now()-interval '25 hours' where from_id='fa710000-0000-4000-8000-000000000001';
update sessions set status='cancelled',starts_at=now()-interval '10 hours',ends_at=now()-interval '8 hours'
where id='fa710000-0000-4000-8000-000000000010';
set local role authenticated;
select set_config('request.jwt.claim.sub','fa710000-0000-4000-8000-000000000001',true);
do $$ begin
 assert not profile_visible('fa710000-0000-4000-8000-000000000002'), 'sent result expires after 24 hours';
 assert profile_visible('fa710000-0000-4000-8000-000000000004','fa710000-0000-4000-8000-000000000010'), 'recent cancelled signup retains host profile link';
end $$;
reset role;
update sessions set starts_at=now()-interval '25 hours',ends_at=now()-interval '23 hours'
where id='fa710000-0000-4000-8000-000000000010';
set local role authenticated;
do $$ begin
 assert not profile_visible('fa710000-0000-4000-8000-000000000004','fa710000-0000-4000-8000-000000000010'), 'expired signup no longer grants host access';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin assert not profile_visible('fa710000-0000-4000-8000-000000000001'); end $$;
reset role;
rollback;
