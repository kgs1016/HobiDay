-- ═══════════════════════════════════════════════════════════════
--  거절과 무응답을 구분해서 알려준다
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 Run · 몇 번 돌려도 안전
-- ═══════════════════════════════════════════════════════════════
--
-- 지금까지는 채팅 신청이 거절돼도 '기다리는 중' 으로 보여줬다. 거절당한
-- 건지 아직 안 본 건지 구분되면 안 된다는 규칙이었다 — 짝사랑 비노출.
-- 소개팅 앱이라 상처를 줄이는 게 우선이었다.
--
-- 앱이 매칭 앱으로 바뀌면서 그 전제가 사라졌다. 같이 탈 사람을 찾는
-- 자리에서 "이 사람은 답을 안 한 건가, 안 하겠다는 건가" 를 모르는 건
-- 배려가 아니라 그냥 불편이다. 다음 사람에게 넘어갈 수가 없다.
--
--   전       거절 · 무응답이 똑같이 '기다리는 중'
--   이제     거절은 '거절됨' · 무응답은 '기다리는 중', 거절되면 알림도 간다
--
-- ⚠️ 남는 규칙: 한 사람에게는 한 번만 보낼 수 있다(requests 의
--    unique(from_id, to_id)). 거절된 행은 지우지 않으므로 재신청은
--    여전히 막힌다. 이건 이번 변경과 별개라 그대로 뒀다.

-- ───────────────────────────────────────────────────────────────
--  1. 보낸 목록이 진짜 상태를 말한다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260825200000 의 본문을 그대로 들고 온 뒤 case 문(상태 뭉개기)만
--    걷어냈다. 남는 창(7일 · 수락 24시간)은 그대로다.

create or replace function requests_sent()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select r.id, r.created_at, r.responded_at,
           -- 있는 그대로 — pending · accepted · declined
           r.status,
           p.id as to_id, p.nickname, p.age, p.level, p.home_gym
      from requests r join profiles p on p.id = r.to_id
     where r.from_id = auth.uid()
       and r.created_at > now() - interval '7 days'
       -- 수락된 것만 일찍 내린다 — 할 일이 채팅으로 넘어갔다.
       -- 거절은 7일을 채운다. 이제 감출 게 아니라 읽혀야 하는 소식이고,
       -- 하루 만에 사라지면 앱을 며칠 안 연 사람은 영영 못 본다.
       and (r.status <> 'accepted'
         or coalesce(r.responded_at, r.created_at) > now() - interval '24 hours')
       and not blocked_with(p.id)
  ) t;
$$;

revoke execute on function requests_sent() from public, anon;
grant  execute on function requests_sent() to authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 거절하면 알림이 간다
-- ───────────────────────────────────────────────────────────────
-- session_reject 가 이미 같은 일을 한다 — 거절당한 사람에게 서버가 직접
-- 남긴다. 관계가 끊기는 자리라 앱이 대신 보내줄 사람이 없기 때문이다.
-- 채팅 신청 거절도 같은 자리다.
--
-- 누가 거절했는지는 쓰지 않는다. 이름을 박으면 알림함에 "○○님이
-- 거절했어요" 가 줄줄이 남는데, 알아야 할 것은 "이 신청은 끝났다" 이지
-- 누가 그랬는지가 아니다.
--
-- ⚠️ 20260821130000 의 본문을 그대로 들고 온 뒤 거절 갈래에 알림만 더했다.

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
    perform request_fee_refund(p_request);
    perform notify_add(r.from_id, '채팅 신청 결과를 알려드려요',
      '보낸 채팅 신청이 이번엔 연결되지 않았어요.', '/inbox');
    -- 보낸 사람 id 를 돌려준다 — 앱이 푸시를 쏜다 (DB 는 못 쏜다)
    return json_build_object('ok', true, 'accepted', false, 'notify', r.from_id);
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
--  3. 보낸 신청 배지 — 거절도 센다
-- ───────────────────────────────────────────────────────────────
-- 20260907160000 에서는 거절을 뺐다. 거절과 무응답을 구분해주지 않던
-- 시절이라 배지가 그 규칙을 깰 수 있었기 때문이다. 이제 구분해서
-- 보여주므로 배지도 같이 센다 — 결과가 나온 건 다 세는 게 맞다.

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
        and (r.status <> 'accepted'
          or r.responded_at > now() - interval '24 hours')
        and not blocked_with(r.to_id))
  )::int
  from profiles p where p.id = auth.uid();
$$;

revoke execute on function sent_changes() from public, anon;
grant  execute on function sent_changes() to authenticated;
