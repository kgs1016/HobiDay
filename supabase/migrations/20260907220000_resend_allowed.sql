-- ═══════════════════════════════════════════════════════════════
--  거절당해도 다시 신청할 수 있다 — 모임 · 개인 둘 다
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 Run · 몇 번 돌려도 안전
-- ═══════════════════════════════════════════════════════════════
--
-- 소개팅 앱이던 시절엔 "한 번 거절이면 끝" 이 배려였다. 매칭 앱에서는
-- 그날 시간이 안 맞아서 못 받은 것과 사람이 싫어서 거절한 것이 구분되지
-- 않는데, 앞의 경우가 훨씬 흔하다. 다시 물을 수 있어야 한다.
--
--   모임   session_join 은 이미 cut/cancelled 를 waiting 으로 되돌린다.
--          decided_at 만 남아 있어서 지난 거절의 흔적이 그대로였다.
--   개인   requests 가 (from_id, to_id) 유니크라 거절된 행이 영영 남아
--          "이미 채팅을 보낸 상대예요" 로 막혔다. 거절된 행은 치운다.
--
-- ⚠️ 반복 신청을 막는 건 두 가지다 — 크레딧(보낼 때마다 차감)과 차단.
--    별도 쿨다운은 두지 않았다.

-- ───────────────────────────────────────────────────────────────
--  1. 모임 재신청 — 지난 거절의 흔적을 지운다
-- ───────────────────────────────────────────────────────────────
-- decided_at 이 남아 있으면 "이 신청은 언제 결론났다" 가 계속 참이라,
-- 보낸 신청 배지(sent_changes)가 세는 창에 옛 거절이 다시 걸릴 수 있다.
-- 다시 신청하는 순간 그 신청은 아직 결론이 안 난 것이다.
--
-- ⚠️ 20260907140000 의 본문을 그대로 들고 온 뒤 on conflict 절만 바꿨다.

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
  if not session_has_seat(s.id) then
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
                      else signups.status end,
        -- 다시 신청했으면 지난 결론은 없던 일이 된다
        decided_at = case when signups.status in ('cancelled','cut') then null
                          else signups.decided_at end,
        created_at = case when signups.status in ('cancelled','cut') then now()
                          else signups.created_at end;

  return json_build_object(
    'status', (select status from signups where session_id = s.id and user_id = me.id),
    'cost', cost, 'balance', credit_balance(me.id));
end; $$;

revoke execute on function session_join(uuid) from public, anon;
grant  execute on function session_join(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 개인 재신청 — 거절된 행을 치우고 새로 보낸다
-- ───────────────────────────────────────────────────────────────
-- 유니크 제약은 그대로 둔다. 한 사람에게 동시에 두 건이 열려 있으면
-- 받는 쪽 신청함이 같은 사람으로 두 줄이 된다.
--
--   pending   막는다 — 이미 보낸 게 답을 기다리는 중이다
--   accepted  막는다 — 채팅방이 이미 열려 있다
--   declined  지우고 새로 보낸다 (크레딧은 다시 든다)
--
-- ⚠️ 20260907140000 의 본문을 그대로 들고 온 뒤 existing 갈래만 바꿨다.

create or replace function request_send(p_to uuid, p_message text default null)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; you profiles; sent_today int; existing requests;
        cost int := -credit_rule('request_extra'); bal int; spent boolean := false;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;
  if p_to = me.id then return json_build_object('error','self'); end if;

  select * into you from profiles where id = p_to;
  if not found then return json_build_object('error','not_found'); end if;
  if blocked_with(p_to) then return json_build_object('error','blocked'); end if;
  if not you.is_public then return json_build_object('error','not_public'); end if;

  select * into existing from requests where from_id = me.id and to_id = p_to;
  if found then
    if existing.status = 'declined' then
      -- 거절은 문을 닫지 않는다. 자리를 비워 다시 보낼 수 있게 한다.
      delete from requests where id = existing.id;
    else
      return json_build_object('error','already', 'status', existing.status);
    end if;
  end if;

  -- 같은 유저의 동시 요청이 한도를 함께 넘기지 못하게 잠근다
  perform pg_advisory_xact_lock(hashtext(me.id::text));

  select count(*) into sent_today from requests
   where from_id = me.id and created_at > now() - interval '1 day';

  -- 무료 제공분(기본 0)을 넘으면 크레딧으로 차감한다
  if sent_today >= request_daily_limit() then
    bal := credit_balance(me.id);
    if bal < cost then
      return json_build_object('error','no_credits', 'cost', cost, 'balance', bal);
    end if;
    -- ref 를 매번 다르게 둬야 여러 번 차감된다
    insert into credit_ledger (user_id, delta, reason, ref)
    values (me.id, -cost, 'request_extra',
            p_to::text || ':' || extract(epoch from now())::bigint::text);
    spent := true;
  end if;

  insert into requests (from_id, to_id, message)
  values (me.id, p_to, nullif(trim(p_message), ''));

  return json_build_object('ok', true,
    'free_left', greatest(0, request_daily_limit() - sent_today - 1),
    'spent', spent, 'cost', case when spent then cost else 0 end,
    'balance', credit_balance(me.id));
end; $$;

revoke execute on function request_send(uuid, text) from public, anon;
grant  execute on function request_send(uuid, text) to authenticated;
