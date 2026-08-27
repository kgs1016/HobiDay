-- ═══════════════════════════════════════════════════════════════
--  "나가기" 를 두 갈래로 나눈다
-- ═══════════════════════════════════════════════════════════════
-- 나가기 버튼 하나가 상황을 안 가리고 늘 session_cancel 을 불렀다.
-- 모임이 이미 끝났거나 터진 방에서 눌러도 마찬가지였다. 그래서 —
--
--   어제 실제로 만난 모임에서 나가기를 누르면
--     · 신청비 10크레딧이 되돌아온다        (만나고 나서 환불)
--     · 내 매칭 기록에서 그 모임이 사라진다
--     · 확정이 1명 밑으로 떨어져 모임이 cancelled 로 뒤집히면서
--       호스트의 매칭 기록에서도 사라진다
--
-- 나갈 모임이 없는 방에서 모임을 나가려 한 게 원인이다. 둘로 나눈다.
--
--   모임이 아직 살아있다  → session_cancel      자리를 반납한다
--   이미 끝났거나 터졌다  → session_chat_leave  방에서만 빠진다
--
-- 그리고 환불 규칙을 되돌린다. 호스트가 받아준 순간부터는 내 자리가
-- 잡힌 것이고, 그걸 자의로 비우면 신청비는 돌려주지 않는다.
-- 승인 전(waiting)에 취소하는 건 아직 아무 자리도 안 잡힌 상태다.


-- ── 방에서만 빠지는 길 ────────────────────────────────────────
-- signups 는 그대로 둔다. 매칭 기록은 "확정으로 참가했다" 를 보는데,
-- 끝난 뒤에 방을 정리했다고 만난 사실이 없어지진 않는다.
alter table signups add column if not exists left_chat_at timestamptz;

create or replace function session_chat_leave(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); me profiles; s sessions;
begin
  if not session_chat_member(p_session) then
    return json_build_object('error','not_allowed');
  end if;

  select * into s from sessions where id = p_session;

  /* 살아있는 모임에서는 이 길을 못 쓴다. 자리를 반납하지 않고 방만
     빠져나가면 호스트는 올 사람으로 세는데 오지 않는 사람이 생긴다. */
  if s.status <> 'cancelled' and s.ends_at > now() then
    return json_build_object('error','still_running');
  end if;

  update signups set left_chat_at = now()
   where session_id = p_session and user_id = me_id;

  -- 남은 사람에게는 누가 정리하고 나갔는지 보인다
  select * into me from profiles where id = me_id;
  insert into messages (session_id, sender_id, body, kind)
  values (p_session, me_id,
          coalesce(nullif(me.nickname,''), '참가자') || '님이 나갔어요', 'system');

  return json_build_object('ok', true);
end; $$;

revoke execute on function session_chat_leave(uuid) from public, anon;
grant execute on function session_chat_leave(uuid) to authenticated;


-- ── 자리를 반납하는 길 ────────────────────────────────────────
-- 20260825260000 의 본문에서 반환 조건만 되돌렸다.
create or replace function session_cancel(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); my signups; me profiles;
        left_cnt int; affected uuid[] := '{}';
begin
  select * into my from signups
   where session_id = p_session and user_id = me_id for update;
  if not found or my.status = 'cancelled' then
    return json_build_object('error','not_joined');
  end if;

  /* 호스트는 자기 모임에서 나갈 수 없다. 남은 사람들의 방을 만든 게
     호스트라서, 빠지는 게 아니라 지우는 것뿐이다 (session_delete).
     단체방에도 나가기 버튼이 생겼으니 여기서 막아둔다. */
  if exists (select 1 from sessions
              where id = p_session and host_id = me_id) then
    return json_build_object('error','host');
  end if;

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  /* 호스트가 받아준 뒤로는 내 자리가 잡힌 것이다. 그 자리를 자의로
     비우면 신청비는 안 돌려준다. 승인 전이면 잡힌 자리가 없다.
     모임이 무너져서 없어지는 경우는 여기가 아니라 session_collapse 가
     맡고, 그쪽은 남은 사람 전원에게 돌려준다. */
  if my.status = 'waiting' then
    perform session_fee_refund(p_session, me_id);
  end if;

  /* 방이 열려 있으면 누가 빠졌는지 남긴다. 취소로 이어지더라도 방은
     24시간 더 열려 있어서 남은 사람이 이 줄을 본다. */
  if my.status = 'confirmed' and session_chat_open(p_session) then
    select * into me from profiles where id = me_id;
    insert into messages (session_id, sender_id, body, kind)
    values (p_session, me_id,
            coalesce(nullif(me.nickname,''), '참가자') || '님이 나갔어요', 'system');
  end if;

  /* 확정이 1명까지 떨어지면 모임이 무너진 것이다. 호스트 혼자 남은 방은
     이야기할 상대가 없다 — 모임을 취소로 넘긴다. */
  select count(*) into left_cnt from signups
   where session_id = p_session and status = 'confirmed';

  if left_cnt < 2 then
    affected := session_collapse(p_session);
    return json_build_object('ok', true, 'cancelled', true, 'notify', affected);
  end if;

  return json_build_object('ok', true);
end; $$;

revoke execute on function session_cancel(uuid) from public, anon;
grant execute on function session_cancel(uuid) to authenticated;


-- ── 나간 사람에게는 방이 안 보인다 ────────────────────────────
-- 목록·입장·안읽음 세 군데가 같은 조건을 봐야 한다. 한 군데라도
-- 빠지면 "목록엔 있는데 안 열린다" 같은 어긋남이 생긴다.

create or replace function my_session_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json)
  from (
    select s.id as session_id,
           s.gym,
           (s.host_id = auth.uid()) as i_am_host,
           s.starts_at,
           s.ends_at,
           s.status,
           s.cancelled_at,
           s.capacity,
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'confirmed'
               and g.left_chat_at is null) as members,
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
       and g.left_chat_at is null
       -- 취소 여부는 session_chat_open 이 함께 본다 (취소 뒤 24시간)
       and session_chat_open(s.id)
       and not exists (
         select 1 from signups b
          where b.session_id = s.id and b.status = 'confirmed'
            and blocked_with(b.user_id))
  ) t;
$$;

create or replace function session_chat_member(p_session uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from signups g
     where g.session_id = p_session
       and g.user_id = auth.uid()
       and g.status = 'confirmed'
       and g.left_chat_at is null)
   and session_chat_open(p_session)
   and not exists (
    select 1 from signups b
     where b.session_id = p_session and b.status = 'confirmed'
       and blocked_with(b.user_id))
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
        where g.status = 'confirmed'
          and g.left_chat_at is null
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

revoke execute on function my_session_chats() from public, anon;
grant  execute on function my_session_chats() to authenticated;
revoke execute on function session_chat_member(uuid) from public, anon, authenticated;
revoke execute on function inbox_counts() from public, anon;
grant  execute on function inbox_counts() to authenticated;
