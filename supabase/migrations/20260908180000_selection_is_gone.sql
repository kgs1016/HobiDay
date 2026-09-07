-- ═══════════════════════════════════════════════════════════════
--  최종선택을 흔적까지 지운다 — 진행 화면의 마지막 잔해
-- ═══════════════════════════════════════════════════════════════
-- 최종선택(모임이 끝나면 서로를 비공개로 고르고, 상호선택이면 1:1 방이
-- 열린다)은 2026-08 에 화면에서 뺐다. 모임 채팅이 그 자리를 대신하니
-- 어색한 의식을 남길 이유가 없었다. 그때는 "되살릴지 모른다" 며 서버
-- 함수를 남겼는데, 그 뒤로
--
--   2026-09  성비를 없앴다 → 이성만 고른다는 전제가 사라졌다
--   2026-09  데이팅이 아니라 매칭 앱으로 방향을 바꿨다
--   2026-09  진행 화면(/room)을 통째로 없앴다 → 부를 곳이 사라졌다
--
-- 되살릴 이유가 하나씩 없어졌다. 이제 지운다.
--
-- 같은 시기의 라운드 로테이션(missions · room_*_min)도 함께 지운다.
-- 6인이 20분씩 자리를 바꾸며 도는 오프라인 진행표였는데, 진행 화면이
-- 없어지면서 마지막 호출자까지 사라졌다.
--
-- ⚠️ matches 는 건드리지 않는다. 최종선택으로 열렸던 1:1 방이 거기
--    섞여 있지만(session_id 가 있는 쪽), 그건 실제로 오간 대화다.
--    기능을 없애는 것과 남의 대화를 지우는 것은 다른 일이다.
--    비우고 싶으면 따로 판단해서 지울 것 —
--      delete from matches where session_id is not null;

-- ───────────────────────────────────────────────────────────────
--  1. 크레딧 — 미션 적립 자리를 뺀다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260908160000 의 본문에서 mission_* 두 줄을 지웠다. 둘 다 이미
--    0 이라 금액은 그대로다. 옛 원장의 적립 행은 남고, 화면은
--    CREDIT_LABELS 로 계속 이름을 붙여 보여준다.

create or replace function credit_rule(p_reason text) returns int
  language sql immutable as $$
  select case p_reason
    when 'early_bird'       then 50   -- 사전 가입 (가입 보너스 위에 얹는다)
    when 'profile_complete' then 30   -- 가입 보너스
    when 'request_extra'    then -10  -- 채팅 신청 1회
    when 'request_refund'   then 10   -- 채팅 신청 반환 (거절·만료)
    when 'session_join'     then 0    -- 모임 신청 무료 (2026-09-02)
    when 'session_refund'   then 0    -- 반환액은 원장 집계가 정한다
    else 0
  end $$;

revoke execute on function credit_rule(text) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 최종선택
-- ───────────────────────────────────────────────────────────────
-- sync_matches 는 selection_submit 안에서만 불렸다. 짝을 만들 재료가
-- 없어지므로 같이 간다.

drop function if exists selection_submit(uuid, uuid[]);
drop function if exists my_matches(uuid);
drop function if exists sync_matches(uuid);
drop table if exists selections;

-- ───────────────────────────────────────────────────────────────
--  3. 라운드 로테이션
-- ───────────────────────────────────────────────────────────────

drop function if exists mission_done(uuid, int, text);
drop table if exists missions;

drop function if exists room_warmup_min();
drop function if exists room_round_min();
drop function if exists room_card_lead_min();
