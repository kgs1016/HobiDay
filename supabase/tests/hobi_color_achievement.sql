begin;
set local statement_timeout='30s';
-- 비공개 순수 계산 정책: 점수만 또는 개수만으로 승급하지 못한다.
do $$
declare r record; c jsonb; g record; alias text;
begin
  for r in select * from (values
    ('green',4,5,50,5),('blue',5,10,160,8),('red',6,15,360,12),('pink',7,20,720,18),
    ('purple',8,25,1300,26),('gray',9,30,2200,36),('brown',10,35,3500,50),('black',11,40,5500,70)
  ) s(stage,level,n,points,weight) loop
    c:=jsonb_build_object(r.level::text,r.n,'1',r.points-r.n*r.weight);
    assert climbing_shoe_stage_v3(c)=r.stage, 'both conditions exactly';
    assert climbing_shoe_stage_v3(c||jsonb_build_object('1',r.points-r.n*r.weight-1))<>r.stage, 'one point short';
    assert climbing_shoe_stage_v3(jsonb_build_object(r.level::text,r.n-1,'1',r.points))<>r.stage, 'difficulty count missing';
  end loop;
  assert climbing_shoe_stage_v3('{"1":10000,"unknown":500}')='white';
  for g in select * from hobi_difficulty_brands_v1 loop
    foreach alias in array g.aliases loop
      assert hobi_color_level_v1(alias,g.colors[1])=1;
      assert hobi_color_level_v1(alias,g.colors[cardinality(g.colors)])=11;
    end loop;
  end loop;
  assert hobi_color_level_v1('더클라임 강남점','파랑')=5;
  assert hobi_color_level_v1('메트로락','빨강')=1;
  assert hobi_color_level_v1('피커스 구로점','보라')=8;
  assert hobi_color_level_v1('더클라임뉴스','파랑') is null;
end $$;
insert into auth.users(id) values
 ('ac310000-0000-4000-8000-000000000001'),('ac310000-0000-4000-8000-000000000002'),
 ('ac310000-0000-4000-8000-000000000003');
insert into profiles(id,nickname,gender,age,area,level,career,height,home_gym,is_public,photo) values
 ('ac310000-0000-4000-8000-000000000001','hobi-owner','m',25,'test',1,1,170,'test',true,'test/owner.webp'),
 ('ac310000-0000-4000-8000-000000000002','hobi-viewer','f',25,'test',1,1,170,'test',true,'test/viewer.webp'),
 ('ac310000-0000-4000-8000-000000000003','hobi-private','m',25,'test',1,1,170,'test',false,'test/private.webp');
set local role authenticated;
select set_config('request.jwt.claim.sub','ac310000-0000-4000-8000-000000000001',true);
do $$
declare bid uuid:='ac310000-0000-4000-8000-000000000010';
  uid uuid:='ac310000-0000-4000-8000-000000000001';
  today date:=(now() at time zone 'Asia/Seoul')::date;
  start_date date:=(today-interval '3 months')::date;
  r record; p jsonb; bad jsonb;
begin
  assert not has_table_privilege('authenticated','hobi_difficulty_brands_v1','UPDATE');
  assert not has_table_privilege('authenticated','hobi_difficulty_brands_v1','SELECT');
  assert not has_function_privilege('authenticated','climbing_progress_for_v3(uuid)','execute');
  assert not has_function_privilege('anon','climbing_progress_v3()','execute');
  assert not has_function_privilege('anon','climbing_ascent_history_v2(timestamptz,uuid,integer)','execute');
  assert not has_function_privilege('anon','climbing_ascent_batch_save_v2(uuid,text,date,text,jsonb,uuid)','execute');
  -- V미등록 브랜드도 색상만으로 점수와 단계 계산.
  assert climbing_ascent_batch_save_v2(bid,'피커스 구로점',today,'peakers',
    '[{"color":"보라","quantity":50,"v_grade":null}]')->>'ok'='true';
  p:=climbing_progress_v3();
  assert p->'difficulty_counts'->>'8'='50' and p->>'points'='1300';
  assert p->'grade_counts'->>'unknown'='50', 'no fabricated V grade';
  assert p->>'policy'='color-v1';
  select * into r from public_climbing_achievements_v3(array[uid]);
  assert r.stage='purple' and r.total=50;
  assert (select count(*) from jsonb_object_keys(to_jsonb(r)))=3, 'only public summary';
  assert (select stage from public_climbing_achievements_v2(array[uid]))='white', 'v2 semantics unchanged';
  -- 범위/다른 계정/기존 묶음의 원자성을 유지한다.
  for bad in select value from jsonb_array_elements('[
    [{"color":"보라","quantity":1,"manual_difficulty":11}],
    [{"color":"민트","quantity":1,"manual_difficulty":12}],
    [{"color":"민트","quantity":1,"manual_difficulty":1.5}],
    [{"color":"민트","quantity":1,"manual_difficulty":"7"}]
  ]') loop
    assert climbing_ascent_batch_save_v2(bid,'피커스 구로점',today,'peakers',bad)->>'error'='bad_input';
    assert climbing_progress_v3()->>'points'='1300';
  end loop;
  assert climbing_ascent_batch_save_v2(bid,'피커스 구로점',today,'peakers','{}')->>'error'='bad_input';
  -- 클라이언트가 점수/난이도/V값을 조작해 보내도 등록 색상 기준 우선.
  assert climbing_ascent_batch_save_v2(bid,'더클라임 강남점',today,'theclimb',
    '[{"color":"흰색","quantity":10,"v_grade":17,"hobi_level":11,"points":99999}]')->>'ok'='true';
  assert climbing_progress_v3()->>'points'='10';
  -- 기타 H 직접 입력과 V참고 기록은 서로 독립. 색상 미상 V기록은 호환 배점.
  assert climbing_ascent_batch_save_v2(bid,'우리동네 새암장',start_date,null,
    '[{"color":"민트","quantity":20,"manual_difficulty":7},{"color":"검정","quantity":2,"v_grade":3},{"color":"투톤","quantity":3}]')->>'ok'='true';
  p:=climbing_progress_v3();
  assert p->>'points'='376' and p->>'total'='25';
  assert p->'difficulty_counts'->>'unknown'='3';
  assert climbing_ascent_history_v2()->0->'items'->0->>'manual_difficulty'='7';
  -- 같은 요청 재시도는 개수를 늘리지 않는다.
  assert climbing_ascent_batch_save_v2(bid,'우리동네 새암장',start_date,null,
    '[{"color":"민트","quantity":20,"manual_difficulty":7},{"color":"검정","quantity":2,"v_grade":3},{"color":"투톤","quantity":3}]')->>'ok'='true';
  assert climbing_progress_v3()->>'total'='25';
  assert climbing_ascent_batch_save_v2(bid,'우리동네 새암장',start_date-1,null,
    '[{"color":"민트","quantity":20,"manual_difficulty":7}]')->>'ok'='true';
  assert climbing_progress_v3()->>'points'='0' and climbing_progress_v3()->>'total'='20';
  assert climbing_ascent_batch_save_v2(bid,'우리동네 새암장',today+1,null,
    '[{"color":"민트","quantity":20,"manual_difficulty":7}]')->>'error'='bad_input';
  assert (select stage from public_climbing_achievements_v3(array[uid]))='white';
  assert climbing_ascent_batch_delete(bid)->>'ok'='true';
  -- 날짜 없는 기존 기록에서 완등일을 임의로 만들지 않는다.
  assert climbing_ascent_save(bid,'test','legacy',9)->>'ok'='true';
  assert climbing_progress_v3()->>'undated_total'='1' and climbing_progress_v3()->>'points'='0';
  assert climbing_ascent_batch_save_v2(bid,'test',today,null,
    '[{"color":"민트","quantity":79,"manual_difficulty":11}]',bid)->>'ok'='true';
  assert (select stage from public_climbing_achievements_v3(array[uid]))='black';
  assert (select count(*) from public_climbing_achievements_v3(array[uid,uid]))=1;
  assert (select count(*) from public_climbing_achievements_v3(array['ac310000-0000-4000-8000-000000000003'::uuid]))=0;
  begin
    perform public_climbing_achievements_v3(array_fill(uid,array[101]));
    raise exception 'oversized request accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
select set_config('request.jwt.claim.sub','ac310000-0000-4000-8000-000000000002',true);
do $$ begin
  assert climbing_ascent_batch_save_v2('ac310000-0000-4000-8000-000000000010','test',(now() at time zone 'Asia/Seoul')::date,null,
    '[{"color":"민트","quantity":1,"manual_difficulty":1}]')->>'error'='not_mine';
  assert json_array_length(climbing_ascent_history_v2())=0;
end $$;
reset role;
insert into blocks(blocker_id,blocked_id) values ('ac310000-0000-4000-8000-000000000001','ac310000-0000-4000-8000-000000000002');
set local role authenticated;
do $$ begin
  assert (select count(*) from public_climbing_achievements_v3(array['ac310000-0000-4000-8000-000000000001'::uuid]))=0;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert climbing_progress_v3()->>'points'='0';
  assert (select count(*) from public_climbing_achievements_v3(array['ac310000-0000-4000-8000-000000000001'::uuid]))=0;
end $$;
reset role;
rollback;
