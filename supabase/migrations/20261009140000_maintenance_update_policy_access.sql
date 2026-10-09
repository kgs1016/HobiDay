-- Keep the native update-policy read available while service APIs are paused.
-- Do not change supported/latest versions until an actual store release exists.
begin;
create or replace function public.check_app_maintenance() returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'role' = 'service_role'
     or maintenance_access_allowed() then
    return;
  end if;
  if current_setting('request.path',true) in (
    '/rpc/app_access_status', '/rpc/app_flags', '/rpc/app_update_policy',
    '/rpc/account_delete', '/rpc/push_token_delete'
  ) then
    return;
  end if;
  raise sqlstate 'PT503' using message = '리뉴얼 준비 중', detail = 'renewal_maintenance';
end
$$;
commit;
