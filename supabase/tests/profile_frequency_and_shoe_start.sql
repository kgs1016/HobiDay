begin;
insert into auth.users(id) values
 ('fc100000-0000-4000-8000-000000000001'),('fc100000-0000-4000-8000-000000000002'),
 ('fc100000-0000-4000-8000-000000000003'),('fc100000-0000-4000-8000-000000000004');
insert into profiles(id,nickname,gender,age,area,level,career,home_gym,is_public,photo)
select id,'frequency-test','f',25,'test',1,2,'test',id<>'fc100000-0000-4000-8000-000000000003','test/photo.webp'
from auth.users where id in ('fc100000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);
do $$declare p jsonb; saved_date text; begin
  assert not has_table_privilege('authenticated','climbing_shoe_starts','insert');
  assert not has_table_privilege('authenticated','climbing_shoe_starts','update');
  assert not has_table_privilege('authenticated','climbing_shoe_starts','delete');
  assert not has_function_privilege('authenticated','climbing_progress_for_v5(uuid)','execute');
  assert not has_function_privilege('anon','climbing_shoe_start_set(text)','execute');
  assert not has_function_privilege('anon','climbing_shoe_start_reset(text)','execute');
  assert not has_function_privilege('anon','climbing_progress_v5()','execute');
  assert not has_function_privilege('anon','public_climbing_achievements_v5(uuid[],uuid)','execute');
  assert not has_function_privilege('anon','user_profile_v2(uuid,uuid)','execute');
  assert user_profile_v2(auth.uid())->'visit_frequency'='null'::jsonb;
  update profiles set visit_frequency=3 where id=auth.uid();
  assert user_profile_v2(auth.uid())->>'visit_frequency'='3';
  update profiles set visit_frequency=null where id=auth.uid();
  assert user_profile_v2(auth.uid())->'visit_frequency'='null'::jsonb;
  begin update profiles set visit_frequency=5 where id=auth.uid(); raise exception 'invalid frequency accepted'; exception when check_violation then null; end;
  begin update profiles set visit_frequency=0 where id=auth.uid(); raise exception 'invalid frequency accepted'; exception when check_violation then null; end;
  p:=climbing_progress_v5();
  assert p->>'can_set_start'='true' and p->>'can_reset_start'='false' and p->>'stage'='white';
  assert climbing_shoe_start_set('gold')->>'error'='bad_stage';
  assert climbing_shoe_start_set(null)->>'error'='bad_stage';
  assert climbing_shoe_start_set('purple')->>'ok'='true';
  p:=climbing_progress_v5();
  assert p->>'stage'='purple' and p->>'stage_source'='starting';
  assert p->>'can_set_start'='false' and p->>'can_reset_start'='true' and p->>'points'='0' and p->>'total'='0';
  assert p->'difficulty_counts'='{}'::jsonb and p->>'policy'='color-v2';
  saved_date:=p->'starting_shoe'->>'expires_on';
  assert saved_date=(((now() at time zone 'Asia/Seoul')::date+interval '3 months')::date)::text;
  assert climbing_shoe_start_set('purple')->>'ok'='true', 'same choice retry is idempotent';
  assert climbing_shoe_start_set('black')->>'error'='already_set';
  assert climbing_progress_v5()->'starting_shoe'->>'expires_on'=saved_date;
  assert climbing_shoe_start_reset('gold')->>'error'='bad_stage';
  assert climbing_shoe_start_reset('purple')->>'error'='same_stage';
  assert climbing_shoe_start_reset('blue')->>'ok'='true';
  p:=climbing_progress_v5();
  assert p->>'stage'='blue' and p->>'stage_source'='starting';
  assert p->>'can_reset_start'='false' and p->>'points'='0' and p->>'total'='0';
  assert p->'starting_shoe'->>'expires_on'=saved_date;
  assert climbing_shoe_start_reset('red')->>'error'='reset_used';
  assert climbing_shoe_start_reset('blue')->>'ok'='true', 'lost response retry returns saved correction';
  assert climbing_progress_v5()->'starting_shoe'->>'expires_on'=saved_date;
  assert climbing_progress_v4()->>'points'='0', 'legacy actual achievement unchanged';
  assert (select stage from public_climbing_achievements_v4(array[auth.uid()]))='white';
  assert (select count(*) from climbing_shoe_starts)=1;
end $$;
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000002',true);
do $$declare r record; begin
  assert (select count(*) from climbing_shoe_starts)=0, 'start metadata is private';
  select * into r from public_climbing_achievements_v5(array['fc100000-0000-4000-8000-000000000001'::uuid]);
  assert r.stage='blue' and r.stage_source='starting' and r.total=0;
  assert (select count(*) from jsonb_object_keys(to_jsonb(r)))=4, 'no dates or private records exposed';
  assert (select count(*) from public_climbing_achievements_v5(array['fc100000-0000-4000-8000-000000000003'::uuid]))=0;
  assert user_profile_v2('fc100000-0000-4000-8000-000000000003')->>'error'='not_found';
  assert climbing_progress_v5()->>'can_set_start'='true', 'a different account has its own choice';
end $$;
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000004',true);
do $$begin
  assert climbing_shoe_start_set('blue')->>'error'='no_profile';
  assert climbing_shoe_start_reset('blue')->>'error'='no_profile';
  assert climbing_progress_v5()->>'can_set_start'='false';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$begin
  assert climbing_shoe_start_set('blue')->>'error'='no_auth';
  assert climbing_shoe_start_reset('blue')->>'error'='no_auth';
  assert (select count(*) from public_climbing_achievements_v5(array['fc100000-0000-4000-8000-000000000001'::uuid]))=0;
end $$;
reset role;
-- Real record aggregation catches up and can exceed the initially chosen stage.
insert into climbing_ascent_batches(id,user_id,gym,completed_on)
values('fc100000-0000-4000-8000-000000000010','fc100000-0000-4000-8000-000000000001','피커스 구로점',(now() at time zone 'Asia/Seoul')::date);
insert into climbing_ascents(id,user_id,gym,batch_id,color,quantity)
values('fc100000-0000-4000-8000-000000000011','fc100000-0000-4000-8000-000000000001','피커스 구로점','fc100000-0000-4000-8000-000000000010','보라',50);
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);
do $$begin
  assert climbing_progress_v5()->>'stage'='purple';
  assert climbing_progress_v5()->>'stage_source'='records';
  assert climbing_progress_v5()->>'points'='1300' and climbing_progress_v5()->>'total'='50';
end $$;
update climbing_ascents set gym='기타',color='검정',manual_difficulty=11,quantity=79
where id='fc100000-0000-4000-8000-000000000011';
do $$begin assert climbing_progress_v5()->>'stage'='black'; end $$;
delete from climbing_ascent_batches where id='fc100000-0000-4000-8000-000000000010';
-- Same selection retry cannot renew an expired start. A brand-new different color also fails.
update climbing_shoe_starts set expires_on=(now() at time zone 'Asia/Seoul')::date
where user_id='fc100000-0000-4000-8000-000000000001';
do $$begin
  assert climbing_progress_v5()->>'stage'='white' and climbing_progress_v5()->>'stage_source'='records';
  assert climbing_shoe_start_set('blue')->'progress'->>'stage'='white';
  assert climbing_shoe_start_set('purple')->>'error'='already_set';
  assert climbing_shoe_start_reset('purple')->>'error'='reset_used';
  assert climbing_progress_v5()->>'can_set_start'='false' and climbing_progress_v5()->>'can_reset_start'='false';
  assert climbing_display_stage_v1('white','purple','2026-12-10','2026-12-09')='purple';
  assert climbing_display_stage_v1('white','purple','2026-12-10','2026-12-10')='white';
  assert climbing_display_stage_v1('black','purple','2026-12-10','2026-12-09')='black';
end $$;
-- Existing visibility and blocking still govern both new RPCs.
insert into blocks(blocker_id,blocked_id) values('fc100000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000002',true);
do $$begin
  assert (select count(*) from public_climbing_achievements_v5(array['fc100000-0000-4000-8000-000000000001'::uuid]))=0;
  assert user_profile_v2('fc100000-0000-4000-8000-000000000001')->>'error'='not_found';
end $$;
delete from profiles where id='fc100000-0000-4000-8000-000000000001';
do $$begin assert (select count(*) from climbing_shoe_starts)=1, 'profile deletion alone cannot reset choice'; end $$;
insert into profiles(id,nickname,gender,age,area,level,home_gym)
values('fc100000-0000-4000-8000-000000000001','recreated','f',25,'test',1,'test');
select set_config('request.jwt.claim.sub','fc100000-0000-4000-8000-000000000001',true);
do $$begin assert climbing_shoe_start_set('black')->>'error'='already_set'; end $$;
delete from auth.users where id='fc100000-0000-4000-8000-000000000001';
do $$begin assert (select count(*) from climbing_shoe_starts)=0, 'full account deletion cleans up start'; end $$;
rollback;
