-- 모든 테스트 데이터와 변경은 롤백한다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
insert into auth.users(id) values
 ('c1a00000-0000-4000-8000-000000000001'), ('c1a00000-0000-4000-8000-000000000002');
insert into profiles(id,nickname,gender,age,level,is_public) values
 ('c1a00000-0000-4000-8000-000000000001','ascent-test-a','m',25,1,false),
 ('c1a00000-0000-4000-8000-000000000002','ascent-test-b','f',25,1,false);

set local role authenticated;
select set_config('request.jwt.claim.sub','c1a00000-0000-4000-8000-000000000001',true);
do $$
declare r json; first_page json; next_page json; last_row json; id1 uuid := 'c1a00000-0000-4000-8000-000000000010';
begin
  assert not has_table_privilege('authenticated','climbing_ascents','INSERT'), 'direct insert denied';
  assert not has_table_privilege('authenticated','climbing_ascents','SELECT'), 'direct select denied';
  assert not has_function_privilege('anon','climbing_ascent_save(uuid,text,text,integer)','execute'), 'anonymous save denied';
  assert not has_function_privilege('anon','climbing_progress()','execute'), 'anonymous summary denied';
  assert climbing_progress()->>'total' = '0', 'empty progress';
  assert climbing_ascent_save(id1,'Gym A','9월 1번',4)->>'ok' = 'true', 'create';
  assert climbing_ascent_save(id1,'Gym A','9월 1번',4)->>'ok' = 'true', 'retry same id';
  assert climbing_progress()->>'total' = '1', 'retry does not double count';
  assert climbing_ascent_save(gen_random_uuid(),' gym a ',E'9월\t1번',5)->>'error' = 'duplicate', 'normalized duplicate rejected';
  assert climbing_ascent_save(gen_random_uuid(),'Gym A','9월 2번',18)->>'error' = 'bad_input', 'invalid grade';
  assert climbing_ascent_save(gen_random_uuid(),E'\t','9월 2번',4)->>'error' = 'bad_input', 'blank gym';
  assert climbing_ascent_save(gen_random_uuid(),'Gym A','미상',null)->>'ok' = 'true', 'unknown grade allowed';
  assert climbing_progress()->'grade_counts'->>'unknown' = '1', 'unknown tracked separately';
  assert climbing_ascent_save(id1,'Gym A','9월 1번',6)->>'ok' = 'true', 'edit';
  assert climbing_progress()->'grade_counts'->>'6' = '1', 'edit updates histogram';
  assert climbing_progress()->'grade_counts'->>'4' is null, 'old grade removed';
  for n in 1..23 loop
    assert climbing_ascent_save(gen_random_uuid(),'Gym A','추가 ' || n,1)->>'ok' = 'true', 'bulk records';
  end loop;
  assert climbing_progress()->>'total' = '25', 'summary includes all records';
  first_page := climbing_ascent_list(null,null,20);
  assert json_array_length(first_page) = 20, 'first page';
  last_row := first_page->19;
  next_page := climbing_ascent_list((last_row->>'created_at')::timestamptz,(last_row->>'id')::uuid,20);
  assert json_array_length(next_page) = 5, 'cursor tie pagination';
  assert not exists(select 1 from json_array_elements(first_page) a, json_array_elements(next_page) b
    where a->>'id' = b->>'id'), 'pages do not overlap';
end $$;

select set_config('request.jwt.claim.sub','c1a00000-0000-4000-8000-000000000002',true);
do $$ begin
  assert climbing_progress()->>'total' = '0', 'other user summary isolated';
  assert json_array_length(climbing_ascent_list()) = 0, 'other user list isolated';
  assert climbing_ascent_save('c1a00000-0000-4000-8000-000000000010','Gym B','stolen',17)->>'error' = 'not_mine', 'foreign update denied';
  perform climbing_ascent_delete('c1a00000-0000-4000-8000-000000000010');
  assert climbing_ascent_save(gen_random_uuid(),'Gym A','9월 1번',4)->>'ok' = 'true', 'same problem different person';
end $$;

select set_config('request.jwt.claim.sub','c1a00000-0000-4000-8000-000000000001',true);
do $$ begin
  assert climbing_progress()->>'total' = '25', 'foreign delete did not change owner';
  assert climbing_progress()->'grade_counts'->>'6' = '1', 'foreign update did not change owner';
  perform climbing_ascent_delete('c1a00000-0000-4000-8000-000000000010');
  perform climbing_ascent_delete('c1a00000-0000-4000-8000-000000000010');
  assert climbing_progress()->>'total' = '24', 'delete retry';
  assert climbing_progress()->'grade_counts'->>'6' is null, 'deleted grade removed';
end $$;

reset role;
delete from auth.users where id = 'c1a00000-0000-4000-8000-000000000001';
do $$ begin
  assert not exists(select 1 from climbing_ascents where user_id = 'c1a00000-0000-4000-8000-000000000001'), 'account deletion cascades';
end $$;
rollback;
