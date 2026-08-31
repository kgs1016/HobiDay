-- ═══════════════════════════════════════════════════════════════
--  사전 가입 혜택 — 선착순 100 에서 전원 50 으로 (가입 보너스에 더해서)
-- ═══════════════════════════════════════════════════════════════
-- 소개 페이지의 약속이 바뀌었다.
--
--   전  선착순 남 30 · 여 30명에게 100 크레딧
--   후  사전 가입자 누구나 50 크레딧
--
-- 그런데 DB 는 그대로였다. 페이지는 50 이라고 하는데 실제로는 프로필을
-- 채우면 profile_complete 30 만 붙고, early_bird 100 은 운영자가 손으로
-- 줘야 나갔다. 약속과 지급이 다르면 그건 그냥 거짓말이다.
--
-- 둘은 서로 다른 보상이라 겹쳐 준다.
--
--   오픈 전 프로필 완성   30 (가입) + 50 (사전 가입) = 80
--   오픈 후 프로필 완성   30 (가입)
--
-- credit_grant 는 (user, reason, ref) 가 유일해서 같은 이름을 두 번
-- 부르면 두 번째는 0 을 돌려준다. 그래서 나중에 다시 불러도 더 붙지
-- 않고, 오픈 뒤에 부르면 early_bird 쪽은 아예 건너뛴다.
--
-- 이미 가입해 있는 계정에는 소급 지급하지 않는다. 오픈 전에 지워지거나
-- 운영자 계정이라 채워줄 대상이 없다.

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
--  2. 오픈 전이면 사전 가입 보너스를 얹는다
-- ───────────────────────────────────────────────────────────────
-- 지금까지 손으로 주던 것을 자동으로 바꾼다. 페이지는 이미 "오픈 전에
-- 가입하고 프로필만 만들어두면 지급돼요" 라고 말하고 있었다.
create or replace function claim_profile_bonus()
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; my_email text; earned int := 0;
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

  earned := credit_grant(me.id, 'profile_complete');

  /* 아직 안 열렸으면 사전 가입자다. sessions_open 을 보는 이유는 그게
     운영자가 오픈일에 실제로 젖히는 스위치이기 때문이다 (open_at 은
     안내용 날짜라 실제 개방 시점과 어긋날 수 있다).
     app_config 를 못 읽으면 안 준다 — 모르면 덜 준다. */
  if coalesce((select not sessions_open from app_config where id = 1), false) then
    earned := earned + credit_grant(me.id, 'early_bird');
  end if;

  return json_build_object('ok', true, 'earned', earned,
                           'balance', credit_balance(me.id));
end; $$;

revoke execute on function claim_profile_bonus() from public, anon;
grant  execute on function claim_profile_bonus() to authenticated;
