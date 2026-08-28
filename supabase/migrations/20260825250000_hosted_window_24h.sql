-- ═══════════════════════════════════════════════════════════════
--  내가 만든 모임 — 채팅방과 같은 시각에 내린다 (24시간)
-- ═══════════════════════════════════════════════════════════════
-- 다른 목록은 전부 24시간으로 맞췄는데 여기만 1시간이 남아 있었다.
-- 모임이 끝나고 한 시간이면, 자고 일어나서 "어제 그 모임 어떻게 됐지"
-- 하고 들어온 호스트에게는 이미 아무것도 없다.
--
-- 기준도 함께 맞춘다. 예전엔 취소된 모임도 ends_at 을 봤다. 다음 주
-- 모임을 오늘 취소하면 채팅방은 24시간 뒤에 사라지는데 카드는 다음
-- 주까지 "취소됨" 으로 남아 있었다. 이제 session_chat_open() 과 똑같은
-- 식을 쓴다 — 카드와 채팅방이 같은 순간에 사라진다.
--
--   성사되고 끝남   ends_at    + 24시간
--   취소·무산       cancelled_at + 24시간
--
-- ⚠️ 아래는 20260824130000 의 본문을 그대로 들고 온 뒤 where 절 한
--    줄만 바꾼 것이다. create or replace 는 통째로 갈아치우므로
--    빠뜨린 줄이 곧 기능 삭제가 된다.

create or replace function my_hosted_sessions()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at desc), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.status,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed') as m_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed') as f_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'waiting') as waiting
      from sessions s
     where s.host_id = auth.uid()
       -- 채팅방이 살아 있는 동안은 카드도 남는다. 둘이 같은 시각에
       -- 사라져야 "방은 없는데 카드만 있다" 가 안 생긴다.
       and case when s.status = 'cancelled'
                then coalesce(s.cancelled_at, s.ends_at)
                else s.ends_at
           end > now() - interval '24 hours'
     order by s.starts_at desc
     limit 100
  ) t;
$$;

revoke execute on function my_hosted_sessions() from public, anon;
grant execute on function my_hosted_sessions() to authenticated;
