-- ═══════════════════════════════════════════════════════════════
--  내가 만든 모임 — 끝난 지 1시간 지나면 내린다
-- ═══════════════════════════════════════════════════════════════
-- 지금은 내가 연 모임이 영원히 쌓인다. 그런데 이 화면의 쓸모는
-- "지금 관리할 모임" 이다 — 신청자를 승인하고, 취소하고, 방에 들어가는 것.
-- 끝난 모임을 계속 두면 관리할 것과 끝난 것이 섞여서 목록이 흐려진다.
--
-- 게다가 뱃지가 시간부터 보는 탓에 성사된 모임과 정원 미달로 무산된
-- 모임이 똑같이 "지난 모임" 으로 보였다. 실제로 헷갈렸다.
--
-- 끝난 모임의 기록은 my_match_history() 가 맡는다 (성사된 것만).
-- 여기서는 ends_at + 1시간까지만 남겨서, 모임 직후에 들어와도
-- 결과("완료" / "무산됨")를 한 번은 볼 수 있게 한다.
--
-- ⚠️ 아래는 20260820171000 의 본문을 그대로 들고 온 뒤 where 절 한
--    줄만 더한 것이다. create or replace 는 통째로 갈아치우므로
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
       -- 끝나고 1시간 지나면 목록에서 뺀다. 완료된 모임은 매칭 기록이
       -- 맡고, 여기는 "지금 신경 쓸 모임" 만 남긴다.
       -- 취소된 모임도 같은 기준이다 — 원래 끝났을 시각까지는 "취소됨"
       -- 이 보여야 참가자에게 왜 없어졌는지 설명할 수 있다.
       and s.ends_at > now() - interval '1 hour'
     order by s.starts_at desc
     limit 100
  ) t;
$$;

revoke execute on function my_hosted_sessions() from public, anon;
grant execute on function my_hosted_sessions() to authenticated;
