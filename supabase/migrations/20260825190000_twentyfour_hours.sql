-- ═══════════════════════════════════════════════════════════════
--  기준 시간을 24시간으로, 모임은 시작 시각 기준으로
-- ═══════════════════════════════════════════════════════════════
-- 3시간은 짧았다. 저녁 모임이 끝나고 자고 일어나면 채팅방도 기록도
-- 사라져 있다. 전부 24시간으로 늘린다.
--
--   모임 채팅방      끝나고 24시간
--   신청한 모임      모임 시작 + 24시간   ← 기준 자체를 바꿨다
--   보낸 관심(수락)  수락하고 24시간
--
-- 신청한 모임은 20260825180000 에서 상태별로 다른 시각(decided_at ·
-- cancelled_at · ends_at)을 썼는데, 모임 시작 시각 하나로 통일한다.
-- 거절당했든 취소됐든 "그 모임에 가려던 날" 이 지나면 내려가는 게
-- 설명하기 쉽다. decided_at · cancelled_at 컬럼은 남긴다 — 언제
-- 무슨 일이 있었는지는 여전히 알아야 한다.
--
-- 보낸 관심은 거절도 곧바로 내린다. 거절과 무응답 만료가 똑같이
-- "사라짐" 으로 보여서 사라진 이유를 알 수 없다 — 짝사랑을 드러내지
-- 않으면서, 거절당한 걸 '기다리는 중' 이라고 잘못 말하지도 않는다.
-- 대신 보내기 전에 두 경우를 다 안내한다.
--
-- ⚠️ 네 함수 모두 이전 본문을 그대로 들고 온 뒤 조건만 고쳤다.
--    create or replace 는 통째로 갈아치운다.

create or replace function session_chat_open(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions s
                  where s.id = p_session and s.status <> 'cancelled')
     and (select count(*) from signups g
           where g.session_id = p_session and g.status = 'confirmed') >= 2
     -- 끝나고 24시간이 지나면 닫는다. 실제 메시지는 크론이 지우지만,
     -- 크론을 기다리지 않고 이 순간부터 방이 없는 것처럼 보여야 한다.
     and exists (select 1 from sessions s
                  where s.id = p_session
                    and s.ends_at > now() - interval '24 hours')
$$;

create or replace function session_chats_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with dead as (
    select s.id from sessions s
     where s.ends_at <= now() - interval '24 hours'
  ), gone as (
    delete from messages m
     where m.session_id in (select id from dead)
    returning 1
  )
  select count(*) into n from gone;

  delete from session_chat_reads r
   where r.session_id in (select s.id from sessions s
                           where s.ends_at <= now() - interval '24 hours');
  return n;
end; $$;

create or replace function my_signups()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.status as session_status,
           -- 시작한 모임의 대기 신청은 이미 끝난 것이다 (크론이 곧 반환한다)
           case when g.status = 'waiting' and s.starts_at <= now()
                then 'cut' else g.status end as my_status,
           h.nickname as host_nickname, h.photo as host_photo
      from signups g
      join sessions s on s.id = g.session_id
      left join profiles h on h.id = s.host_id
     where g.user_id = auth.uid()
       and g.status <> 'cancelled'
       and s.host_id <> auth.uid()
       -- 기준은 모임 시작 시각 하나뿐이다 — 그 사이에 거절당했든
       -- 취소됐든 상관없이 그날이 지나면 내려간다. 상태마다 다른 시각을
       -- 쓰면 "왜 이건 아직 있고 저건 없지" 를 설명할 수 없다.
       and s.starts_at > now() - interval '24 hours'
       and (s.host_id is null or not blocked_with(s.host_id))
  ) t;
$$;

create or replace function requests_sent()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select r.id, r.created_at,
           r.status,
           p.id as to_id, p.nickname, p.age, p.level, p.home_gym
      from requests r join profiles p on p.id = r.to_id
     where r.from_id = auth.uid()
       and r.created_at > now() - interval '7 days'
       -- 아직 답이 없는 것만 남긴다.
       --   수락  채팅방이 생겼다 — 24시간 뒤 내린다 (할 일이 채팅으로 갔다)
       --   거절  곧바로 내린다
       -- 거절과 무응답 만료가 똑같이 "사라짐" 으로 보여서, 사라진 이유가
       -- 둘 중 무엇인지 알 수 없다. 짝사랑을 드러내지 않는 방식이면서,
       -- '기다리는 중' 이라고 잘못 말하지도 않는다.
       -- 대신 보내기 전에 두 경우를 다 안내한다 (화면 문구).
       and (r.status = 'pending'
         or (r.status = 'accepted'
             and coalesce(r.responded_at, r.created_at) > now() - interval '24 hours'))
       and not blocked_with(p.id)
  ) t;
$$;

revoke execute on function session_chat_open(uuid)   from public, anon, authenticated;
revoke execute on function session_chats_purge()     from public, anon, authenticated;
revoke execute on function my_signups()              from public, anon;
revoke execute on function requests_sent()           from public, anon;
grant execute on function my_signups(), requests_sent() to authenticated;
