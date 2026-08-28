-- ═══════════════════════════════════════════════════════════════
--  거절도 7일을 채우고 사라진다
-- ═══════════════════════════════════════════════════════════════
-- 직전 커밋에서 거절된 관심을 곧바로 내렸는데, 그러면 "빨리 사라졌다"
-- 는 것 자체가 거절 신호가 된다. 7일을 기다렸다 사라지는 것과 구분되기
-- 때문이다. 짝사랑을 감추려면 두 경우가 똑같이 보여야 한다.
--
--   수락   24시간 뒤 내린다 (채팅방이 생겼으니 할 일이 옮겨갔다)
--   거절   7일 — 그동안 '기다리는 중' 으로 보인다
--   무응답 7일 — 크론이 행을 지운다
--
-- 그래서 status 를 pending 으로 보여주는 case 문도 되살린다.
-- 보내기 전에 "거절당해도 7일 뒤에 조용히 사라진다" 고 미리 알린다.
--
-- ⚠️ 20260825190000 의 본문을 그대로 들고 온 뒤 두 곳만 되돌렸다.

create or replace function requests_sent()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select r.id, r.created_at,
           -- 거절도 '기다리는 중' 으로 보여준다. 거절당한 건지 아직
           -- 안 본 건지 구분되면 안 된다 — 그게 짝사랑 비노출이다.
           case when r.status = 'accepted' then 'accepted' else 'pending' end as status,
           p.id as to_id, p.nickname, p.age, p.level, p.home_gym
      from requests r join profiles p on p.id = r.to_id
     where r.from_id = auth.uid()
       and r.created_at > now() - interval '7 days'
       -- 수락된 것만 일찍 내린다 — 할 일이 채팅으로 넘어갔다.
       -- 거절과 무응답은 똑같이 7일을 채우고 사라진다(위 created_at 조건).
       -- 거절이 일찍 사라지면 그 자체로 "거절당했다" 는 신호가 된다.
       and (r.status <> 'accepted'
         or coalesce(r.responded_at, r.created_at) > now() - interval '24 hours')
       and not blocked_with(p.id)
  ) t;
$$;

revoke execute on function requests_sent() from public, anon;
grant execute on function requests_sent() to authenticated;
