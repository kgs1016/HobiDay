-- Install the reversible pause mechanism without activating it.
-- Activation is a separate operation after the web notice has been published.
begin;

create table public.app_maintenance (
  id integer primary key check (id = 1),
  enabled boolean not null default false,
  title text not null default '리뉴얼 준비 중',
  message text not null default '새로운 하비데이를 준비하고 있어요. 잠시만 기다려주세요.',
  updated_at timestamptz not null default now()
);
insert into public.app_maintenance(id) values(1);
alter table public.app_maintenance enable row level security;
revoke all on public.app_maintenance from public, anon, authenticated;
grant all on public.app_maintenance to service_role;

create function public.maintenance_enabled() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from app_maintenance where id=1), true)
$$;

create function public.maintenance_access_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select not maintenance_enabled() or is_app_tester()
$$;

create function public.app_access_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'maintenance', maintenance_enabled(),
    'allowed', maintenance_access_allowed(),
    'authenticated', auth.uid() is not null,
    'tester', is_app_tester(),
    'title', coalesce((select title from app_maintenance where id=1), '리뉴얼 준비 중'),
    'message', coalesce((select message from app_maintenance where id=1), '새로운 하비데이를 준비하고 있어요. 잠시만 기다려주세요.')
  )
$$;

-- Existing apps may still read the old launch flags.
create or replace function public.app_flags() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'sessions_open', (sessions_open or is_app_tester()) and maintenance_access_allowed(),
    'people_open', (people_open or is_app_tester()) and maintenance_access_allowed(),
    'open_at', case when maintenance_enabled() then null else open_at end,
    'notice', case when maintenance_enabled() then (select title from app_maintenance where id=1) else notice end,
    'tester', is_app_tester()
  ) from app_config where id=1
$$;

-- SECURITY DEFINER RPCs bypass RLS, so every Data API request needs this guard.
-- Auth (sign in/out/reset) is separate and continues working.
create function public.check_app_maintenance() returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb ->> 'role' = 'service_role'
     or maintenance_access_allowed() then
    return;
  end if;
  if current_setting('request.path',true) in (
    '/rpc/app_access_status', '/rpc/app_flags', '/rpc/account_delete', '/rpc/push_token_delete'
  ) then
    return;
  end if;
  raise sqlstate 'PT503' using message = '리뉴얼 준비 중', detail = 'renewal_maintenance';
end
$$;

revoke all on function public.maintenance_enabled(), public.maintenance_access_allowed(),
  public.app_access_status(), public.check_app_maintenance() from public;
grant execute on function public.maintenance_enabled(), public.maintenance_access_allowed(),
  public.app_access_status(), public.check_app_maintenance() to anon, authenticated, service_role;

-- Do not overwrite a pre-existing request guard. This was absent at installation.
do $$
begin
  if exists (
    select 1 from pg_db_role_setting s join pg_roles r on r.oid=s.setrole,
      unnest(s.setconfig) as setting
    where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%'
      and setting <> 'pgrst.db_pre_request=public.check_app_maintenance'
  ) then
    raise exception 'Existing Data API guard must be composed before installing maintenance';
  end if;
end
$$;
alter role authenticator set pgrst.db_pre_request = 'public.check_app_maintenance';

-- Realtime and direct table queries also obey the pause. Preserve all existing policies.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname='public' and rowsecurity
    and tablename not in ('app_maintenance','app_testers','app_config','app_admins') loop
    execute format('create policy renewal_maintenance on public.%I as restrictive for all to anon, authenticated using ((select public.maintenance_access_allowed())) with check ((select public.maintenance_access_allowed()))',t.tablename);
  end loop;
end
$$;

-- Storage does not invoke the Data API guard. Own files stay readable/deletable
-- so the existing account-deletion flow can clean up its media during the pause.
create policy renewal_maintenance_read on storage.objects as restrictive for select to anon,authenticated
  using ((select public.maintenance_access_allowed()) or (storage.foldername(name))[1]=auth.uid()::text);
create policy renewal_maintenance_insert on storage.objects as restrictive for insert to anon,authenticated
  with check ((select public.maintenance_access_allowed()));
create policy renewal_maintenance_update on storage.objects as restrictive for update to anon,authenticated
  using ((select public.maintenance_access_allowed())) with check ((select public.maintenance_access_allowed()));
create policy renewal_maintenance_delete on storage.objects as restrictive for delete to anon,authenticated
  using ((select public.maintenance_access_allowed()) or (storage.foldername(name))[1]=auth.uid()::text);

-- Immediate pushes from the Edge Function must not reach paused users either.
create or replace function public.can_notify(p_from uuid,p_to uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select p_from is not null and p_to is not null and p_from<>p_to
    and (not maintenance_enabled() or (
      exists(select 1 from app_testers where user_id=p_from)
      and exists(select 1 from app_testers where user_id=p_to)))
    and not exists(select 1 from blocks where (blocker_id=p_from and blocked_id=p_to) or (blocker_id=p_to and blocked_id=p_from))
    and (
      exists(select 1 from matches where (user_a=p_from and user_b=p_to) or (user_a=p_to and user_b=p_from))
      or exists(select 1 from requests where (from_id=p_from and to_id=p_to) or (from_id=p_to and to_id=p_from))
      or exists(select 1 from signups a join signups b on b.session_id=a.session_id where a.user_id=p_from and a.status='confirmed' and b.user_id=p_to and b.status='confirmed')
      or exists(select 1 from sessions s join signups g on g.session_id=s.id where g.status in ('waiting','confirmed') and ((s.host_id=p_from and g.user_id=p_to) or (s.host_id=p_to and g.user_id=p_from)))
    )
$$;

-- Cron callers bypass normal user access; filter the push claim itself as well.
create or replace function public.notifications_push_claim(p_limit integer default 20,p_ids uuid[] default null,p_users uuid[] default null) returns json
language plpgsql security definer set search_path=public as $$
declare result json;
begin
  with picked as (
    select id from notifications where pushed_at is null and created_at>now()-interval '1 day'
      and push_attempts<8 and push_retry_at<=now()
      and (p_ids is null or id=any(p_ids)) and (p_users is null or user_id=any(p_users))
      and (not maintenance_enabled() or exists(select 1 from app_testers t where t.user_id=notifications.user_id))
    order by push_retry_at,created_at limit greatest(1,least(coalesce(p_limit,20),20)) for update skip locked
  ), claimed as (
    update notifications n set push_attempts=push_attempts+1,push_retry_at=now()+interval '2 minutes',push_lease=gen_random_uuid()
    from picked p where n.id=p.id returning n.*
  ) select coalesce(json_agg(json_build_object('id',c.id,'user_id',c.user_id,'title',c.title,'body',c.body,'url',c.url,
      'lease',c.push_lease,'delivered_tokens',coalesce((select json_agg(r.token) from notification_push_receipts r where r.notification_id=c.id),'[]'::json))),'[]'::json)
    into result from claimed c;
  return result;
end
$$;

-- Keep the original active state of paused reminder jobs for reopening.
create table public.maintenance_paused_jobs (
  jobname text primary key,
  was_active boolean not null
);
alter table public.maintenance_paused_jobs enable row level security;
revoke all on public.maintenance_paused_jobs from public,anon,authenticated;
grant all on public.maintenance_paused_jobs to service_role;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
