-- Native update notices. Keep latest at the version containing this client
-- code, then raise each platform only after that store release is available.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

alter table public.app_config
  add column ios_latest_version text not null default '1.1',
  add column android_latest_version text not null default '1.1',
  add column ios_minimum_version text,
  add column android_minimum_version text,
  add column update_title text not null default '새로운 하비데이가 준비됐어요',
  add column update_message text not null default '더 안정적인 이용과 새로운 기능을 위해 최신 버전으로 업데이트해주세요.',
  add constraint app_config_ios_latest_version_format
    check (ios_latest_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  add constraint app_config_android_latest_version_format
    check (android_latest_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  add constraint app_config_ios_minimum_version_format
    check (ios_minimum_version is null or ios_minimum_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  add constraint app_config_android_minimum_version_format
    check (android_minimum_version is null or android_minimum_version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  add constraint app_config_update_copy_length
    check (char_length(update_title) between 1 and 40 and char_length(update_message) between 1 and 160);

create or replace function public.app_update_policy()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ios_latest_version', ios_latest_version,
    'android_latest_version', android_latest_version,
    'ios_minimum_version', ios_minimum_version,
    'android_minimum_version', android_minimum_version,
    'title', update_title,
    'message', update_message
  )
  from public.app_config
  where id = 1;
$$;

revoke all on function public.app_update_policy() from public;
grant execute on function public.app_update_policy() to anon, authenticated;

commit;
