-- ═══════════════════════════════════════════════════════════════
--  사전 가입 혜택 — 선착순 100 에서 전원 50 으로
-- ═══════════════════════════════════════════════════════════════
-- 소개 페이지의 약속이 바뀌었다.
--
--   전  선착순 남 30 · 여 30명에게 100 크레딧
--   후  사전 가입자 누구나 50 크레딧
--
-- 그런데 DB 는 그대로였다. 페이지는 50 이라고 하는데 실제로는 프로필을
-- 채우면 profile_complete 30 이 붙고, early_bird 100 은 운영자가 손으로
-- 줘야 나갔다. 약속과 지급이 다르면 그건 그냥 거짓말이다.
--
-- 여기서 셋을 맞춘다.
--   ① early_bird 를 100 → 50 으로 내린다
--   ② 오픈 전 프로필 완성에 early_bird 를 자동으로 붙인다
--      (지금까지 손으로 주던 것 — 페이지는 이미 "가입하고 프로필만
--       만들어두면 지급돼요" 라고 말하고 있었다)
--   ③ 이미 30 만 받은 사전 가입자에게 차액 20 을 채운다
--
-- 오픈 뒤 가입은 지금처럼 profile_complete 30 이다. 페이지의 혜택 표와
-- 같다.

-- ───────────────────────────────────────────────────────────────
--  1. 금액
-- ───────────────────────────────────────────────────────────────
create or replace function credit_rule(p_reason text) returns int
  language sql immutable as $$
  select case p_reason
    when 'early_bird'       then 50   -- 사전 가입 (오픈 전 프로필 완성)
    when 'early_bird_topup' then 20   -- 30 만 받은 사람에게 채우는 차액
    when 'profile_complete' then 30   -- 오픈 후 가입 보너스
    when 'session_video'    then 2
    when 'request_extra'    then -10  -- 관심 1회
    when 'request_refund'   then 10   -- 관심 반환 (거절·만료)
    when 'session_join'     then -10  -- 모임 신청 1회
    when 'session_refund'   then 10   -- 모임 신청 반환
    when 'mission_video'    then 0
    when 'mission_done'     then 0
    else 0
  end $$;

revoke execute on function credit_rule(text) from public, anon, authenticated;

-- 선착순 인원 제한은 없어졌다. 남겨두면 언젠가 "30명 넘었는데 왜 줬지"
-- 를 다시 따지게 된다 — 제한이 없다는 걸 값으로 적어둔다.
create or replace function early_bird_slots() returns int
  language sql immutable as $$ select 0 $$;  -- 0 = 제한 없음

revoke execute on function early_bird_slots() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 오픈 전이면 50, 오픈 뒤면 30
-- ───────────────────────────────────────────────────────────────
-- 둘 중 하나만 준다. 예전 코드는 profile_complete 만 줬는데, 그대로 두고
-- early_bird 를 얹으면 80 이 된다.
create or replace function claim_profile_bonus()
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; my_email text; earned int := 0; pre_open boolean;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;
  if me.photo is null or me.career is null then
    return json_build_object('error','incomplete');
  end if;

  select email into my_email from auth.users where id = me.id;
  if my_email is not null and exists (
    select 1 from deleted_accounts
     where email_hash = account_email_hash(my_email)
       and deleted_at > now() - (account_rejoin_block_days() || ' days')::interval
  ) then
    -- 재가입. 앱은 조용히 넘어간다 ("혜택 못 받는다" 를 알릴 이유가 없다)
    return json_build_object('ok', true, 'earned', 0,
                             'balance', credit_balance(me.id), 'rejoin', true);
  end if;

  /* 가입 보너스는 평생 한 번이다. credit_grant 의 (user, reason, ref)
     유일 제약은 같은 이름끼리만 막아주므로, 이름이 둘이 된 지금은
     여기서 직접 본다. 안 보면 오픈 전에 50 받은 사람이 오픈 뒤에
     30 을 한 번 더 받는다. */
  if exists (select 1 from credit_ledger
              where user_id = me.id
                and reason in ('early_bird','early_bird_topup','profile_complete')) then
    return json_build_object('ok', true, 'earned', 0,
                             'balance', credit_balance(me.id));
  end if;

  /* 아직 안 열렸으면 사전 가입자다. sessions_open 을 보는 이유는 그게
     운영자가 오픈일에 실제로 젖히는 스위치이기 때문이다 (open_at 은
     안내용 날짜라 실제 개방 시점과 어긋날 수 있다).
     app_config 를 못 읽으면 적은 쪽(30)으로 간다 — 모르면 덜 준다. */
  select coalesce((select not sessions_open from app_config where id = 1), false)
    into pre_open;

  earned := credit_grant(me.id,
    case when pre_open then 'early_bird' else 'profile_complete' end);

  return json_build_object('ok', true, 'earned', earned,
                           'balance', credit_balance(me.id));
end; $$;

revoke execute on function claim_profile_bonus() from public, anon;
grant  execute on function claim_profile_bonus() to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3. 이미 30 만 받은 사전 가입자에게 차액 20
-- ───────────────────────────────────────────────────────────────
-- 오픈 전에 돌리는 것을 전제로 한다. 지금 profile_complete 를 갖고 있는
-- 사람은 전부 사전 가입자다 — 앱이 아직 안 열렸으니까.
--
-- 차액을 따로 남기는 이유: profile_complete 행의 delta 를 30 에서 50 으로
-- 고쳐버리면 "그때 30 을 줬다" 는 사실이 사라진다. 원장은 고쳐 쓰는 게
-- 아니라 덧붙이는 것이다.
insert into credit_ledger (user_id, delta, reason, ref)
select l.user_id, 20, 'early_bird_topup', ''
  from credit_ledger l
 where l.reason = 'profile_complete'
   and not exists (
     select 1 from credit_ledger x
      where x.user_id = l.user_id
        and x.reason in ('early_bird','early_bird_topup'))
on conflict (user_id, reason, ref) do nothing;

do $$
declare n int;
begin
  select count(*) into n from credit_ledger where reason = 'early_bird_topup';
  raise notice '사전 가입자 차액 지급: %명 (각 20크레딧)', n;
end $$;
