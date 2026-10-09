-- Operator-only. The user's chosen account must already exist.
begin;
do $$
declare tester_id uuid;
begin
  select id into strict tester_id from auth.users where lower(email)='line19981016@gmail.com' and deleted_at is null;
  if exists(select 1 from public.app_testers where user_id<>tester_id) then
    raise exception 'Unexpected existing testers; review before activating the pause';
  end if;
  insert into public.app_testers(user_id,note) values(tester_id,'리뉴얼 개발용 계정')
    on conflict(user_id) do update set note=excluded.note;
end
$$;
insert into public.maintenance_paused_jobs(jobname,was_active)
  select jobname,active from cron.job where jobname in (
    'requests-expire','signups-expire','session-chats-purge','notifications-purge',
    'sessions-remind','reviews-ask','community-articles-purge','profile-usage-retention'
  )
  on conflict(jobname) do nothing;
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname in (
    'requests-expire','signups-expire','session-chats-purge','notifications-purge',
    'sessions-remind','reviews-ask','community-articles-purge','profile-usage-retention'
  ) loop
    perform cron.alter_job(j.jobid,active:=false);
  end loop;
end
$$;
update public.app_maintenance set enabled=true,title='리뉴얼 준비 중',
  message='새로운 하비데이를 준비하고 있어요. 잠시만 기다려주세요.',updated_at=now() where id=1;
commit;
