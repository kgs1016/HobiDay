-- Run only when the user requests reopening. No rebuild is needed for the web gate.
begin;
update public.app_maintenance set enabled=false,updated_at=now() where id=1;
do $$
declare j record;
begin
  for j in select c.jobid,p.was_active from public.maintenance_paused_jobs p join cron.job c using(jobname) loop
    perform cron.alter_job(j.jobid,active:=j.was_active);
  end loop;
end
$$;
delete from public.maintenance_paused_jobs;
commit;
