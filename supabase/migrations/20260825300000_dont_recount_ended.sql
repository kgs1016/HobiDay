-- ═══════════════════════════════════════════════════════════════
--  끝난 모임은 인원을 다시 세지 않는다
-- ═══════════════════════════════════════════════════════════════
-- signups_expire 의 첫 루프가 "시작 시각이 지났고 정원이 안 찬 모임" 을
-- 찾아 취소한다. 그런데 시작 시각만 봤지 끝난 모임을 빼지 않아서,
-- 지난 모임 전부를 10분마다 다시 검사하고 있었다.
--
-- 평소엔 아무 일도 안 일어난다 — 성사된 모임은 확정 인원이 정원과 같다.
-- 문제는 그 인원이 나중에 줄어들 때다. signups.user_id 는 프로필을
-- CASCADE 로 따라가므로, 참가자 한 명이 탈퇴하면 그 사람의 참가 행이
-- 지워지고 확정 인원이 정원보다 적어진다. 그러면 —
--
--   어제 넷이 실제로 만난 모임 → 한 명 탈퇴 → 크론이 돌면
--   → status = cancelled, 남은 세 사람 전원의 매칭 기록에서 사라짐
--   → session_collapse 가 남은 사람들에게 신청비까지 돌려준다
--      (이미 다녀온 모임인데)
--
-- 인원 미달 판단은 모임이 열리기 전에 의미가 있는 것이다. 이미 끝난
-- 모임은 실제로 사람들이 만났는지 여부를 우리가 뒤늦게 뒤집을 수 없다.
--
-- 두 번째 루프(대기자 만료·반환)는 그대로 둔다. 크론이 한동안 멈춰
-- 있었더라도 지난 모임의 대기자는 신청비를 돌려받아야 한다.
--
-- ⚠️ 20260825220000 의 본문을 그대로 들고 온 뒤 where 절 한 줄만 더했다.

create or replace function signups_expire()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select s.id from sessions s
     where s.starts_at <= now()
       -- 끝난 모임은 다시 판단하지 않는다. 이 조건이 없으면 탈퇴 한 번에
       -- 이미 만난 모임이 뒤늦게 취소로 뒤집힌다 (아래 설명).
       and s.ends_at > now()
       and s.status <> 'cancelled'
       and ((select count(*) from signups g
              where g.session_id = s.id and g.gender = 'm'
                and g.status = 'confirmed') < s.capacity
         or (select count(*) from signups g
              where g.session_id = s.id and g.gender = 'f'
                and g.status = 'confirmed') < s.capacity)
  loop
    perform session_collapse(r.id);
    n := n + 1;
  end loop;

  for r in
    select g.session_id, g.user_id
      from signups g
      join sessions s on s.id = g.session_id
     where g.status = 'waiting'
       and (s.starts_at <= now() or s.status = 'cancelled')
  loop
    perform session_fee_refund(r.session_id, r.user_id);
    update signups set status = 'cut', decided_at = now()
     where session_id = r.session_id and user_id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function signups_expire() from public, anon, authenticated;
