-- Execute only during an authorized production deployment, after push_delivery_retry + the push function.
-- Store the actual service role key in Vault under service_role_key beforehand; never paste it in this file.
do $$
begin
  if not exists(select 1 from vault.secrets where name='service_role_key') then
    raise exception 'Store the service_role_key in Supabase Vault before enabling push scheduling';
  end if;
  if not exists(select 1 from pg_extension where extname='pg_net') then
    raise exception 'Enable the pg_net extension before enabling push scheduling';
  end if;
end $$;
-- Scheduling an existing named job updates it instead of creating a second worker.
select cron.schedule('notifications-push','* * * * *',$job$
  select net.http_post(
    url:='https://loigwslmwvltdurjttpe.supabase.co/functions/v1/push',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
      (select decrypted_secret from vault.decrypted_secrets where name='service_role_key' limit 1)),
    body:='{"drain":true}'::jsonb,
    timeout_milliseconds:=55000);
$job$);
