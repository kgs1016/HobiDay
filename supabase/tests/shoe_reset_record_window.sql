begin;
insert into auth.users(id) values ('fc300000-0000-4000-8000-000000000001'),('fc300000-0000-4000-8000-000000000002');
insert into profiles(id,nickname,gender,age,area,level,home_gym,is_public)
select id,'window-test','f',25,'test',1,'test',true from auth.users where id in
 ('fc300000-0000-4000-8000-000000000001','fc300000-0000-4000-8000-000000000002');
insert into climbing_ascent_batches(id,user_id,gym,completed_on,created_at)
values ('fc300000-0000-4000-8000-000000000010','fc300000-0000-4000-8000-000000000001','기타',
 (now() at time zone 'Asia/Seoul')::date,now()-interval '1 minute');
insert into climbing_ascents(id,user_id,gym,batch_id,color,quantity,manual_difficulty)
values ('fc300000-0000-4000-8000-000000000011','fc300000-0000-4000-8000-000000000001','기타',
 'fc300000-0000-4000-8000-000000000010','H11',79,11);
select set_config('request.jwt.claim.sub','fc300000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare p jsonb; begin
  assert not has_function_privilege('authenticated','climbing_progress_since_reset_v1(uuid)','execute');
  assert not has_function_privilege('anon','climbing_progress_since_reset_v1(uuid)','execute');
  p:=climbing_progress_v5();
  assert p->>'stage'='black';
  assert p-ARRAY['starting_shoe','can_set_start','can_reset_start','stage','stage_source']=climbing_progress_v4(), 'no reset keeps prior aggregation';
  assert climbing_shoe_start_set('pink')->>'ok'='true';
  assert climbing_shoe_start_reset('blue')->>'ok'='true';
  p:=climbing_progress_v5();
  assert p->>'stage'='blue' and p->>'points'='0' and p->>'recent_total'='0';
  assert p->>'total'='79', 'old ascents remain in history';
  assert p->'difficulty_counts'='{}'::jsonb and p->'grade_counts'='{}'::jsonb;
  assert p->>'period_start'=((now() at time zone 'Asia/Seoul')::date)::text;
  assert climbing_progress_v4()->>'points'='5530', 'legacy RPC remains compatible';
  assert climbing_shoe_start_reset('blue')->>'ok'='true';
  assert climbing_progress_v5()->>'recent_total'='0';
end $$;
reset role;
-- Editing an old batch does not move it into the new accumulation period.
update climbing_ascents set quantity=80,created_at=now() where id='fc300000-0000-4000-8000-000000000011';
do $$begin assert climbing_progress_v5()->>'points'='0'; end $$;
-- New entry saved after reset but backdated before reset must also be excluded.
insert into climbing_ascent_batches(id,user_id,gym,completed_on)
values ('fc300000-0000-4000-8000-000000000020','fc300000-0000-4000-8000-000000000001','기타',(now() at time zone 'Asia/Seoul')::date-1),
 ('fc300000-0000-4000-8000-000000000030','fc300000-0000-4000-8000-000000000001','기타',(now() at time zone 'Asia/Seoul')::date);
insert into climbing_ascents(id,user_id,gym,batch_id,color,quantity,manual_difficulty)
values ('fc300000-0000-4000-8000-000000000021','fc300000-0000-4000-8000-000000000001','기타','fc300000-0000-4000-8000-000000000020','H11',79,11),
 ('fc300000-0000-4000-8000-000000000031','fc300000-0000-4000-8000-000000000001','기타','fc300000-0000-4000-8000-000000000030','H8',50,8);
set local role authenticated;
do $$declare p jsonb; begin
  p:=climbing_progress_v5();
  assert p->>'stage'='purple' and p->>'stage_source'='records', 'qualifying records promote immediately';
  assert p->>'points'='1300' and p->>'recent_total'='50' and p->>'total'='209';
  assert p->'difficulty_counts'='{"8":50}'::jsonb;
  assert p->'grade_counts'='{"unknown":50}'::jsonb;
end $$;
reset role;
insert into climbing_ascents(id,user_id,gym,batch_id,color,quantity,manual_difficulty)
values ('fc300000-0000-4000-8000-000000000032','fc300000-0000-4000-8000-000000000001','기타','fc300000-0000-4000-8000-000000000030','H1',1,1);
do $$begin
  assert climbing_progress_v5()->>'stage'='purple', 'one easy problem cannot downgrade an earned stage';
  assert climbing_progress_v5()->>'points'='1301';
end $$;
select set_config('request.jwt.claim.sub','fc300000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$begin
  assert climbing_progress_v5()->>'total'='0', 'reset boundaries remain per-account';
  assert (select stage from public_climbing_achievements_v5(array['fc300000-0000-4000-8000-000000000001'::uuid]))='purple';
end $$;
reset role;
-- Once reset is older than three months, the rolling window continues normally.
update climbing_shoe_starts set reset_used_at=now()-interval '5 months',expires_on=(now() at time zone 'Asia/Seoul')::date-1
where user_id='fc300000-0000-4000-8000-000000000001';
update climbing_ascent_batches set completed_on=((now() at time zone 'Asia/Seoul')::date-interval '4 months')::date
where id in ('fc300000-0000-4000-8000-000000000010','fc300000-0000-4000-8000-000000000020');
select set_config('request.jwt.claim.sub','fc300000-0000-4000-8000-000000000001',true);
do $$declare p jsonb; begin
  p:=climbing_progress_v5();
  assert p->>'points'='1301' and p->>'total'='210';
  assert p->>'period_start'=(((now() at time zone 'Asia/Seoul')::date-interval '3 months')::date)::text;
end $$;
rollback;
