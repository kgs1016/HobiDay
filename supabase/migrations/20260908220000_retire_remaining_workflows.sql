-- 통합 점검: 앱에서 폐지한 최종선택·라운드 기능의 DB 잔재를 정리한다.
-- 20260907140000~20260908180000의 적용 이력 일부가 빠진 운영 DB에서
-- 최신 함수들은 이미 반영됐지만 아래 6개 함수와 2개 표만 남아 있었다.
-- 과거 마이그레이션을 다시 실행하면 무료 전환을 되돌리므로 새 파일로 처리한다.
-- matches/messages와 Storage 파일은 유지한다. 옛 표도 삭제하지 않고 비공개 보관한다.

create schema if not exists retired;
revoke all on schema retired from public, anon, authenticated, service_role;

drop function if exists public.selection_submit(uuid, uuid[]);
drop function if exists public.my_matches(uuid);
drop function if exists public.sync_matches(uuid);
drop function if exists public.mission_done(uuid, int, text);
drop function if exists public.room_warmup_min();
drop function if exists public.room_round_min();
drop function if exists public.room_card_lead_min();

do $$
declare retired_table text;
begin
  foreach retired_table in array array['selections','missions'] loop
    if to_regclass(format('public.%I', retired_table)) is not null then
      if to_regclass(format('retired.%I', retired_table)) is not null then
        raise exception 'Both public.% and retired.% exist; reconcile the preserved rows first', retired_table, retired_table;
      end if;
      execute format('alter table public.%I set schema retired', retired_table);
    end if;
    if to_regclass(format('retired.%I', retired_table)) is not null then
      execute format('revoke all on table retired.%I from public, anon, authenticated, service_role', retired_table);
      execute format('alter table retired.%I enable row level security', retired_table);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
