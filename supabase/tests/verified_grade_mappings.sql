-- 임시 DB 전용. 자동 환산은 서버의 등록된 색상/암장/버전 조합으로만 저장한다.
begin;
insert into auth.users(id) values ('a6700000-0000-4000-8000-000000000001');
insert into profiles(id,nickname,gender,age,is_public) values ('a6700000-0000-4000-8000-000000000001','mapping-test','m',25,false);
set local role authenticated;
select set_config('request.jwt.claim.sub','a6700000-0000-4000-8000-000000000001',true);
do $$
declare bid uuid := 'a6700000-0000-4000-8000-000000000010';
  today date := (now() at time zone 'Asia/Seoul')::date; result json; row record; bad jsonb;
begin
  assert not has_table_privilege('authenticated','climbing_grade_mappings','INSERT');
  assert not has_table_privilege('authenticated','climbing_grade_mappings','UPDATE');
  assert not has_table_privilege('authenticated','climbing_ascents','UPDATE');
  -- 클라이언트가 상한/거짓 V값을 보내도 서버가 등록표 하한으로 계산한다.
  assert climbing_ascent_batch_save(bid,'메트로락 클라이밍',today,'metrorock',
    '[{"color":"파랑","quantity":10,"v_grade":17,"grade_mapping_id":"metrorock-20260909-blue"},{"color":"민트","quantity":3,"v_grade":null}]')->>'ok'='true';
  assert climbing_progress()->>'total'='13';
  assert climbing_progress()->'grade_counts'->>'3'='10';
  assert climbing_progress()->'grade_counts'->>'17' is null;
  assert climbing_progress()->'grade_counts'->>'unknown'='3';
  select * into row from public_climbing_achievements(array[auth.uid()]);
  assert row.stage='green' and row.total=13, 'lower grade drives shoe achievements';
  result := climbing_ascent_history();
  assert result->0->'items'->0->>'grade_mapping_id'='metrorock-20260909-blue';
  assert result->0->'items'->0->>'v_grade'='3';
  -- 같은 요청 재시도 / 출처 보존.
  assert climbing_ascent_batch_save(bid,'메트로락 클라이밍',today,'metrorock',
    '[{"color":"파랑","quantity":10,"grade_mapping_id":"metrorock-20260909-blue"},{"color":"민트","quantity":3}]')->>'ok'='true';
  assert climbing_progress()->>'total'='13';
  -- 잘못된 환산이 한 항목이라도 있으면 기존 묶음 전체를 보존한다.
  for bad in select value from jsonb_array_elements('[
    [{"color":"파랑","quantity":1,"grade_mapping_id":"invented"}],
    [{"color":"민트","quantity":1,"grade_mapping_id":"metrorock-20260909-blue"}],
    [{"color":"파랑","quantity":1,"grade_mapping_id":33}],
    [{"color":"파랑","quantity":1,"grade_mapping_id":{}}],
    [{"color":"파랑","quantity":1,"grade_mapping_id":"metrorock-20260909-blue"},{"color":"핑크","quantity":1,"grade_mapping_id":"metrorock-20260909-blue"}]
  ]') loop
    assert climbing_ascent_batch_save(bid,'메트로락',today,'metrorock',bad)->>'error'='bad_mapping';
    assert climbing_progress()->>'total'='13';
  end loop;
  assert climbing_ascent_batch_save(bid,'서울숲',today,'metrorock',
    '[{"color":"파랑","quantity":1,"grade_mapping_id":"metrorock-20260909-blue"}]')->>'error'='bad_mapping';
  assert climbing_ascent_batch_save(bid,'메트로락',today,null,
    '[{"color":"파랑","quantity":1,"grade_mapping_id":"metrorock-20260909-blue"}]')->>'error'='bad_mapping';
  assert climbing_ascent_batch_save(bid,'메트로락 근처 새암장',today,'metrorock',
    '[{"color":"파랑","quantity":1,"grade_mapping_id":"metrorock-20260909-blue"}]')->>'error'='bad_mapping';
  -- 현장 표기가 다른 경우 직접 입력으로 전환 가능, 더 이상 자동 출처를 주장하지 않는다.
  assert climbing_ascent_batch_save(bid,'메트로락',today,'metrorock',
    '[{"color":"파랑","quantity":5,"v_grade":4,"grade_mapping_id":null}]')->>'ok'='true';
  assert climbing_ascent_history()->0->'items'->0->>'grade_mapping_id' is null;
  assert climbing_progress()->'grade_counts'->>'4'='5';
  -- 기준이 없는 암장 및 임의 색상도 V등급 또는 모름으로 함께 저장.
  assert climbing_ascent_batch_save(bid,'동네 새 암장',today,null,
    '[{"color":"민트","quantity":7,"v_grade":2},{"color":"투톤","quantity":2,"v_grade":null}]')->>'ok'='true';
  assert climbing_progress()->>'total'='9';
  assert climbing_progress()->'grade_counts'->>'2'='7';
  assert climbing_progress()->'grade_counts'->>'unknown'='2';
  assert climbing_ascent_batch_delete(bid)->>'ok'='true';
  assert climbing_progress()->>'total'='0';
end $$;
-- 더클라임의 지점 별칭, VB, 범위 하한, 아직 미등록인 상위 색상을 검증한다.
do $$
declare bid uuid := 'a6700000-0000-4000-8000-000000000011';
  today date := (now() at time zone 'Asia/Seoul')::date; gym text;
begin
  foreach gym in array array['더클라임','더 클라임','더클라임 클라이밍','더클','The Climb',
    '더클라임 문래','더클라임 강남','더클라임 신림','더클라임 일산',
    '더클라임 사당점','더클라임 클라이밍 강남점','더클 일산점','The Climb Yangjae점'] loop
    assert climbing_ascent_batch_save(bid,gym,today,'theclimb',
      '[{"color":"흰색","quantity":2,"v_grade":17,"grade_mapping_id":"theclimb-20250711-white"},
        {"color":"파랑","quantity":10,"v_grade":17,"grade_mapping_id":"theclimb-20250711-blue"},
        {"color":"핑크","quantity":3,"v_grade":null}]')->>'ok'='true', gym;
    assert climbing_progress_v2()->>'total'='15';
    assert climbing_progress_v2()->'grade_counts'->>'-1'='2';
    assert climbing_progress_v2()->'grade_counts'->>'3'='10';
    assert climbing_progress_v2()->'grade_counts'->>'17' is null;
    assert climbing_progress_v2()->'grade_counts'->>'unknown'='3';
    assert climbing_ascent_history()->0->'items'->0->>'grade_mapping_id'='theclimb-20250711-white';
  end loop;
  foreach gym in array array['더클라임뉴스','더클라임 근처 새암장','더클라임','메트로락','서울숲'] loop
    -- 다른 브랜드 출처를 빌리거나 임의 문자열로 더클라임의 출처를 주장하지 못한다.
    assert climbing_ascent_batch_save(bid,gym,today,'metrorock',
      '[{"color":"파랑","quantity":10,"grade_mapping_id":"theclimb-20250711-blue"}]')->>'error'='bad_mapping';
  end loop;
  foreach gym in array array['더클라임뉴스','더클라임 근처 새암장','메트로락','서울숲'] loop
    assert climbing_ascent_batch_save(bid,gym,today,'theclimb',
      '[{"color":"파랑","quantity":10,"grade_mapping_id":"theclimb-20250711-blue"}]')->>'error'='bad_mapping';
  end loop;
  assert climbing_ascent_batch_save(bid,'더클라임',today,'theclimb',
    '[{"color":"핑크","quantity":10,"grade_mapping_id":"theclimb-20250711-pink"}]')->>'error'='bad_mapping';
  assert climbing_progress_v2()->>'total'='15', 'rejected mapping leaves the existing batch intact';
  assert climbing_ascent_batch_delete(bid)->>'ok'='true';
end $$;
rollback;
