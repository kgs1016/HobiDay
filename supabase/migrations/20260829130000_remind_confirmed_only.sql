-- ═══════════════════════════════════════════════════════════════
--  시작 임박 알림은 확정된 모임에만
-- ═══════════════════════════════════════════════════════════════
-- sessions_remind 는 취소되지 않은 모임이면 전부 "오늘 모임이 있어요" 를
-- 보내고 있었다 (status <> 'cancelled'). 정원이 안 찬 모임에도 간다.
--
-- 그런데 정원을 못 채운 모임은 열리지 않는다. 시작 시각이 지나면
-- signups_expire 가 대기 신청을 되돌리고, 신청함은 그 모임을 "열리지
-- 못했어요 · 정원이 다 차지 않아 모임이 열리지 못했어요" 라고 적는다.
--
-- 그러니 한 시간 전 알림은 이렇게 읽힌다.
--
--    18:00  "오늘 모임이 있어요 · 더클라임 B홍대점 19:00 에 만나요."
--    21:00  "열리지 못했어요"
--
-- 나가려고 준비한 사람에게 세 시간 뒤에 없던 일이라고 말하는 셈이다.
-- 알림은 실제로 일어난 일만 말해야 한다 — 확정된 모임만 알린다.
--
-- reminded_at 을 안 찍고 그냥 건너뛴다. 아직 안 찬 모임은 다음 시간에
-- 다시 후보가 되고, 그 사이에 정원이 차면 그때 알림이 나간다. 표시부터
-- 찍어두면 "차기 전에 한 번 봤다" 는 이유로 영영 안 알리게 된다.
--
-- 시작 직전에 확정돼서 이 창을 놓치는 모임이 있을 수 있는데, 그건
-- 괜찮다 — 확정되는 순간 "🎉 모임이 확정됐어요" 가 이미 나간다.

create or replace function sessions_remind()
returns int language plpgsql security definer set search_path = public as $$
declare r record; g record; n int := 0;
begin
  for r in
    select s.* from sessions s
     where s.status = 'confirmed'
       and s.reminded_at is null
       and s.starts_at > now()
       and s.starts_at <= now() + interval '3 hours'
  loop
    for g in
      select user_id from signups
       where session_id = r.id and status = 'confirmed'
    loop
      perform notify_add(g.user_id, '오늘 모임이 있어요',
        r.gym || ' · ' || to_char(r.starts_at at time zone 'Asia/Seoul', 'HH24:MI') ||
        ' 에 만나요.', '/session?id=' || r.id::text);
      n := n + 1;
    end loop;
    update sessions set reminded_at = now() where id = r.id;
  end loop;
  return n;
end $$;

revoke execute on function sessions_remind() from public, anon, authenticated;
