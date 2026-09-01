-- ═══════════════════════════════════════════════════════════════
--  레벨 범위 제한 해제 — 인접 1단계 → 전체 (L1~L5)
-- ═══════════════════════════════════════════════════════════════
-- 인접 1단계는 "실력이 비슷해야 같이 탄다" 는 초기 가설이었는데, 지금
-- 규모에서는 모임을 가르는 벽이 하나 더 있는 셈이다. 전 레벨 환영 모임을
-- 열 수 있게 상한을 풀고, 순서 제약(min ≤ max)만 남긴다.
--
-- 찾는 쪽(필터)은 원래 제한이 없었다 — 여는 쪽만 잠겨 있었다.
--
-- 제약이 base_schema 에 이름 없이 들어가 있어(자동 이름) 정의로 찾아 지운다.
-- min ≤ max 도 그 제약에 같이 들어 있었으므로, 지운 뒤 이름 있는 제약으로
-- 다시 세운다. 몇 번을 다시 돌려도 안전하다.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.sessions'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) like '%level_max - level_min%'
  loop
    execute format('alter table sessions drop constraint %I', c.conname);
  end loop;
end $$;

alter table sessions drop constraint if exists sessions_level_range_check;
alter table sessions add constraint sessions_level_range_check
  check (level_max >= level_min);
