-- ═══════════════════════════════════════════════════════════════
--  나간 사람을 방에 남긴다 · 관심 방은 둘 다 나가야 지운다
-- ═══════════════════════════════════════════════════════════════
-- 지금은 사람이 조용히 사라진다. 모임 방에서 한 명이 빠져도 아무 말이
-- 없고, 1:1 관심 방은 한쪽이 나가면 양쪽 모두에게서 방이 없어진다 —
-- 남은 사람은 대화가 통째로 사라진 이유를 알 수 없다.
--
--   모임 방   누가 나가면 "○○님이 나갔어요" 한 줄이 남는다
--   관심 방   나간 사람에게서만 없어진다. 남은 사람은 그 한 줄을 보고,
--             그 사람까지 나가야 방과 대화가 실제로 지워진다
--
-- 시스템 줄은 messages 에 kind='system' 으로 넣는다. 따로 테이블을 두면
-- 대화와 시간 순서로 섞어 보여주기가 번거롭다. 문장은 넣을 때 완성해서
-- 저장한다 — 목록 미리보기가 그대로 쓸 수 있고, 나중에 닉네임이 바뀌어도
-- 그때 있었던 일은 그대로 남는다.

alter table messages add column if not exists kind text not null default 'user';
do $$ begin
  alter table messages add constraint messages_kind_check
    check (kind in ('user','system'));
exception when duplicate_object then null; end $$;

-- 1:1 방은 이제 한쪽만 나갈 수 있다. 누가 언제 나갔는지 따로 적는다.
alter table matches add column if not exists a_left_at timestamptz;
alter table matches add column if not exists b_left_at timestamptz;

-- 이미 닫힌 방은 "닫은 사람이 나갔다" 로 옮겨 적는다. 상대는 다시 보인다.
update matches
   set a_left_at = case when closed_by = user_a then closed_at end,
       b_left_at = case when closed_by = user_b then closed_at end
 where closed_at is not null and closed_by is not null
   and a_left_at is null and b_left_at is null;

/* 나가기. 한쪽만 나가면 방은 남는다 — 남은 사람이 "왜 없어졌지" 하지
   않도록. 두 번째 사람까지 나가면 그때 방과 대화를 지운다. */
create or replace function chat_leave(p_match uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m matches; me profiles; i_am_a boolean; other_left boolean;
begin
  select * into m from matches
   where id = p_match and auth.uid() in (user_a, user_b) for update;
  if not found then return json_build_object('error','not_allowed'); end if;

  i_am_a := (m.user_a = auth.uid());
  if (case when i_am_a then m.a_left_at else m.b_left_at end) is not null then
    return json_build_object('ok', true);          -- 이미 나갔다
  end if;

  other_left := (case when i_am_a then m.b_left_at else m.a_left_at end) is not null;
  if other_left then
    -- 둘 다 나갔다. 메시지는 cascade 로 함께 사라진다.
    delete from matches where id = p_match;
    return json_build_object('ok', true, 'deleted', true);
  end if;

  if i_am_a then
    update matches set a_left_at = now() where id = p_match;
  else
    update matches set b_left_at = now() where id = p_match;
  end if;

  select * into me from profiles where id = auth.uid();
  insert into messages (match_id, sender_id, body, kind)
  values (p_match, auth.uid(),
          coalesce(nullif(me.nickname,''), '상대방') || '님이 나갔어요', 'system');

  return json_build_object('ok', true);
end $$;

create or replace function my_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json) from (
    select m.id as match_id,
           m.session_id,
           s.gym,                      -- 관심 수락으로 생긴 방이면 NULL
           p.id   as partner_id,
           p.nickname,
           p.age,
           p.level,
           p.home_gym,
           p.photo,
           -- 상대가 나갔으면 입력창을 닫는다 (보낼 데가 없다)
           (case when m.user_a = auth.uid() then m.b_left_at else m.a_left_at end)
             is not null as partner_left,
           (select body from messages x
             where x.match_id = m.id order by x.created_at desc limit 1) as last_body,
           coalesce(
             (select max(created_at) from messages x where x.match_id = m.id),
             m.created_at) as last_at,
           (select count(*) from messages x
             where x.match_id = m.id
               and x.sender_id <> auth.uid()
               and x.created_at > coalesce(
                     (select r.last_read_at from chat_reads r
                       where r.match_id = m.id and r.user_id = auth.uid()),
                     '-infinity'::timestamptz)) as unread
      from matches m
      left join sessions s on s.id = m.session_id
      join profiles p
        on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
     where auth.uid() in (m.user_a, m.user_b)
       -- 내가 나갔으면 내 목록에서만 사라진다 (상대에겐 남아 있다)
       and (case when m.user_a = auth.uid() then m.a_left_at else m.b_left_at end)
             is null
       and not blocked_with(p.id)
  ) t;
$$;

create or replace function chat_messages(p_match uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare m matches; other uuid;
begin
  select * into m from matches
   where id = p_match and auth.uid() in (user_a, user_b);
  if not found then return json_build_object('error','not_allowed'); end if;
  if (case when m.user_a = auth.uid() then m.a_left_at else m.b_left_at end)
       is not null then
    return json_build_object('error','closed');
  end if;

  other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  if blocked_with(other) then return json_build_object('error','blocked'); end if;

  return (
    select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) from (
      select id, sender_id, body, created_at, kind,
             (sender_id = auth.uid()) as mine
        from messages where match_id = p_match
    ) t
  );
end; $$;

create or replace function chat_send(p_match uuid, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare m matches; other uuid;
begin
  if length(trim(coalesce(p_body,''))) = 0 then
    return json_build_object('error','empty');
  end if;

  select * into m from matches
   where id = p_match and auth.uid() in (user_a, user_b);
  if not found then return json_build_object('error','not_allowed'); end if;
  if (case when m.user_a = auth.uid() then m.a_left_at else m.b_left_at end)
       is not null then
    return json_build_object('error','closed');
  end if;
  -- 상대가 나간 방에는 보낼 수 없다. 읽을 사람이 없다.
  if (case when m.user_a = auth.uid() then m.b_left_at else m.a_left_at end)
       is not null then
    return json_build_object('error','left');
  end if;

  other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  if blocked_with(other) then return json_build_object('error','blocked'); end if;

  insert into messages (match_id, sender_id, body)
  values (p_match, auth.uid(), trim(p_body));

  return json_build_object('ok', true);
end; $$;

/* 다시 수락하면 나갔던 표시도 지운다 — 새로 시작하는 방이다.
   지난 대화는 그대로 남는다 (한쪽만 나간 방은 안 지워졌으므로). */
create or replace function request_respond(p_request uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare r requests; a uuid; b uuid; mid uuid;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.to_id <> auth.uid() then
    return json_build_object('error','not_allowed');
  end if;
  if r.status <> 'pending' then
    return json_build_object('error','already', 'status', r.status);
  end if;

  update requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_request;

  if not p_accept then
    -- 반환하지 않는다. 관심은 보내는 순간 쓰는 것이다 (아래 설명)
    return json_build_object('ok', true, 'accepted', false);
  end if;

  -- 수락 → 채팅방 개설 (모임 없이 생긴 매칭이라 session_id 는 NULL)
  a := least(r.from_id, r.to_id);
  b := greatest(r.from_id, r.to_id);

  insert into matches (session_id, user_a, user_b)
  values (null, a, b)
  on conflict do nothing;

  select id into mid from matches
   where session_id is null and user_a = a and user_b = b;

  -- 전에 나가서 닫혀 있던 방이면 다시 연다 — 새로 수락했다는 건
  -- 다시 이야기하겠다는 뜻이다 (지난 대화도 그대로 남아 있다)
  update matches set closed_at = null, closed_by = null,
                     a_left_at = null, b_left_at = null
   where id = mid
     and (closed_at is not null or a_left_at is not null or b_left_at is not null);

  return json_build_object('ok', true, 'accepted', true, 'match_id', mid);
end; $$;

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

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  -- 대기 중 취소는 반환. 확정 후 취소는 반환 없음 —
  -- 수락된 자리를 비우는 건 남은 사람들에게 비용이다.
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

create or replace function session_chat_messages(p_session uuid)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not session_chat_member(p_session) then
    return json_build_object('error','not_allowed');
  end if;

  return (
    select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) from (
      select x.id, x.sender_id, x.body, x.created_at, x.kind,
             (x.sender_id = auth.uid()) as mine,
             p.nickname as sender_name,
             p.photo    as sender_photo,
             (x.sender_id = s.host_id) as sender_is_host
        from messages x
        join sessions s on s.id = x.session_id
        left join profiles p on p.id = x.sender_id
       where x.session_id = p_session
    ) t
  );
end $$;

revoke execute on function chat_leave(uuid)                 from public, anon;
revoke execute on function my_chats()                       from public, anon;
revoke execute on function chat_messages(uuid)              from public, anon;
revoke execute on function chat_send(uuid,text)             from public, anon;
revoke execute on function request_respond(uuid,boolean)    from public, anon;
revoke execute on function session_cancel(uuid)             from public, anon;
revoke execute on function session_chat_messages(uuid)      from public, anon;
grant execute on function
  chat_leave(uuid), my_chats(), chat_messages(uuid), chat_send(uuid,text),
  request_respond(uuid,boolean), session_cancel(uuid),
  session_chat_messages(uuid)
to authenticated;


/* ── 버그 수정 ────────────────────────────────────────────
   session_chat_member 가 아직 "모임이 취소되지 않았을 것" 을 보고 있었다.
   방이 열려 있는지는 session_chat_open 이 판단하는데(취소 뒤 24시간까지
   열어둔다), 이 함수만 따로 취소를 보는 바람에 —
     목록(my_session_chats)  → 방이 보인다
     열기(session_chat_messages) → not_allowed
   취소된 모임의 방을 눌러도 아무것도 안 열렸다. 조건을 한 군데로 모은다. */
create or replace function session_chat_member(p_session uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from signups g
     where g.session_id = p_session
       and g.user_id = auth.uid()
       and g.status = 'confirmed')
   and session_chat_open(p_session)
   and not exists (
    select 1 from signups b
     where b.session_id = p_session and b.status = 'confirmed'
       and blocked_with(b.user_id))
$$;

revoke execute on function session_chat_member(uuid) from public, anon, authenticated;

/* 안읽음 배지도 같은 이유로 어긋나 있었다. 취소된 모임의 방은 24시간
   더 열려 있는데, 그 방에 온 메시지는 배지에 안 세어졌다. */
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
revoke execute on function inbox_counts() from public, anon;
grant execute on function inbox_counts() to authenticated;
