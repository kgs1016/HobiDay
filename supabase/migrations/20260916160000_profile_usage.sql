-- First-party profile completion diagnostics. No entered values, URLs or raw errors.
begin;
create table public.profile_usage_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  event text not null check (event in (
    'profile_opened','profile_ready','profile_save_attempt','profile_saved',
    'profile_validation_failed','profile_load_failed','profile_save_failed','profile_photo_failed',
    'shoe_opened','shoe_ready','shoe_save_attempt','shoe_saved','shoe_save_failed','shoe_load_failed','profile_publish_failed'
  )),
  platform text not null check (platform in ('web','ios','android')),
  app_version text check (app_version ~ '^[0-9]{1,5}(\.[0-9]{1,5}){0,3}$'),
  error_code text check (error_code in ('offline','timeout','network','auth','server','nickname_required','basic_required','invalid_age','photo_too_large')),
  created_at timestamptz not null default now(),
  primary key (user_id,id)
);
create index profile_usage_user_time on public.profile_usage_events(user_id,created_at desc);
create index profile_usage_time on public.profile_usage_events(created_at);
alter table public.profile_usage_events enable row level security;
revoke all on public.profile_usage_events from public,anon,authenticated;

create function public.record_profile_usage(p_id uuid,p_event text,p_platform text,p_version text default null,p_error_code text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid();
begin
  if me is null or p_id is null or p_event is null or p_platform is null
    or not exists(select 1 from auth.users where id=me and deleted_at is null and not coalesce(is_anonymous,false)) then return false; end if;
  -- Avoid waiting on concurrent telemetry, and cap authenticated clients at 60 events/hour.
  if not pg_try_advisory_xact_lock(hashtextextended('profile_usage:' || me::text,0)) then return false; end if;
  if (select count(*) from profile_usage_events where user_id=me and created_at>now()-interval '1 hour') >= 60 then return false; end if;
  insert into profile_usage_events(user_id,id,event,platform,app_version,error_code)
  values(me,p_id,p_event,p_platform,p_version,p_error_code) on conflict(user_id,id) do nothing;
  return true;
end $$;
revoke all on function public.record_profile_usage(uuid,text,text,text,text) from public,anon;
grant execute on function public.record_profile_usage(uuid,text,text,text,text) to authenticated;

create function public.admin_profile_usage(p_days integer default 7,p_new_only boolean default true)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare since_at timestamptz; result jsonb;
begin
  if not public.is_app_admin() then return jsonb_build_object('error','not_admin'); end if;
  since_at := (((now() at time zone 'Asia/Seoul')::date - (greatest(1,least(coalesce(p_days,7),90))-1))::timestamp at time zone 'Asia/Seoul');
  with cohort as materialized (
    select u.id,u.created_at from auth.users u
    where u.deleted_at is null and not coalesce(u.is_anonymous,false)
      and case when coalesce(p_new_only,true) then u.created_at>=since_at
        else exists(select 1 from profile_usage_events e where e.user_id=u.id and e.created_at>=since_at) end
  ), events as materialized (
    select e.* from profile_usage_events e join cohort c on c.id=e.user_id where e.created_at>=since_at
  ), stages as (
    select event,count(distinct user_id) as users,count(*) as events from events group by event
  ), recent as (
    select c.id as user_id,c.created_at as joined_at,
      last.event as last_event,last.created_at as last_at,last.platform,last.app_version,last.error_code,
      coalesce((select jsonb_agg(distinct e.event) from events e where e.user_id=c.id),'[]'::jsonb) as events
    from cohort c left join lateral (
      select e.* from events e where e.user_id=c.id order by e.created_at desc,e.id desc limit 1
    ) last on true
    order by coalesce(last.created_at,c.created_at) desc,c.id limit 100
  ) select jsonb_build_object(
    'period_start',since_at,'period_end',now(),
    'cohort_count',(select count(*) from cohort),'observed_users',(select count(distinct user_id) from events),
    'stages',coalesce((select jsonb_agg(s order by s.event) from stages s),'[]'::jsonb),
    'recent_users',coalesce((select jsonb_agg(r order by coalesce(r.last_at,r.joined_at) desc,r.user_id) from recent r),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.admin_profile_usage(integer,boolean) from public,anon;
grant execute on function public.admin_profile_usage(integer,boolean) to authenticated;

create function public.purge_profile_usage() returns void
language sql security definer set search_path=public as $$
  delete from public.profile_usage_events where created_at < now()-interval '90 days';
$$;
revoke all on function public.purge_profile_usage() from public,anon,authenticated;
-- pg_cron is already installed in production; isolated SQL tests do not require it.
do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') then
    execute $job$select cron.schedule('profile-usage-retention','0 4 * * *','select public.purge_profile_usage()')$job$;
  end if;
end $$;
comment on table public.profile_usage_events is 'Best-effort diagnostic events, not an authoritative activity history. 90-day retention; auth deletion cascades.';
notify pgrst,'reload schema';
commit;
