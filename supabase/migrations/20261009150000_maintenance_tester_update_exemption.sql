-- A supported legacy native client may show its update policy while paused.
-- Do not let a minimum-version policy lock the designated tester out.
begin;
create or replace function public.app_update_policy()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'ios_latest_version', ios_latest_version,
    'android_latest_version', android_latest_version,
    'ios_minimum_version', case when maintenance_enabled() and is_app_tester() then null else ios_minimum_version end,
    'android_minimum_version', case when maintenance_enabled() and is_app_tester() then null else android_minimum_version end,
    'title', update_title,
    'message', update_message
  ) from public.app_config where id=1
$$;
commit;
