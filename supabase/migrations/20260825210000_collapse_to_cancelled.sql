-- ═══════════════════════════════════════════════════════════════
--  확정이 1명이면 취소 처리 · 취소된 방도 24시간은 열어둔다
-- ═══════════════════════════════════════════════════════════════
-- 채팅방을 확정 2명 기준으로 바꾸면서, 사람이 빠져 1명이 되면 방이
-- 닫히게 됐다. 그런데 모임 자체는 sessions.status = 'confirmed' 로
-- 남는다 — 아무도 안 오는 모임이 DB 상으로는 "성사된 모임" 이다.
-- 매칭 기록에도 들어가고, 호스트는 취소도 못 한 채로 남는다.
--
-- 확정이 1명(= 호스트 혼자)이 되는 순간 모임을 취소로 넘긴다.
--   방          곧바로 닫힌다 (확정 2명 조건에 걸린다)
--   메시지      24시간 뒤 크론이 지운다
--   매칭 기록   안 들어간다 (confirmed·done 만 넣는다)
--   신청비      남아 있던 사람에게 돌려준다 — 자기 의지로 나간 게
--               아니라 모임이 없어진 것이다
--
-- 호스트가 직접 삭제한 모임(session_delete)도 같은 'cancelled' 다.
-- 그쪽은 확정 인원이 그대로 남아 있으니 방이 24시간 더 열려 있는다 —
-- 왜 없어졌는지 서로 말할 시간은 준다. 그리고 24시간 뒤 함께 지워진다.
--
-- 그래서 방이 열려 있는 조건을 둘로 정리했다.
--   확정 2명 이상  +  (끝난 지 | 취소된 지) 24시간 이내
--
-- 크론도 같이 고친다. 취소는 모임 날짜보다 먼저 올 수 있어서 ends_at
-- 만 보면 취소된 모임의 메시지가 영영 안 지워진다.
--
-- ⚠️ 네 함수 모두 이전 본문을 그대로 들고 온 뒤 필요한 곳만 고쳤다.
--    create or replace 는 통째로 갈아치운다.

create or replace function session_cancel(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); my signups; s sessions;
        left_cnt int; g record; affected uuid[] := '{}';
begin
  select * into my from signups
   where session_id = p_session and user_id = me_id for update;
  if not found or my.status = 'cancelled' then
    return json_build_object('error','not_joined');
  end if;

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  -- 대기 중 취소는 반환. 확정 후 취소는 반환 없음 —
  -- 수락된 자리를 비우는 건 남은 사람들에게 비용이다.
  if my.status = 'waiting' then
    perform session_fee_refund(p_session, me_id);
  end if;

  /* 확정이 1명까지 떨어지면 모임이 무너진 것이다. 호스트 혼자 남은 방은
     이야기할 상대가 없다 — 모임을 취소 처리하고 방을 닫는다.
     이미 취소된 모임이면 아무것도 하지 않는다(두 번 환불하면 안 된다). */
  select * into s from sessions where id = p_session for update;
  select count(*) into left_cnt from signups
   where session_id = p_session and status = 'confirmed';

  if s.status <> 'cancelled' and left_cnt < 2 then
    update sessions set status = 'cancelled', cancelled_at = now()
     where id = p_session;

    -- 남은 사람은 자기 의지로 나간 게 아니다. 모임이 없어진 거라 돌려준다.
    for g in
      select user_id from signups
       where session_id = p_session
         and status in ('waiting','confirmed')
         and user_id <> s.host_id
    loop
      perform session_fee_refund(p_session, g.user_id);
      affected := affected || g.user_id;
    end loop;

    return json_build_object('ok', true, 'cancelled', true, 'notify', affected);
  end if;

  return json_build_object('ok', true);
end; $$;

create or replace function session_chat_open(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  /* 방이 열려 있는 조건은 둘뿐이다.
       1. 확정이 2명 이상      — 호스트 혼자 남으면 이야기할 상대가 없다
       2. 끝난 지 24시간 이내  — 취소된 모임은 "취소된 지" 24시간 이내
     취소는 모임 날짜보다 먼저 올 수 있어서 ends_at 만 보면 안 된다.
     취소돼도 바로 닫지 않는다 — 왜 없어졌는지 서로 말할 시간은 준다.
     실제 메시지는 크론이 지우지만, 크론을 기다리지 않고 이 순간부터
     방이 없는 것처럼 보여야 한다. */
  select (select count(*) from signups g
           where g.session_id = p_session and g.status = 'confirmed') >= 2
     and exists (
       select 1 from sessions s
        where s.id = p_session
          and case when s.status = 'cancelled'
                   then coalesce(s.cancelled_at, s.ends_at)
                   else s.ends_at
              end > now() - interval '24 hours')
$$;

create or replace function my_session_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json)
  from (
    select s.id as session_id,
           s.gym,
           s.starts_at,
           s.ends_at,
           s.status,
           s.cancelled_at,
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
       -- 취소 여부는 session_chat_open 이 함께 본다 (취소 뒤 24시간)
       and session_chat_open(s.id)
       and not exists (
         select 1 from signups b
          where b.session_id = s.id and b.status = 'confirmed'
            and blocked_with(b.user_id))
  ) t;
$$;

create or replace function session_chats_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  /* 지울 대상 = 끝난 지 24시간 지난 모임 + 취소된 지 24시간 지난 모임.
     취소는 모임 날짜보다 먼저 올 수 있어서 ends_at 만 보면 영영 안 지워진다. */
  with dead as (
    select s.id from sessions s
     where s.ends_at <= now() - interval '24 hours'
        or (s.status = 'cancelled'
            and s.cancelled_at is not null
            and s.cancelled_at <= now() - interval '24 hours')
  ), gone as (
    delete from messages m
     where m.session_id in (select id from dead)
    returning 1
  )
  select count(*) into n from gone;

  delete from session_chat_reads r
   where r.session_id in (
     select s.id from sessions s
      where s.ends_at <= now() - interval '24 hours'
         or (s.status = 'cancelled'
             and s.cancelled_at is not null
             and s.cancelled_at <= now() - interval '24 hours'));
  return n;
end; $$;

revoke execute on function session_cancel(uuid)      from public, anon;
revoke execute on function session_chat_open(uuid)   from public, anon, authenticated;
revoke execute on function session_chats_purge()     from public, anon, authenticated;
revoke execute on function my_session_chats()        from public, anon;
grant execute on function session_cancel(uuid), my_session_chats() to authenticated;
