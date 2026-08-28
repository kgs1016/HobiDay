-- ═══════════════════════════════════════════════════════════════
--  모임에서 나가면 신청비는 언제나 돌려준다
-- ═══════════════════════════════════════════════════════════════
-- 어제까지의 규칙은 "성사된 모임의 자리를 비우면 안 돌려준다" 였다.
-- 그런데 그 벌칙이 실제로 걸리는 상황을 끝까지 따라가 보면 이렇게 된다.
--
--   2:2 가 다 차서 성사 → 한 명이 나감 → 확정 3명
--   → 시작 시각에 signups_expire 가 "정원 미달" 로 모임을 취소
--   → 남은 3명은 전원 환불
--
-- 정원은 딱 맞춰져 있어서 한 명만 빠져도 모임은 못 열린다. 결국
-- 모임은 어차피 무산되고, 남은 사람은 다 돌려받고, 나간 사람 혼자
-- 10크레딧을 잃는다. 호스트가 방을 지워서 터진 경우엔 전원 돌려주는데
-- 나간 사람만 못 받는 것도 말이 안 맞는다.
--
-- 그래서 규칙을 하나로 줄인다 — 자리를 비우면 그 자리 값은 돌려준다.
-- 모임이 무너지는 건 어느 길로 가든 전원 환불이다.
--
-- ⚠️ 20260825240000 의 본문을 그대로 들고 온 뒤 조건문 하나만 뺐다.

create or replace function session_cancel(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); my signups; me profiles;
        left_cnt int; affected uuid[] := '{}';
begin
  select * into my from signups
   where session_id = p_session and user_id = me_id for update;
  if not found or my.status = 'cancelled' then
    return json_build_object('error','not_joined');
  end if;

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  -- 대기 중이든 승인받았든, 성사 전이든 후든 돌려준다.
  perform session_fee_refund(p_session, me_id);

  /* 방이 열려 있으면 누가 빠졌는지 남긴다. 취소로 이어지더라도 방은
     24시간 더 열려 있어서 남은 사람이 이 줄을 본다. */
  if my.status = 'confirmed' and session_chat_open(p_session) then
    select * into me from profiles where id = me_id;
    insert into messages (session_id, sender_id, body, kind)
    values (p_session, me_id,
            coalesce(nullif(me.nickname,''), '참가자') || '님이 나갔어요', 'system');
  end if;

  /* 확정이 1명까지 떨어지면 모임이 무너진 것이다. 호스트 혼자 남은 방은
     이야기할 상대가 없다 — 모임을 취소로 넘긴다.
     2명 이상 남았어도 정원이 비었으면 시작 시각에 signups_expire 가
     같은 처리를 한다. 그때까지는 호스트가 다시 채울 수 있으니 둔다. */
  select count(*) into left_cnt from signups
   where session_id = p_session and status = 'confirmed';

  if left_cnt < 2 then
    affected := session_collapse(p_session);
    return json_build_object('ok', true, 'cancelled', true, 'notify', affected);
  end if;

  return json_build_object('ok', true);
end; $$;

revoke execute on function session_cancel(uuid) from public, anon;
grant execute on function session_cancel(uuid) to authenticated;
