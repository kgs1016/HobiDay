-- ═══════════════════════════════════════════════════════════════
--  매칭 기록 — 성사돼서 끝난 모임
-- ═══════════════════════════════════════════════════════════════
-- 지금은 모임이 끝나면 어디서도 안 보인다. 홈 목록은 시작 3시간 뒤부터
-- 감추고, 모임 채팅도 s.status='confirmed' 인 방만 띄운다. "내가 만든
-- 모임" 은 호스트 것만이라 참가자로 갔던 모임은 흔적이 없다.
--
-- 여기 들어오는 조건 — 셋 다 만족해야 한다:
--   1. 내가 확정 참가자였다        (g.status = 'confirmed')
--   2. 모임 자체가 성사됐다        (s.status in ('confirmed','done'))
--      → 정원이 안 차서 'open' 인 채 지나간 모임, 취소된 모임은 제외
--   3. 끝난 시각이 지났다          (s.ends_at < now())
-- 호스트도 자기 모임의 확정 signups 행을 갖는다(session_create 가 넣는다).
-- 그래서 호스트·참가자를 따로 조회할 필요가 없다.
--
-- 같이 간 사람을 같이 내려준다. 확정된 모임의 참가자는 이미 서로 프로필을
-- 다 보는 사이라(room_state) 여기서 닉네임·사진을 보여주는 건 새로운
-- 노출이 아니다. 다만 차단한 사이는 뺀다 — 기록이라도 다시 보일 이유가
-- 없다. (반대로 '내가 만든 모임' 은 관리 화면이라 차단을 안 걸렀다.)
--
-- 탈퇴한 사람은 profiles 가 지워지면서 signups 도 cascade 로 사라진다.
-- 그래서 명단에서 조용히 빠진다 — 개인정보 처리방침대로다.

create or replace function my_match_history()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at desc), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.intensity,
           (s.host_id = auth.uid()) as i_am_host,
           (select count(*) from signups g2
             where g2.session_id = s.id and g2.status = 'confirmed') as members,
           coalesce((
             select json_agg(row_to_json(m) order by m.nickname) from (
               select p.id, p.nickname, p.gender, p.level, p.photo,
                      (p.id = s.host_id) as is_host
                 from signups g3
                 join profiles p on p.id = g3.user_id
                where g3.session_id = s.id
                  and g3.status = 'confirmed'
                  and p.id <> auth.uid()          -- 나는 명단에서 뺀다
                  and not blocked_with(p.id)
             ) m), '[]'::json) as people
      from sessions s
      join signups g on g.session_id = s.id and g.user_id = auth.uid()
     where g.status = 'confirmed'
       and s.status in ('confirmed','done')
       and s.ends_at < now()
     order by s.starts_at desc
     limit 200
  ) t;
$$;

revoke execute on function my_match_history() from public, anon;
grant execute on function my_match_history() to authenticated;
