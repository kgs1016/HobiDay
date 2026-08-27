-- ═══════════════════════════════════════════════════════════════
--  호스트가 받아준 뒤로는 자의로 나가도 신청비를 안 돌려준다
-- ═══════════════════════════════════════════════════════════════
-- 어제 "나가면 언제나 반환" 으로 바꿨는데, 그러면 끝난 모임에서
-- 나가기를 눌러도 10크레딧이 되돌아왔다. 만나고 나서 환불받는
-- 셈이라 모임이 공짜가 된다.
--
-- 호스트가 받아준 순간부터는 내 자리가 잡힌 것이고, 그 자리를 자의로
-- 비우면 신청비는 돌려주지 않는다. 승인 전(waiting)에 취소하는 건
-- 아직 아무 자리도 안 잡힌 상태라 돌려준다.
--
-- "환불 없음" 은 어디까지나 내가 스스로 나갈 때다. 모임이 무너져서
-- 없어지는 경우 — 호스트 삭제 · 인원 미달 · 남은 사람 없음 · 탈퇴 —
-- 는 session_collapse 가 맡고, 그쪽은 남은 사람 전원에게 돌려준다.
--
-- ⚠️ 20260825260000 의 본문을 그대로 들고 온 뒤 조건 한 줄만 바꿨다.
--    create or replace 는 통째로 갈아치우므로 빠뜨린 줄이 곧 기능
--    삭제가 된다.

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

  /* 호스트는 자기 모임에서 나갈 수 없다. 남은 사람들의 방을 만든 게
     호스트라서, 빠지는 게 아니라 지우는 것뿐이다 (session_delete). */
  if exists (select 1 from sessions
              where id = p_session and host_id = me_id) then
    return json_build_object('error','host');
  end if;

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  -- 승인 전이면 잡힌 자리가 없다. 승인 뒤면 그 자리 값은 안 돌려준다.
  if my.status = 'waiting' then
    perform session_fee_refund(p_session, me_id);
  end if;

  /* 방이 열려 있으면 누가 빠졌는지 남긴다. 취소로 이어지더라도 방은
     24시간 더 열려 있어서 남은 사람이 이 줄을 본다. */
  if my.status = 'confirmed' and session_chat_open(p_session) then
    select * into me from profiles where id = me_id;
    insert into messages (session_id, sender_id, body, kind)
    values (p_session, me_id,
            coalesce(nullif(me.nickname,''), '참가자') || '님이 나갔어요', 'system');
  end if;

  /* 확정이 1명까지 떨어지면 모임이 무너진 것이다. 호스트 혼자 남은 방은
     이야기할 상대가 없다 — 모임을 취소로 넘긴다. */
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
