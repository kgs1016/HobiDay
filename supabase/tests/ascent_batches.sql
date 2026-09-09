-- 운영 DB에는 실행하지 않고, 마이그레이션이 적용된 임시 DB에서 롤백한다.
begin;
set local statement_timeout = '30s';
insert into auth.users(id) values ('ba7c0000-0000-4000-8000-000000000001'),('ba7c0000-0000-4000-8000-000000000002');
insert into profiles(id,nickname,gender,age,is_public) values
 ('ba7c0000-0000-4000-8000-000000000001','batch-a','m',25,false),
 ('ba7c0000-0000-4000-8000-000000000002','batch-b','f',25,false);
set local role authenticated;
select set_config('request.jwt.claim.sub','ba7c0000-0000-4000-8000-000000000001',true);
do $$
declare bid uuid := 'ba7c0000-0000-4000-8000-000000000010'; legacy uuid := 'ba7c0000-0000-4000-8000-000000000020';
  today date := (now() at time zone 'Asia/Seoul')::date; invalid jsonb; r record; history json; page2 json; last_row json;
begin
  assert not has_table_privilege('authenticated','climbing_ascent_batches','INSERT');
  assert not has_table_privilege('authenticated','climbing_ascents','SELECT');
  assert not has_function_privilege('anon','climbing_ascent_batch_save(uuid,text,date,text,jsonb,uuid)','EXECUTE');
  assert not has_function_privilege('anon','climbing_ascent_history(timestamptz,uuid,integer)','EXECUTE');
  assert climbing_ascent_save(legacy,'Gym','old problem',2)->>'ok'='true';
  assert climbing_ascent_batch_save(bid,'Gym',today,'peakers',
    '[{"color":"빨강","quantity":4,"v_grade":4},{"color":"파랑","quantity":6,"v_grade":5},{"color":"회색","quantity":2,"v_grade":null}]')->>'ok'='true';
  assert climbing_progress()->>'total'='13', 'sum quantities plus legacy row';
  select * into r from public_climbing_achievements(array[auth.uid()]);
  assert r.total=13 and r.stage='blue', 'public summary uses quantities';
  assert json_array_length(climbing_ascent_list())=1, 'old clients see only legacy records';
  history := climbing_ascent_history();
  assert json_array_length(history)=2, 'history is one row per batch plus legacy';
  assert exists(select 1 from json_array_elements(history) h where h->>'kind'='batch' and json_array_length(h->'items')=3);
  -- 같은 ID의 재시도는 전체 묶음을 교체하며 총 개수를 늘리지 않는다.
  assert climbing_ascent_batch_save(bid,'Gym',today,'peakers',
    '[{"color":"빨강","quantity":4,"v_grade":4},{"color":"파랑","quantity":6,"v_grade":5},{"color":"회색","quantity":2,"v_grade":null}]')->>'ok'='true';
  assert climbing_progress()->>'total'='13', 'retry never duplicates';
  for invalid in select value from jsonb_array_elements('[
    [],null,{},[{"color":"빨강","quantity":0}], [{"color":"빨강","quantity":-1}],
    [{"color":"빨강","quantity":1.5}], [{"color":"빨강","quantity":"2"}], [{"color":"빨강","quantity":100}],
    [{"color":"빨강","quantity":1,"v_grade":18}], [{"color":"빨강","quantity":1,"v_grade":"4"}],
    [{"color":"빨강","quantity":1},{"color":" 빨강 ","quantity":2}], [{"color":" ","quantity":1}],
    [{"color":"빨강","quantity":1},{"color":"파랑","quantity":0}]
  ]') loop
    assert climbing_ascent_batch_save(bid,'Gym',today,null,invalid)->>'error'='bad_input';
    assert climbing_progress()->>'total'='13', 'invalid whole batch preserves previous entries';
  end loop;
  assert climbing_ascent_batch_save(bid,'Gym',today+1,null,'[{"color":"빨강","quantity":1}]')->>'error'='bad_input';
  assert climbing_ascent_batch_save(bid,E'\t',today,null,'[{"color":"빨강","quantity":1}]')->>'error'='bad_input';
  assert climbing_ascent_batch_save(bid,'Gym',today,null,
    (select jsonb_agg(jsonb_build_object('color',n::text,'quantity',99)) from generate_series(1,6) n))->>'error'='bad_input';
  assert climbing_ascent_batch_save(bid,'Gym',today,null,
    (select jsonb_agg(jsonb_build_object('color',n::text,'quantity',1)) from generate_series(1,21) n))->>'error'='bad_input';
  assert climbing_ascent_batch_save(bid,'Gym',today-2,null,
    '[{"color":"노랑","quantity":2,"v_grade":1},{"color":"회색","quantity":3}]')->>'ok'='true';
  assert climbing_progress()->>'total'='6', 'edit replaces counts, not adds';
  select * into r from public_climbing_achievements(array[auth.uid()]);
  assert r.total=6 and r.stage='yellow', 'edit recomputes public rank';
  assert climbing_progress()->'grade_counts'->>'4' is null;
  assert climbing_progress()->'grade_counts'->>'unknown'='3';
  -- 기존 기록을 편집하면 원래 문제명은 보관하고 원자적으로 묶음으로 전환한다.
  assert climbing_ascent_batch_save(legacy,'Gym',today,null,'[{"color":"초록","quantity":3,"v_grade":2}]',legacy)->>'ok'='true';
  assert climbing_progress()->>'total'='8';
  assert climbing_ascent_batch_save(legacy,'Gym',today,null,'[{"color":"초록","quantity":3,"v_grade":2}]',legacy)->>'ok'='true';
  assert climbing_progress()->>'total'='8', 'legacy conversion retry';
  assert json_array_length(climbing_ascent_list())=0;
  assert exists(select 1 from json_array_elements(climbing_ascent_history()) h where h->>'id'=legacy::text and h->>'legacy_problem'='old problem');
  assert climbing_ascent_save(legacy,'Gym','old retry',2)->>'error'='bad_input', 'old app retry cannot duplicate converted records';
  for n in 1..22 loop
    assert climbing_ascent_batch_save(gen_random_uuid(),'Gym',today,null,'[{"color":"회색","quantity":1}]')->>'ok'='true';
  end loop;
  history := climbing_ascent_history(null,null,20); last_row:=history->19;
  page2 := climbing_ascent_history((last_row->>'created_at')::timestamptz,(last_row->>'id')::uuid,20);
  assert json_array_length(history)=20 and json_array_length(page2)=4;
  assert not exists(select 1 from json_array_elements(history) a,json_array_elements(page2) b where a->>'id'=b->>'id'), 'stable cursor even on equal timestamps';
end $$;
select set_config('request.jwt.claim.sub','ba7c0000-0000-4000-8000-000000000002',true);
do $$ begin
  assert json_array_length(climbing_ascent_history())=0;
  assert climbing_progress()->>'total'='0';
  assert climbing_ascent_batch_save('ba7c0000-0000-4000-8000-000000000010','stolen',current_date,null,
    '[{"color":"검정","quantity":99,"v_grade":17}]')->>'error'='not_mine';
  perform climbing_ascent_batch_delete('ba7c0000-0000-4000-8000-000000000010');
  assert (select count(*) from public_climbing_achievements(array['ba7c0000-0000-4000-8000-000000000001'::uuid]))=0, 'private record summary remains private';
end $$;
select set_config('request.jwt.claim.sub','ba7c0000-0000-4000-8000-000000000001',true);
do $$ begin
  assert climbing_progress()->>'total'='30', 'foreign writes did not change counts';
  perform climbing_ascent_batch_delete('ba7c0000-0000-4000-8000-000000000010');
  perform climbing_ascent_batch_delete('ba7c0000-0000-4000-8000-000000000010');
  assert climbing_progress()->>'total'='25', 'delete cascades to counts and retry is safe';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert climbing_ascent_batch_save(gen_random_uuid(),'Gym',current_date,null,'[{"color":"빨강","quantity":1}]')->>'error'='no_auth';
  assert json_array_length(climbing_ascent_history())=0;
end $$;
reset role;
delete from auth.users where id='ba7c0000-0000-4000-8000-000000000001';
do $$ begin
  assert not exists(select 1 from climbing_ascent_batches where user_id='ba7c0000-0000-4000-8000-000000000001');
  assert not exists(select 1 from climbing_ascents where user_id='ba7c0000-0000-4000-8000-000000000001');
end $$;
rollback;
