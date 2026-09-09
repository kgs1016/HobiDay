-- 새 정책의 기간 경계·수정·공개 범위와 v1 설치 앱 호환성을 검증한다.
begin;
set local statement_timeout='30s';
insert into auth.users(id) values
 ('fa900000-0000-4000-8000-000000000001'),('fa900000-0000-4000-8000-000000000002'),
 ('fa900000-0000-4000-8000-000000000003'),('fa900000-0000-4000-8000-000000000004');
insert into profiles(id,nickname,gender,age,area,level,career,height,home_gym,is_public,photo) values
 ('fa900000-0000-4000-8000-000000000001','rolling-owner','m',25,'test',1,1,170,'test',true,'test/owner.webp'),
 ('fa900000-0000-4000-8000-000000000002','rolling-viewer','f',25,'test',1,1,170,'test',true,'test/viewer.webp'),
 ('fa900000-0000-4000-8000-000000000003','rolling-private','m',25,'test',1,1,170,'test',false,'test/private.webp'),
 ('fa900000-0000-4000-8000-000000000004','rolling-empty','f',25,'test',1,1,170,'test',true,'test/empty.webp');

set local role authenticated;
select set_config('request.jwt.claim.sub','fa900000-0000-4000-8000-000000000001',true);
do $$
declare r record; expectation record; p jsonb;
  batch uuid := 'fa900000-0000-4000-8000-000000000010';
  legacy uuid := 'fa900000-0000-4000-8000-000000000011';
  today date := (now() at time zone 'Asia/Seoul')::date;
  start_date date := (today - interval '3 months')::date;
  owner_id uuid := 'fa900000-0000-4000-8000-000000000001';
begin
  assert not has_function_privilege('authenticated','climbing_progress_for_v2(uuid)','execute'), 'cannot request arbitrary private history';
  assert not has_function_privilege('anon','climbing_progress_v2()','execute'), 'anonymous own summary denied';
  assert not has_function_privilege('anon','public_climbing_achievements_v2(uuid[],uuid)','execute'), 'anonymous public summary denied';
  p := climbing_progress_v2();
  assert (p->>'total')::int=0 and p->'grade_counts'='{}'::jsonb;
  assert (p->>'period_start')::date=start_date and (p->>'period_end')::date=today;
  for expectation in select * from (values
    ('green',2,5),('blue',3,10),('red',4,15),('pink',5,20),
    ('purple',6,25),('gray',7,30),('brown',8,35),('black',9,40)
  ) as stages(color,grade,required) loop
    assert climbing_ascent_batch_save(batch,'test',today,null,
      jsonb_build_array(jsonb_build_object('color','기타','v_grade',expectation.grade,'quantity',expectation.required-1)))->>'ok'='true';
    assert (select stage from public_climbing_achievements_v2(array[owner_id]))<>expectation.color, 'below threshold';
    assert climbing_ascent_batch_save(batch,'test',today,null,
      jsonb_build_array(jsonb_build_object('color','기타','v_grade',expectation.grade,'quantity',expectation.required)))->>'ok'='true';
    p := climbing_progress_v2();
    select * into r from public_climbing_achievements_v2(array[owner_id]);
    assert r.stage=expectation.color and r.total=expectation.required, 'all nine stages exact boundary';
    assert (p->>'recent_total')::int=r.total and (p->'grade_counts'->>expectation.grade::text)::int=r.total, 'own/public parity';
    perform climbing_ascent_batch_delete(batch);
    assert (select stage from public_climbing_achievements_v2(array[owner_id]))='white', 'delete recomputes';
  end loop;

  -- 시작 날짜는 포함, 하루 전·미래·완등일 없는 기록은 단계에서 제외한다.
  assert climbing_ascent_batch_save(batch,'test',start_date,null,
    '[{"color":"핑크","v_grade":5,"quantity":20},{"color":"기타","v_grade":null,"quantity":7}]')->>'ok'='true';
  select * into r from public_climbing_achievements_v2(array[owner_id]);
  assert r.stage='pink' and r.total=27;
  assert (climbing_progress_v2()->>'recent_total')::int=27, 'unknown V included in recent/lifetime totals';
  assert climbing_ascent_batch_save(batch,'test',start_date-1,null,
    '[{"color":"핑크","v_grade":5,"quantity":20},{"color":"기타","v_grade":null,"quantity":7}]')->>'ok'='true';
  p := climbing_progress_v2();
  assert (p->>'total')::int=27 and (p->>'recent_total')::int=0 and p->'grade_counts'='{}'::jsonb, 'expired record retained';
  assert json_array_length(climbing_ascent_history())=1;
  assert (select stage from public_climbing_achievements_v2(array[owner_id]))='white', 'backdated edit recomputes';
  assert climbing_ascent_batch_save(batch,'test',today+1,null,
    '[{"color":"핑크","v_grade":5,"quantity":20}]')->>'error'='bad_input', 'future rejected';
  assert (climbing_progress_v2()->>'total')::int=27, 'invalid edit atomic';
  perform climbing_ascent_batch_delete(batch);

  assert climbing_ascent_save(legacy,'test','legacy',9)->>'ok'='true';
  p := climbing_progress_v2();
  assert (p->>'undated_total')::int=1 and (p->>'recent_total')::int=0, 'created_at is not completion date';
  assert climbing_ascent_batch_save(legacy,'test',today,null,
    '[{"color":"검정","v_grade":9,"quantity":40}]',legacy)->>'ok'='true';
  assert (climbing_progress_v2()->>'undated_total')::int=0;
  assert (select stage from public_climbing_achievements_v2(array[owner_id]))='black', 'experienced member can start at earned stage without resets';
  perform climbing_ascent_batch_delete(legacy);

  assert climbing_ascent_batch_save(batch,'test',today,null,
    '[{"color":"빨강","v_grade":4,"quantity":5},{"color":"핑크","v_grade":5,"quantity":6},{"color":"보라","v_grade":6,"quantity":4},{"color":"기타","v_grade":null,"quantity":99}]')->>'ok'='true';
  select * into r from public_climbing_achievements_v2(array[owner_id]);
  assert r.stage='red' and r.total=114, 'higher grades also count toward lower conditions';
  assert (select count(*) from jsonb_object_keys(to_jsonb(r)))=3, 'public returns summary only';
  assert (select stage from public_climbing_achievements(array[owner_id]))='blue', 'v1 keeps original seven colors';
  assert (climbing_progress()->>'total')::int=114, 'v1 quantity aggregation unchanged';

  assert (select count(*) from public_climbing_achievements_v2(array[owner_id,owner_id]))=1, 'duplicates removed';
  assert (select count(*) from public_climbing_achievements_v2(array['fa900000-0000-4000-8000-000000000003'::uuid]))=0, 'unrelated private account hidden';
  assert (select count(*) from public_climbing_achievements_v2(null))=0;
  assert (select count(*) from public_climbing_achievements_v2(array['fa900000-0000-4000-8000-000000000099'::uuid]))=0;
  select * into r from public_climbing_achievements_v2(array['fa900000-0000-4000-8000-000000000004'::uuid]);
  assert r.stage='white' and r.total=0;
  begin
    perform public_climbing_achievements_v2(array_fill(owner_id,array[101]));
    raise exception 'oversized request accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
insert into blocks(blocker_id,blocked_id) values
 ('fa900000-0000-4000-8000-000000000001','fa900000-0000-4000-8000-000000000002'),
 ('fa900000-0000-4000-8000-000000000004','fa900000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ begin
  assert (select count(*) from public_climbing_achievements_v2(array[
    'fa900000-0000-4000-8000-000000000002'::uuid,'fa900000-0000-4000-8000-000000000004'::uuid]))=0, 'block either direction';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert (climbing_progress_v2()->>'total')::int=0;
  assert (select count(*) from public_climbing_achievements_v2(array['fa900000-0000-4000-8000-000000000001'::uuid]))=0;
end $$;
reset role;
rollback;
