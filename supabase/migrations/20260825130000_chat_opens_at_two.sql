-- ═══════════════════════════════════════════════════════════════
--  모임 채팅방은 호스트 말고 한 명만 확정되면 열린다
-- ═══════════════════════════════════════════════════════════════
-- 지금은 정원이 꽉 차야(sessions.status = 'confirmed') 방이 열린다.
-- 2:2 면 네 명이 다 모여야 한다는 뜻이라, 그 전까지 호스트와 승인된
-- 참가자는 서로 말을 붙일 데가 없다. 시간·장소를 맞추는 게 이 방의
-- 쓸모인데 정작 맞출 사람이 생긴 시점에 방이 없다.
--
-- 새 기준: 확정된 사람이 2명 이상 (호스트 + 최소 1명).
-- 호스트는 session_create 가 자기를 confirmed 로 넣으므로, 승인
-- 한 번이면 곧바로 2명이 된다.
--
-- sessions.status 는 그대로 둔다 — 정원이 차면 여전히 'confirmed' 가
-- 되고, 조기 확정과 매칭 기록이 그 값을 쓴다. 방 열림만 떼어낸다.
--
-- ⚠️ 아래 네 함수는 이전 본문을 그대로 들고 온 뒤 조건만 바꿨다.
--    create or replace 는 통째로 갈아치운다.

-- 방이 열려 있는가. 판단을 한 군데로 모은다.
create or replace function session_chat_open(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions s
                  where s.id = p_session and s.status <> 'cancelled')
     and (select count(*) from signups g
           where g.session_id = p_session and g.status = 'confirmed') >= 2
$$;

create or replace function session_chat_member(p_session uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from signups g join sessions s on s.id = g.session_id
     where g.session_id = p_session
       and g.user_id = auth.uid()
       and g.status = 'confirmed'
       and s.status <> 'cancelled')
   and session_chat_open(p_session)
   and not exists (
    select 1 from signups b
     where b.session_id = p_session and b.status = 'confirmed'
       and blocked_with(b.user_id))
$$;

create or replace function my_session_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json)
  from (
    select s.id as session_id,
           s.gym,
           s.starts_at,
           s.capacity,
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'confirmed') as members,
           (select body from messages x
             where x.session_id = s.id order by x.created_at desc limit 1) as last_body,
           coalesce(
             (select max(created_at) from messages x where x.session_id = s.id),
             s.created_at) as last_at,
           (select count(*) from messages x
             where x.session_id = s.id
               and x.sender_id <> auth.uid()
               and x.created_at > coalesce(
                     (select r.last_read_at from session_chat_reads r
                       where r.session_id = s.id and r.user_id = auth.uid()),
                     '-infinity'::timestamptz)) as unread
      from sessions s
      join signups g on g.session_id = s.id
     where g.user_id = auth.uid()
       and g.status = 'confirmed'
       and s.status <> 'cancelled'
       and session_chat_open(s.id)
       and not exists (
         select 1 from signups b
          where b.session_id = s.id and b.status = 'confirmed'
            and blocked_with(b.user_id))
  ) t;
$$;

create or replace function inbox_counts()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'requests', (select count(*) from requests r
                  where r.to_id = auth.uid() and r.status = 'pending'
                    and r.created_at > now() - interval '7 days'
                    and not blocked_with(r.from_id))
              + (select count(*) from json_array_elements(my_hosted_requests()))
              + (select count(*) from json_array_elements(my_confirm_proposals())),
    'likes', (select count(*) from requests r
               where r.to_id = auth.uid() and r.status = 'pending'
                 and r.created_at > now() - interval '7 days'
                 and not blocked_with(r.from_id)),
    'hosted', (select count(*) from json_array_elements(my_hosted_requests())),
    'proposals', (select count(*) from json_array_elements(my_confirm_proposals())),
    'sent_today', (select count(*) from requests
                    where from_id = auth.uid() and created_at > now() - interval '1 day'),
    'daily_limit', request_daily_limit(),
    'unread_messages',
      (select count(*)
         from messages x
         join matches m on m.id = x.match_id
        where auth.uid() in (m.user_a, m.user_b)
          and m.closed_at is null
          and x.sender_id <> auth.uid()
          and not blocked_with(case when m.user_a = auth.uid() then m.user_b else m.user_a end)
          and x.created_at > coalesce(
                (select r.last_read_at from chat_reads r
                  where r.match_id = m.id and r.user_id = auth.uid()),
                '-infinity'::timestamptz))
      +
      (select count(*)
         from messages x
         join signups g on g.session_id = x.session_id and g.user_id = auth.uid()
         join sessions s on s.id = x.session_id
        where g.status = 'confirmed' and s.status <> 'cancelled'
          and session_chat_open(s.id)
          and x.sender_id <> auth.uid()
          and not exists (
            select 1 from signups b
             where b.session_id = s.id and b.status = 'confirmed'
               and blocked_with(b.user_id))
          and x.created_at > coalesce(
                (select r.last_read_at from session_chat_reads r
                  where r.session_id = s.id and r.user_id = auth.uid()),
                '-infinity'::timestamptz)),
    'unread_rooms', (
      select count(*) from matches m
       where auth.uid() in (m.user_a, m.user_b)
         and m.closed_at is null
         and not blocked_with(case when m.user_a = auth.uid() then m.user_b else m.user_a end)
         and exists (
           select 1 from messages x
            where x.match_id = m.id
              and x.sender_id <> auth.uid()
              and x.created_at > coalesce(
                    (select r.last_read_at from chat_reads r
                      where r.match_id = m.id and r.user_id = auth.uid()),
                    '-infinity'::timestamptz)))
  );
$$;

-- 승인 — 방이 "방금" 열렸는지와 정원이 "방금" 찼는지를 나눠서 돌려준다.
-- 예전엔 둘이 같은 사건이라 chat_opened 하나로 충분했다.
create or replace function session_approve(p_session uuid, p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; g signups; confirmed_cnt int; total_cnt int;
        opened boolean; filled boolean;
begin
  select * into s from sessions where id = p_session for update;
  if not found then return json_build_object('error','not_found'); end if;
  if s.host_id <> auth.uid() then return json_build_object('error','not_host'); end if;
  if blocked_with(p_user) then return json_build_object('error','blocked'); end if;

  select * into g from signups
   where session_id = p_session and user_id = p_user;
  if not found or g.status <> 'waiting' then
    return json_build_object('error','not_waiting');
  end if;

  select count(*) into confirmed_cnt from signups
   where session_id = p_session and gender = g.gender and status = 'confirmed';
  if confirmed_cnt >= s.capacity then
    return json_build_object('error','full');
  end if;

  update signups set status = 'confirmed'
   where session_id = p_session and user_id = p_user;

  -- 정원이 찼으면 모임 자체를 확정 (예전과 같음)
  filled := session_try_confirm(p_session);

  -- 이번 승인으로 딱 2명이 됐다면 방이 지금 막 열린 것
  select count(*) into total_cnt from signups
   where session_id = p_session and status = 'confirmed';
  opened := (total_cnt = 2);

  -- 알릴 사람 = 나(호스트)와 방금 승인한 사람을 뺀 확정자.
  -- 방금 승인된 사람은 클라이언트가 따로 "수락됐어요" 를 보낸다.
  return json_build_object('ok', true,
    'chat_opened', opened, 'confirmed', filled,
    'notify', case when opened or filled then
      (select coalesce(json_agg(x.user_id), '[]'::json)
         from signups x
        where x.session_id = p_session
          and x.status = 'confirmed'
          and x.user_id not in (s.host_id, p_user))
    else '[]'::json end);
end $$;

revoke execute on function session_chat_open(uuid)   from public, anon, authenticated;
revoke execute on function session_chat_member(uuid) from public, anon, authenticated;
revoke execute on function my_session_chats()        from public, anon;
revoke execute on function inbox_counts()            from public, anon;
revoke execute on function session_approve(uuid,uuid) from public, anon;

grant execute on function
  my_session_chats(), inbox_counts(), session_approve(uuid,uuid)
to authenticated;
