-- 정식 오픈: 이전 설치 앱의 app_flags()도 열린 값을 받는다.
-- 앱 업데이트는 더 이상 이 플래그로 홈/탭/내 정보 진입을 제한하지 않는다.
begin;

alter table public.app_config
  alter column sessions_open set default true,
  alter column people_open set default true;

insert into public.app_config (id, sessions_open, people_open, open_at, notice)
values (1, true, true, null, null)
on conflict (id) do update
set sessions_open = excluded.sessions_open,
    people_open = excluded.people_open,
    open_at = null,
    notice = null;

commit;
