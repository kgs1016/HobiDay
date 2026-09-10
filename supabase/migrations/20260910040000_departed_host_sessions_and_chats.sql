-- 호스트 탈퇴를 모든 프로필 삭제 경로에 적용한다. 종료된 모임 기록은 보존한다.
alter table sessions add column host_departed boolean not null default false;

create function cleanup_departed_participation()
returns trigger language plpgsql security definer set search_path = public as $$
declare g record;
begin
  -- 1:1 메시지의 match CASCADE와 sender SET NULL이 충돌하지 않도록 방부터 정리한다.
  delete from matches where user_a = old.id or user_b = old.id;

  -- 호스트가 없으면 조율할 수 없는 방이므로 즉시 채팅을 닫는다.
  update sessions set host_departed = true, chat_opened_at = null where host_id = old.id;
  for g in select id from sessions
    where host_id = old.id and ends_at > now() and status <> 'cancelled'
    order by id for update
  loop
    perform session_collapse(g.id);
  end loop;

  -- 미래 모임의 참가자 탈퇴도 동일하게 정리한다. 이미 함께한 이력은 건드리지 않는다.
  for g in select s.id from sessions s join signups p on p.session_id = s.id
    where p.user_id = old.id and p.status = 'confirmed' and s.starts_at > now()
      and s.status <> 'cancelled' order by s.id for update of s
  loop
    update signups set status = 'cancelled' where session_id = g.id and user_id = old.id;
    if (select count(*) from signups where session_id = g.id and status = 'confirmed') < 2 then
      perform session_collapse(g.id);
    end if;
  end loop;

  -- 살아 있는 모임의 다른 참가자 대화는 유지하되 탈퇴자의 옛 닉네임은 표시하지 않는다.
  update messages set sender_name = null where sender_id = old.id and match_id is null;
  return old;
end $$;
revoke all on function cleanup_departed_participation() from public, anon, authenticated;
create trigger profiles_cleanup_departed_participation
before delete on profiles for each row execute function cleanup_departed_participation();

-- 계정 삭제와 관리 도구의 직접 삭제가 같은 트리거를 거치도록 한다.
create or replace function account_delete()
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  delete from auth.users where id = auth.uid();
  return json_build_object('ok',true);
end $$;
revoke execute on function account_delete() from public, anon;
grant execute on function account_delete() to authenticated;

-- 이미 남은 고아 모임도 정리한다. 종료된 모임의 기록과 다른 사람 메시지는 삭제하지 않는다.
update sessions set host_departed = true, chat_opened_at = null where host_id is null;
update sessions set status = 'cancelled', cancelled_at = coalesce(cancelled_at,now())
 where host_id is null and ends_at > now() and status in ('open','confirmed');
update messages set sender_name = null where sender_id is null and sender_name is not null;

create or replace function session_chat_open(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions s
     where s.id = p_session
       and not s.host_departed
       and s.chat_opened_at is not null
       and case when s.status = 'cancelled'
                then coalesce(s.cancelled_at, s.ends_at)
                else s.ends_at
           end > now() - interval '24 hours')
$$;
revoke execute on function session_chat_open(uuid) from public, anon, authenticated;

create or replace function session_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id,
           coalesce(mg.name, s.gym) as gym,
           s.gym_id,
           mg.thumbnail_url as gym_thumb,
           s.starts_at, s.ends_at, s.capacity,
           s.level_min, s.level_max, s.age_min, s.age_max,
           s.after_meal, s.note, s.status,
           s.host_id,
           h.nickname as host_nickname,
           h.photo    as host_photo,
           h.age      as host_age,
           h.area     as host_area,
           h.level    as host_level,
           (s.host_id = auth.uid()) as i_am_host,
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'confirmed') as confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      join profiles h on h.id = s.host_id
      left join gyms mg on mg.id = s.gym_id
     where s.status in ('open','confirmed')
       and not s.host_departed
       and s.starts_at > now()
       and (s.host_id = auth.uid()
         or ((s.host_id is null or not blocked_with(s.host_id))
             and not exists (
               select 1 from signups g
                where g.session_id = s.id and g.status = 'confirmed'
                  and blocked_with(g.user_id))))
  ) t;
$$;
revoke execute on function session_list() from public, anon;
grant execute on function session_list() to authenticated;
