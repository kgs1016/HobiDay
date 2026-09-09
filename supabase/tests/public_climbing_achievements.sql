-- 기존 데이터에 영향을 주지 않도록 테스트 계정·모임·완등은 모두 롤백한다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
insert into auth.users(id) values
 ('fa700000-0000-4000-8000-000000000001'), ('fa700000-0000-4000-8000-000000000002'),
 ('fa700000-0000-4000-8000-000000000003'), ('fa700000-0000-4000-8000-000000000004'),
 ('fa700000-0000-4000-8000-000000000005');
insert into profiles(id,nickname,gender,age,area,level,career,height,home_gym,is_public,photo) values
 ('fa700000-0000-4000-8000-000000000001','shoe-viewer','m',25,'test',5,6,170,'test',false,'test/viewer.webp'),
 ('fa700000-0000-4000-8000-000000000002','shoe-public','f',25,'test',1,1,170,'test',true,'test/public.webp'),
 ('fa700000-0000-4000-8000-000000000003','shoe-private','m',25,'test',5,6,170,'test',false,'test/private.webp'),
 ('fa700000-0000-4000-8000-000000000004','shoe-empty','f',25,'test',5,6,170,'test',true,'test/empty.webp'),
 ('fa700000-0000-4000-8000-000000000005','shoe-unrelated','f',25,'test',1,1,170,'test',false,'test/unrelated.webp');
insert into climbing_ascents(id,user_id,gym,problem,v_grade)
select gen_random_uuid(), 'fa700000-0000-4000-8000-000000000002', 'private gym', 'problem-'||n,
  case when n <= 6 then 4 when n <= 9 then 5 when n = 10 then 6 when n <= 30 then 1 else null end
from generate_series(1,32) n;
insert into sessions(id,host_id,gym,starts_at,ends_at,capacity,level_min,level_max,age_min,age_max,status)
values ('fa700000-0000-4000-8000-000000000010','fa700000-0000-4000-8000-000000000003','test',
  now()+interval '1 day',now()+interval '1 day 2 hours',2,1,5,20,39,'confirmed');
insert into signups(session_id,user_id,gender,status) values
 ('fa700000-0000-4000-8000-000000000010','fa700000-0000-4000-8000-000000000001','m','confirmed'),
 ('fa700000-0000-4000-8000-000000000010','fa700000-0000-4000-8000-000000000003','m','confirmed');

set local role authenticated;
select set_config('request.jwt.claim.sub','fa700000-0000-4000-8000-000000000001',true);
do $$
declare r record; expectation record; last_id uuid; ascent json;
begin
  assert not has_table_privilege('authenticated','climbing_ascents','SELECT'), 'raw records remain private';
  assert not has_function_privilege('anon','public_climbing_achievements(uuid[],uuid)','execute'), 'anonymous execution denied';
  select * into r from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000002'::uuid]);
  assert r.stage = 'blue' and r.total = 32, 'mixed/higher grades and unknown-grade total';
  assert (select count(*) from jsonb_object_keys(to_jsonb(r))) = 3, 'only user id, stage and total are exposed';
  assert (select count(*) from public_climbing_achievements(array[
    'fa700000-0000-4000-8000-000000000002'::uuid,'fa700000-0000-4000-8000-000000000002'::uuid])) = 1, 'duplicate ids counted once';
  -- profile_visible 통합 뒤에는 확정 모임을 함께한 상대는 별도 모임 ID 없이도 보인다.
  assert (select count(*) from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000003'::uuid])) = 1, 'confirmed co-member remains visible';
  assert (select count(*) from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000005'::uuid])) = 0, 'unrelated private profile hidden';
  assert (select count(*) from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000099'::uuid])) = 0, 'missing profile hidden';
  select * into r from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000004'::uuid]);
  assert r.stage = 'white' and r.total = 0, 'experienced user with no records is not assigned a skill color';
  assert (select count(*) from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000003'::uuid],
    'fa700000-0000-4000-8000-000000000010')) = 1, 'visible session member can expose summary';
  assert (select count(*) from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000005'::uuid],
    'fa700000-0000-4000-8000-000000000099')) = 0, 'invalid session does not bypass private profile';
  assert (select count(*) from public_climbing_achievements(null)) = 0, 'empty request';
  begin
    perform public_climbing_achievements(array_fill('fa700000-0000-4000-8000-000000000002'::uuid,array[101]));
    raise exception 'oversized request accepted';
  exception when invalid_parameter_value then null;
  end;

  -- 자기신고 수준·구력과 무관하게 모든 승급 경계와 기록 삭제를 검증한다.
  for expectation in select * from (values
    ('yellow',1,3),('orange',2,5),('green',3,8),('blue',4,10),('purple',6,12),('black',8,15)
  ) as stages(color,grade,required) loop
    for n in 1..expectation.required loop
      last_id := gen_random_uuid();
      assert climbing_ascent_save(last_id,'test','threshold-'||n,expectation.grade)->>'ok' = 'true';
      if n = expectation.required - 1 then
        assert (select stage from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000001'::uuid])) <> expectation.color, 'below threshold';
      end if;
    end loop;
    select * into r from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000001'::uuid]);
    assert r.stage = expectation.color and r.total = expectation.required, 'exact threshold';
    perform climbing_ascent_delete(last_id);
    assert (select stage from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000001'::uuid])) <> expectation.color, 'deletion recalculates';
    for ascent in select * from json_array_elements(climbing_ascent_list()) loop
      perform climbing_ascent_delete((ascent->>'id')::uuid);
    end loop;
  end loop;
  assert climbing_ascent_save(gen_random_uuid(),'test','unknown',null)->>'ok' = 'true';
  select * into r from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000001'::uuid]);
  assert r.stage = 'white' and r.total = 1, 'unknown grade never promotes';
end $$;

reset role;
insert into blocks(blocker_id,blocked_id) values
 ('fa700000-0000-4000-8000-000000000002','fa700000-0000-4000-8000-000000000001'),
 ('fa700000-0000-4000-8000-000000000001','fa700000-0000-4000-8000-000000000004'),
 ('fa700000-0000-4000-8000-000000000003','fa700000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ begin
  assert (select count(*) from public_climbing_achievements(array[
    'fa700000-0000-4000-8000-000000000002'::uuid,
    'fa700000-0000-4000-8000-000000000003'::uuid,
    'fa700000-0000-4000-8000-000000000004'::uuid],
    'fa700000-0000-4000-8000-000000000010')) = 0, 'blocking either direction overrides public and session access';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert (select count(*) from public_climbing_achievements(array['fa700000-0000-4000-8000-000000000002'::uuid])) = 0, 'missing identity never exposes summaries';
end $$;
reset role;
rollback;
