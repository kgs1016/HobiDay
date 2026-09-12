-- Local pending change. Apply with the matching push Edge Function, then enable its scheduled drain.
begin;
alter table public.notifications add column push_attempts integer not null default 0,
  add column push_retry_at timestamptz not null default now(),
  add column push_lease uuid;
create index notifications_push_retry_idx on public.notifications(push_retry_at,created_at)
  where pushed_at is null and push_attempts<8;
create table public.notification_push_receipts (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  token text not null,
  primary key(notification_id,token)
);
alter table public.notification_push_receipts enable row level security;
revoke all on public.notification_push_receipts from public,anon,authenticated;

create function public.notifications_push_claim(p_limit integer default 20,p_ids uuid[] default null,p_users uuid[] default null) returns json
language plpgsql security definer set search_path=public as $$
declare result json;
begin
  with picked as (
    select id from notifications where pushed_at is null and created_at>now()-interval '1 day'
      and push_attempts<8 and push_retry_at<=now()
      and (p_ids is null or id=any(p_ids)) and (p_users is null or user_id=any(p_users))
    order by push_retry_at,created_at limit greatest(1,least(coalesce(p_limit,20),20)) for update skip locked
  ), claimed as (
    update notifications n set push_attempts=push_attempts+1,push_retry_at=now()+interval '2 minutes',push_lease=gen_random_uuid()
    from picked p where n.id=p.id returning n.*
  ) select coalesce(json_agg(json_build_object('id',c.id,'user_id',c.user_id,'title',c.title,'body',c.body,'url',c.url,
      'lease',c.push_lease,'delivered_tokens',coalesce((select json_agg(r.token) from notification_push_receipts r where r.notification_id=c.id),'[]'::json))),'[]'::json)
    into result from claimed c;
  return result;
end $$;

create function public.notifications_push_finish(p_id uuid,p_lease uuid,p_delivered text[],p_complete boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare n notifications;
begin
  select * into n from notifications where id=p_id and push_lease=p_lease and pushed_at is null for update;
  if not found then return false; end if;
  insert into notification_push_receipts(notification_id,token)
    select p_id,t from unnest(coalesce(p_delivered,'{}'::text[])) t on conflict do nothing;
  update notifications set pushed_at=case when p_complete then now() else null end,push_lease=null,
    push_retry_at=now()+make_interval(secs=>least(3600,30*power(2,n.push_attempts)::integer)) where id=p_id;
  return true;
end $$;
revoke all on function public.notifications_push_claim(integer,uuid[],uuid[]), public.notifications_push_finish(uuid,uuid,text[],boolean) from public,anon,authenticated;
grant execute on function public.notifications_push_claim(integer,uuid[],uuid[]), public.notifications_push_finish(uuid,uuid,text[],boolean) to service_role;
-- New apps queue before requesting immediate delivery. Old app notify_send stays compatible.
create function public.notify_send_pending(p_to uuid[],p_title text,p_body text,p_url text default null) returns json
language plpgsql security definer set search_path=public as $$
declare u uuid; nid uuid; ids uuid[]:='{}';
begin
  if auth.uid() is null or nullif(btrim(p_title),'') is null then return '[]'::json; end if;
  for u in select distinct t from unnest(coalesce(p_to,'{}'::uuid[])) t limit 8 loop
    if can_notify(auth.uid(),u) then
      insert into notifications(user_id,title,body,url) values(u,left(p_title,120),left(coalesce(p_body,''),300),p_url) returning id into nid;
      ids:=array_append(ids,nid);
    end if;
  end loop;
  return array_to_json(ids);
end $$;
revoke all on function public.notify_send_pending(uuid[],text,text,text) from public,anon;
grant execute on function public.notify_send_pending(uuid[],text,text,text) to authenticated;
commit;
