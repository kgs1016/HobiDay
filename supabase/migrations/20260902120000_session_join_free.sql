-- ═══════════════════════════════════════════════════════════════
--  모임 신청 무료화 — 신청비(10크레딧)를 없앤다
-- ═══════════════════════════════════════════════════════════════
-- 신청비의 명분은 "진지함 필터" 였는데(20260817130000), 하루 앞서 들어온
-- 호스트 승인제가 같은 일을 한다 — 장난 신청은 호스트가 거르면 되고,
-- 받아줘야 자리가 잡힌다. 이중 문턱인 셈이고, 오픈 초기에 아쉬운 건
-- 크레딧이 아니라 신청 그 자체다. 관심 보내기(10크레딧)는 그대로다.
--
-- 금액의 단일 출처가 credit_rule() 이라 되돌리는 것도 여기 한 줄이다.
--
--  · credit_rule: session_join → 0. session_refund 도 0 — 반환액은
--    어차피 원장에서 "낸 만큼" 을 집계하므로 이름만 라벨로 남는다
--  · session_join: 0원일 때 잠금·잔액 검사·원장 기록을 건너뛴다 —
--    0짜리 줄이 원장에 쌓이면 크레딧 내역이 소음이 된다
--  · session_fee_refund 는 그대로 — "낸 게 없으면 안 돌려준다"(공짜
--    시절 가드)가 이미 있어, 유료 시절(08-17~09-01)에 신청한 사람이
--    이후 거절·취소되면 그 사람만 10을 정확히 돌려받는다
--  · session_collapse 알림에서 "신청 크레딧은 돌려드렸어요" 를 뗀다 —
--    무료 신청자에게는 거짓말이 된다. 유료 시절 신청자는 말없이
--    정확히 돌려받는다 (원장 집계)

-- ───────────────────────────────────────────────────────────────
--  1. 금액
-- ───────────────────────────────────────────────────────────────
create or replace function credit_rule(p_reason text) returns int
  language sql immutable as $$
  select case p_reason
    when 'early_bird'       then 50   -- 사전 가입 (가입 보너스 위에 얹는다)
    when 'profile_complete' then 30   -- 가입 보너스
    when 'session_video'    then 2
    when 'request_extra'    then -10  -- 관심 1회
    when 'request_refund'   then 10   -- 관심 반환 (거절·만료)
    when 'session_join'     then 0    -- 모임 신청 무료 (2026-09-02)
    when 'session_refund'   then 0    -- 반환액은 원장 집계가 정한다
    when 'mission_video'    then 0
    when 'mission_done'     then 0
    else 0
  end $$;

revoke execute on function credit_rule(text) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 신청 — 0원이면 돈 코드를 건너뛴다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260827140000 의 본문을 그대로 들고 오고, 차감 블록에 cost > 0
--    가드만 얹었다. 유료로 되돌리면(credit_rule 한 줄) 이 가드가 다시
--    잔액을 검사한다.

create or replace function session_join(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; s sessions; existing signups;
        cost int := -credit_rule('session_join'); bal int;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  select * into s from sessions where id = p_session for update;
  if not found or s.status not in ('open','confirmed') then
    return json_build_object('error','not_open');
  end if;
  -- 시작한 모임에는 못 들어간다. 목록에서 감추는 것만으로는 부족하다 —
  -- 이미 상세 화면을 열어둔 사람은 그대로 신청 버튼을 누를 수 있다.
  if s.starts_at <= now() then
    return json_build_object('error','started');
  end if;
  if s.host_id = me.id then return json_build_object('error','is_host'); end if;

  if (s.host_id is not null and blocked_with(s.host_id))
     or exists (select 1 from signups g
                 where g.session_id = s.id and g.status = 'confirmed'
                   and blocked_with(g.user_id)) then
    return json_build_object('error','blocked');
  end if;

  -- 자리가 이미 다 찼으면 신청 자체를 받지 않는다
  if not session_has_seat(s.id, me.gender) then
    return json_build_object('error','full');
  end if;

  -- 이미 신청 중이면 차감 없이 상태만 돌려준다
  select * into existing from signups
   where session_id = s.id and user_id = me.id;
  if found and existing.status in ('waiting','confirmed') then
    return json_build_object('status', existing.status);
  end if;

  if cost > 0 then
    -- 같은 유저의 동시 요청이 잔액을 함께 넘기지 못하게 잠근다
    perform pg_advisory_xact_lock(hashtext(me.id::text));

    bal := credit_balance(me.id);
    if bal < cost then
      return json_build_object('error','no_credits', 'cost', cost, 'balance', bal);
    end if;

    -- ref 를 매번 다르게 둬야 취소 후 재신청 때 다시 차감된다
    insert into credit_ledger (user_id, delta, reason, ref)
    values (me.id, -cost, 'session_join',
            s.id::text || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint::text);
  end if;

  insert into signups (session_id, user_id, gender, status)
  values (s.id, me.id, me.gender, 'waiting')
  on conflict (session_id, user_id) do update
    set status = case when signups.status in ('cancelled','cut') then 'waiting'
                      else signups.status end;

  return json_build_object(
    'status', (select status from signups where session_id = s.id and user_id = me.id),
    'cost', cost, 'balance', credit_balance(me.id));
end; $$;

revoke execute on function session_join(uuid) from public, anon;
grant  execute on function session_join(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3. 모임 소멸 알림 — 크레딧 이야기를 뗀다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260829140000 의 본문을 그대로 들고 오고 알림 문구만 바꿨다.

create or replace function session_collapse(p_session uuid)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare s sessions; g record; affected uuid[] := '{}';
begin
  select * into s from sessions where id = p_session for update;
  if not found or s.status = 'cancelled' then return affected; end if;

  update sessions set status = 'cancelled', cancelled_at = now()
   where id = p_session;

  for g in
    select user_id from signups
     where session_id = p_session
       and status in ('waiting','confirmed')
       and user_id is distinct from s.host_id
  loop
    -- 유료 시절 신청이면 여기서 정확히 돌려받는다 (무료 신청은 0)
    perform session_fee_refund(p_session, g.user_id);
    affected := affected || g.user_id;

    /* 알림함에는 여기서 남긴다. 모임이 무너지는 길은 다섯인데 그중
       둘(정원 미달, 탈퇴)은 크론과 뒷정리라 앱이 알릴 자리가 없다.
       한 군데서 남기면 어느 길로 오든 빠짐없이 알린다.
       푸시는 앱이 따로 쏜다 — DB 에서는 못 쏜다(pg_net 이 없다). */
    perform notify_add(g.user_id, '😢 모임이 취소됐어요',
      s.gym || ' 모임이 취소됐어요.', '/inbox');
  end loop;

  /* 호스트에게도 알린다 — 자기가 지운 게 아닐 때만.
     환불 대상(affected)에는 넣지 않는다. 호스트는 신청한 적이 없다. */
  if s.host_id is not null and s.host_id is distinct from auth.uid() then
    perform notify_add(s.host_id, '😢 내 모임이 취소됐어요',
      s.gym || ' 모임이 정원을 채우지 못해 취소됐어요.', '/session/mine');
  end if;

  return affected;
end $$;

revoke execute on function session_collapse(uuid) from public, anon, authenticated;
