begin;
insert into auth.users(id) values ('fc200000-0000-4000-8000-000000000001');
insert into profiles(id,nickname,gender,age,area,level,home_gym)
values ('fc200000-0000-4000-8000-000000000001','reset-test','f',25,'test',1,'test');
insert into climbing_shoe_starts(user_id,stage,selected_at,expires_on)
values ('fc200000-0000-4000-8000-000000000001','black',now()-interval '1 month',
  ((now() at time zone 'Asia/Seoul')::date+interval '2 months')::date);
insert into climbing_ascent_batches(id,user_id,gym,completed_on)
values ('fc200000-0000-4000-8000-000000000010','fc200000-0000-4000-8000-000000000001','기타',(now() at time zone 'Asia/Seoul')::date);
insert into climbing_ascents(id,user_id,gym,batch_id,color,quantity,manual_difficulty)
values ('fc200000-0000-4000-8000-000000000011','fc200000-0000-4000-8000-000000000001','기타','fc200000-0000-4000-8000-000000000010','보라',50,8);
select set_config('request.jwt.claim.sub','fc200000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare before jsonb; after jsonb; saved timestamptz; begin
  before:=climbing_progress_v5();
  assert climbing_shoe_start_reset('blue')->>'ok'='true';
  after:=climbing_progress_v5();
  assert after->>'stage'='purple', 'earned stage wins over corrected starting color';
  assert after->>'points'=before->>'points' and after->>'total'=before->>'total';
  assert after->'difficulty_counts'=before->'difficulty_counts' and after->>'period_start'=before->>'period_start';
  assert after->'starting_shoe'->>'expires_on'=(((now() at time zone 'Asia/Seoul')::date+interval '3 months')::date)::text;
  select selected_at into saved from climbing_shoe_starts where user_id=auth.uid();
  assert saved=now();
  assert climbing_shoe_start_reset('blue')->>'ok'='true';
  assert (select selected_at from climbing_shoe_starts where user_id=auth.uid())=saved;
end $$;
reset role;
update climbing_shoe_starts set reset_used_at=null,expires_on=(now() at time zone 'Asia/Seoul')::date
where user_id='fc200000-0000-4000-8000-000000000001';
set local role authenticated;
do $$begin
  assert climbing_shoe_start_reset('red')->>'error'='expired';
  assert climbing_progress_v5()->>'can_reset_start'='false';
end $$;
rollback;
