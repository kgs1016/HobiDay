-- ═══════════════════════════════════════════════════════════════
--  거절 알림에 누가 거절했는지 적는다 · 거절 카드는 하루만 남는다
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 Run · 몇 번 돌려도 안전
-- ═══════════════════════════════════════════════════════════════
--
-- 직전(20260907180000)에서 거절을 드러내기로 하면서도 알림에는 이름을
-- 뺐다. "알아야 할 건 신청이 끝났다는 것이지 누가 그랬는지가 아니다" 는
-- 판단이었는데, 여러 명에게 보내놓은 상태에서는 어느 신청이 끝난 건지
-- 알 수가 없다. 이름을 적는다.
--
-- 목록에 남는 기간도 수락과 같게 맞춘다.
--
--   수락   답한 지 24시간   (할 일이 채팅방으로 넘어갔다)
--   거절   답한 지 24시간   (알림함에 남아 있다 — 그쪽이 안 읽으면 안 사라진다)
--   무응답 보낸 지 7일      (크론이 행을 지운다)
--
-- 거절을 7일씩 남겨두면 "거절됨" 카드가 일주일 내내 자리를 차지한다.
-- 놓칠 걱정은 알림이 받는다 — 알림은 읽을 때까지 안 사라진다.

-- ───────────────────────────────────────────────────────────────
--  1. 거절 알림 — 이름을 적고 문구를 줄인다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260907180000 의 본문을 그대로 들고 온 뒤 거절 갈래만 바꿨다.

create or replace function request_respond(p_request uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare r requests; me profiles; a uuid; b uuid; mid uuid; who text;
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
    perform request_fee_refund(p_request);

    -- 탈퇴 직후처럼 프로필이 없을 수도 있다. 그때도 알림은 가야 한다.
    select * into me from profiles where id = auth.uid();
    who := coalesce(nullif(me.nickname, ''), '상대');

    perform notify_add(r.from_id, '채팅 신청이 거절됐어요',
      who || '님이 거절했어요.', '/inbox');
    -- 앱이 푸시를 쏜다 (DB 는 못 쏜다). 같은 문구를 쓰라고 이름도 같이 준다.
    return json_build_object('ok', true, 'accepted', false,
                             'notify', r.from_id, 'by', who);
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
  update matches
     set closed_at = null, a_left_at = null, b_left_at = null
   where id = mid;

  return json_build_object('ok', true, 'accepted', true, 'match_id', mid);
end; $$;

revoke execute on function request_respond(uuid,boolean) from public, anon;
grant  execute on function request_respond(uuid,boolean) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 답이 온 신청은 하루만 목록에 남는다
-- ───────────────────────────────────────────────────────────────
-- 수락·거절을 한 조건으로 묶는다. 답이 온 것은 24시간, 답이 없는 것은
-- 보낸 지 7일 — 이제 예외가 없다.

create or replace function requests_sent()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select r.id, r.created_at, r.responded_at, r.status,
           p.id as to_id, p.nickname, p.age, p.level, p.home_gym
      from requests r join profiles p on p.id = r.to_id
     where r.from_id = auth.uid()
       and r.created_at > now() - interval '7 days'
       and (r.status = 'pending'
         or coalesce(r.responded_at, r.created_at) > now() - interval '24 hours')
       and not blocked_with(p.id)
  ) t;
$$;

revoke execute on function requests_sent() from public, anon;
grant  execute on function requests_sent() to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3. 배지도 같은 창을 본다
-- ───────────────────────────────────────────────────────────────
-- 목록에서 내려간 것을 배지가 세면 눌러도 안 없어지는 숫자가 생긴다.

create or replace function sent_changes()
returns int language sql stable security definer set search_path = public as $$
  select (
    (select count(*)
       from signups g
       join sessions s on s.id = g.session_id
      where g.user_id = auth.uid()
        and g.status in ('confirmed','cut')
        and g.decided_at is not null
        and g.decided_at > coalesce(p.sent_seen_at, '-infinity'::timestamptz)
        and s.host_id <> auth.uid()
        -- my_signups 와 같은 창
        and s.starts_at > now() - interval '24 hours'
        and (s.host_id is null or not blocked_with(s.host_id)))
  + (select count(*)
       from requests r
      where r.from_id = auth.uid()
        and r.status in ('accepted','declined')
        and r.responded_at > coalesce(p.sent_seen_at, '-infinity'::timestamptz)
        -- requests_sent 와 같은 창
        and r.created_at > now() - interval '7 days'
        and r.responded_at > now() - interval '24 hours'
        and not blocked_with(r.to_id))
  )::int
  from profiles p where p.id = auth.uid();
$$;

revoke execute on function sent_changes() from public, anon;
grant  execute on function sent_changes() to authenticated;
