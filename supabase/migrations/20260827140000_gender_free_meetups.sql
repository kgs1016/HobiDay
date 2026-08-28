-- ═══════════════════════════════════════════════════════════════
--  성비 무관 모임 — 정원을 "남녀 반반" 과 "성별 무관" 으로 가른다
-- ═══════════════════════════════════════════════════════════════
-- 지금까지 모임은 무조건 남녀 같은 수였다. capacity 는 "한 성별당 몇 명"
-- 이라서 2 면 2:2(4명)였다.
--
-- 여기에 두 번째 모드를 붙인다.
--   balanced  기존 그대로. capacity = 성별당 인원 (1 → 1:1, 2 → 2:2)
--   any       성별을 안 따진다. capacity = 총 인원 (2 · 3 · 4명)
--
-- capacity 의 뜻이 모드에 따라 갈리는 게 이 변경의 유일한 함정이다.
-- 그래서 인원을 세는 자리를 전부 두 함수로 모았다 — session_has_seat 과
-- session_is_filled. 앞으로 인원 규칙은 이 둘만 고치면 된다.
--
-- 나머지 흐름(신청 → 호스트 승인 → 2명부터 채팅방 → 환불 규정 → 조기 확정)
-- 은 두 모드가 똑같다.

alter table sessions
  add column if not exists gender_mode text not null default 'balanced';

alter table sessions drop constraint if exists sessions_gender_mode_check;
alter table sessions add constraint sessions_gender_mode_check
  check (gender_mode in ('balanced','any'));

-- 정원의 허용값이 모드마다 다르다. 하나의 제약으로 묶어야 REST 로 직접
-- 넣는 경우까지 막힌다 (예: any 인데 capacity 1 = 혼자 하는 모임).
alter table sessions drop constraint if exists sessions_capacity_check;
alter table sessions add constraint sessions_capacity_check
  check ((gender_mode = 'balanced' and capacity in (1,2))
      or (gender_mode = 'any'      and capacity between 2 and 4));


-- ── 인원 규칙 두 개 ────────────────────────────────────────────

/* 이 성별의 사람이 앉을 자리가 남았나.
   성비 모드면 그 성별 칸만 보고, 무관 모드면 성별을 안 보고 총원만 본다. */
create or replace function session_has_seat(p_session uuid, p_gender text)
returns boolean language sql stable security definer set search_path = public as $$
  select case when s.gender_mode = 'any'
    then (select count(*) from signups g
           where g.session_id = s.id and g.status = 'confirmed') < s.capacity
    else (select count(*) from signups g
           where g.session_id = s.id and g.gender = p_gender
             and g.status = 'confirmed') < s.capacity
  end
    from sessions s where s.id = p_session;
$$;

/* 정원이 다 찼나 = 모임이 성사됐나.
   성비 모드는 남·여 양쪽이 다 차야 한다 (한쪽만 차면 아직 미완). */
create or replace function session_is_filled(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when s.gender_mode = 'any'
    then (select count(*) from signups g
           where g.session_id = s.id and g.status = 'confirmed') >= s.capacity
    else (select count(*) from signups g
           where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed') >= s.capacity
     and (select count(*) from signups g
           where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed') >= s.capacity
  end
    from sessions s where s.id = p_session;
$$;

/* 지금 확정된 인원 — 조기 확정이 "이 인원으로 가자" 고 말할 때의 그 수.
   성비 모드에서는 짝이 안 맞는 쪽은 셈에서 빠진다 (남3 여1 이면 1:1). */
create or replace function session_matched(p_session uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when s.gender_mode = 'any'
    then (select count(*) from signups g
           where g.session_id = s.id and g.status = 'confirmed')
    else least(
      (select count(*) from signups g
        where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed'),
      (select count(*) from signups g
        where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed'))
  end::int
    from sessions s where s.id = p_session;
$$;

revoke execute on function session_has_seat(uuid,text) from public, anon;
revoke execute on function session_is_filled(uuid)     from public, anon;
revoke execute on function session_matched(uuid)       from public, anon;
grant  execute on function session_has_seat(uuid,text) to authenticated;
grant  execute on function session_is_filled(uuid)     to authenticated;
grant  execute on function session_matched(uuid)       to authenticated;


-- ── 모임 개설 ──────────────────────────────────────────────────

drop function if exists session_create(text,timestamptz,timestamptz,int,int,int,int,int,boolean,text);

create or replace function session_create(
  p_gym text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_capacity int, p_level_min int, p_level_max int,
  p_age_min int, p_age_max int,
  p_after_meal boolean, p_note text,
  -- 기본값을 둬서 예전 앱(10개 인자)도 그대로 성비 모임을 만든다
  p_gender_mode text default 'balanced')
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; sid uuid;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  if p_gender_mode not in ('balanced','any') then
    return json_build_object('error','bad_mode');
  end if;
  -- 정원의 뜻이 모드마다 다르니 범위도 따로 본다
  if p_gender_mode = 'balanced' and p_capacity not in (1,2) then
    return json_build_object('error','bad_capacity');
  end if;
  if p_gender_mode = 'any' and p_capacity not between 2 and 4 then
    return json_build_object('error','bad_capacity');
  end if;

  -- 지난 시각과 임박을 나눈다. 고쳐야 할 게 다르다 — 지난 건 잘못 고른
  -- 것이고, 임박은 제대로 골랐는데 규칙에 걸린 것이다.
  if p_starts_at < now() then
    return json_build_object('error','past');
  end if;
  -- 신청 · 호스트 승인 · 이동까지 최소한의 시간은 남겨둬야 한다
  if p_starts_at < now() + interval '30 minutes' then
    return json_build_object('error','too_soon');
  end if;
  -- 너무 먼 미래도 막는다 — 실수(연도 오타)로 2036년 모임이 생기는 것 방지
  if p_starts_at > now() + interval '90 days' then
    return json_build_object('error','too_far');
  end if;

  insert into sessions (host_id, gym, starts_at, ends_at, capacity, gender_mode,
                        level_min, level_max, age_min, age_max,
                        after_meal, note)
  values (me.id, p_gym, p_starts_at, p_ends_at, p_capacity, p_gender_mode,
          p_level_min, p_level_max, p_age_min, p_age_max,
          p_after_meal, nullif(trim(p_note), ''))
  returning id into sid;

  insert into signups (session_id, user_id, gender, status)
  values (sid, me.id, me.gender, 'confirmed');

  return json_build_object('id', sid);
end; $$;

revoke execute on function session_create(text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,text) from public, anon;
grant  execute on function session_create(text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,text) to authenticated;


-- ── 신청 · 승인 · 확정 ─────────────────────────────────────────

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


create or replace function session_approve(p_session uuid, p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; g signups; total_cnt int;
        opened boolean; filled boolean;
begin
  select * into s from sessions where id = p_session for update;
  if not found then return json_build_object('error','not_found'); end if;
  if s.host_id <> auth.uid() then return json_build_object('error','not_host'); end if;

  if s.starts_at <= now() then
    return json_build_object('error','started');
  end if;

  select * into g from signups
   where session_id = p_session and user_id = p_user;
  if not found or g.status <> 'waiting' then
    return json_build_object('error','not_waiting');
  end if;

  /* 안전망. 보통은 block_user 가 차단하는 그 자리에서 대기 신청을
     거두므로 여기까지 오지 않는다. 하지만 대기자가 걸려 있는 채로
     다른 사람이 먼저 확정되는 순서라면 여기서 처음 마주친다.

     먼저 받은 사람이 자리를 지키고 나중 사람은 잘린다. 잘린 사람에게
     잘못이 없으니 신청비는 돌려준다. 호스트에게는 차단 얘기를 하지
     않는다 — 호스트는 제3자다 (화면 문구도 그렇게 맞췄다). */
  if exists (
    select 1 from signups x
      join blocks b on (b.blocker_id = x.user_id and b.blocked_id = p_user)
                    or (b.blocker_id = p_user and b.blocked_id = x.user_id)
     where x.session_id = p_session and x.status = 'confirmed') then
    update signups set status = 'cut', decided_at = now()
     where session_id = p_session and user_id = p_user;
    perform session_fee_refund(p_session, p_user);
    return json_build_object('error','blocked_member');
  end if;

  if not session_has_seat(p_session, g.gender) then
    return json_build_object('error','full');
  end if;

  update signups set status = 'confirmed'
   where session_id = p_session and user_id = p_user;

  -- 정원이 찼으면 모임 자체를 확정 (예전과 같음)
  filled := session_try_confirm(p_session);

  -- 이번 승인으로 딱 2명이 됐다면 방이 지금 막 열린 것
  select count(*) into total_cnt from signups
   where session_id = p_session and status = 'confirmed';
  opened := (total_cnt = 2);

  -- 방이 처음 열린 시각을 적어둔다. 나중에 사람이 빠져 인원이 줄어도
  -- "이 모임엔 방이 있었다" 를 알아야 취소 안내를 띄울 수 있다.
  if opened then
    update sessions set chat_opened_at = now()
     where id = p_session and chat_opened_at is null;
  end if;

  -- 알릴 사람 = 나(호스트)와 방금 승인한 사람을 뺀 확정자.
  -- 방금 승인된 사람은 클라이언트가 따로 "수락됐어요" 를 보낸다.
  return json_build_object('ok', true,
    'chat_opened', opened, 'confirmed', filled,
    'notify', case when opened or filled then
      (select coalesce(json_agg(x.user_id), '[]'::json)
         from signups x
        where x.session_id = p_session
          and x.status = 'confirmed'
          and x.user_id not in (s.host_id, p_user))
    else '[]'::json end);
end $$;

revoke execute on function session_approve(uuid,uuid) from public, anon;
grant  execute on function session_approve(uuid,uuid) to authenticated;


create or replace function session_try_confirm(p_session uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session;
  if not found or s.status <> 'open' then return false; end if;

  if not session_is_filled(p_session) then return false; end if;

  update sessions set status = 'confirmed' where id = p_session;
  return true;
end $$;


-- ── 조기 확정 ──────────────────────────────────────────────────
-- "자리가 남았지만 지금 인원으로 가자" 는 제안. 두 모드 모두 쓴다.
--   balanced  남녀 수가 맞아야 한다 (남2 여1 이면 제안 못 함)
--   any       2명 이상이면 언제든

create or replace function session_propose_confirm(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; m int; f int; matched int;
begin
  select * into s from sessions where id = p_session for update;
  if not found then return json_build_object('error','not_found'); end if;
  if s.host_id <> auth.uid() then return json_build_object('error','not_host'); end if;
  if s.status <> 'open' then return json_build_object('error','not_open'); end if;

  if s.gender_mode = 'balanced' then
    select count(*) into m from signups
     where session_id = p_session and gender = 'm' and status = 'confirmed';
    select count(*) into f from signups
     where session_id = p_session and gender = 'f' and status = 'confirmed';
    if m <> f or m < 1 then return json_build_object('error','not_balanced'); end if;
    matched := m;
  else
    select count(*) into matched from signups
     where session_id = p_session and status = 'confirmed';
    -- 혼자서는 모임이 아니다
    if matched < 2 then return json_build_object('error','not_balanced'); end if;
  end if;

  if matched >= s.capacity then return json_build_object('error','already_full'); end if;

  delete from session_confirm_acks where session_id = p_session;
  update sessions set early_confirm_at = now() where id = p_session;

  -- 답해야 하는 게스트들 (호스트 제외)
  return json_build_object('ok', true, 'matched', matched,
    'notify', (select coalesce(json_agg(g.user_id), '[]'::json)
                 from signups g
                where g.session_id = p_session
                  and g.status = 'confirmed'
                  and g.user_id <> s.host_id));
end $$;


create or replace function session_accept_confirm(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; m int; f int; matched int; pending int;
begin
  select * into s from sessions where id = p_session for update;
  if not found then return json_build_object('error','not_found'); end if;
  if s.status <> 'open' then return json_build_object('error','not_open'); end if;
  if s.early_confirm_at is null then return json_build_object('error','no_proposal'); end if;
  if s.host_id = auth.uid() then return json_build_object('error','is_host'); end if;

  if not exists (select 1 from signups
                  where session_id = p_session and user_id = auth.uid()
                    and status = 'confirmed')
  then return json_build_object('error','not_member'); end if;

  if s.gender_mode = 'balanced' then
    select count(*) into m from signups
     where session_id = p_session and gender = 'm' and status = 'confirmed';
    select count(*) into f from signups
     where session_id = p_session and gender = 'f' and status = 'confirmed';
    if m <> f or m < 1 then return json_build_object('error','not_balanced'); end if;
    matched := m;
  else
    select count(*) into matched from signups
     where session_id = p_session and status = 'confirmed';
    if matched < 2 then return json_build_object('error','not_balanced'); end if;
  end if;

  insert into session_confirm_acks (session_id, user_id)
  values (p_session, auth.uid())
  on conflict do nothing;

  select count(*) into pending
    from signups g
   where g.session_id = p_session
     and g.status = 'confirmed'
     and g.user_id <> s.host_id
     and not exists (select 1 from session_confirm_acks a
                      where a.session_id = p_session and a.user_id = g.user_id);

  if pending > 0 then
    return json_build_object('ok', true, 'confirmed', false, 'waiting', pending);
  end if;

  -- 정원을 지금 인원으로 줄여 못 박는다. 뜻은 모드를 따라간다 —
  -- 성비 모드면 성별당 인원, 무관 모드면 총 인원.
  update sessions set capacity = matched, status = 'confirmed' where id = p_session;

  -- 확정의 순간 — 나 빼고 전원(호스트 포함)에게 알린다
  return json_build_object('ok', true, 'confirmed', true, 'capacity', matched,
    'gender_mode', s.gender_mode,
    'notify', (select coalesce(json_agg(g.user_id), '[]'::json)
                 from signups g
                where g.session_id = p_session
                  and g.status = 'confirmed'
                  and g.user_id <> auth.uid()));
end $$;


-- ── 나가기 · 만료 ──────────────────────────────────────────────

create or replace function session_cancel(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); my signups; me profiles; s sessions;
        left_cnt int; affected uuid[] := '{}'; g_id uuid;
begin
  select * into my from signups
   where session_id = p_session and user_id = me_id for update;
  if not found or my.status = 'cancelled' then
    return json_build_object('error','not_joined');
  end if;

  select * into s from sessions where id = p_session;
  if not found then return json_build_object('error','not_found'); end if;

  /* 호스트는 자기 모임에서 나갈 수 없다. 남은 사람들의 방을 만든 게
     호스트라서, 빠지는 게 아니라 지우는 것뿐이다 (session_delete). */
  if s.host_id = me_id then
    return json_build_object('error','host');
  end if;

  if s.starts_at <= now() then
    return json_build_object('error','started');
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

  /* 자리가 비었으면 다시 모집이다. 시작 시각까지 채우면 그대로 가고,
     못 채우면 그때 취소된다.

     status 를 되돌리는 게 핵심이다. 예전엔 confirmed 로 남아서, 자리가
     비었는데도 상세 화면은 "✓ 모임이 확정됐어요", 내가 만든 모임은
     "확정 · 채팅방 열림" 이라고 했다. 목록에는 빈자리가 보이는데
     말만 확정이었다. */
  if not session_is_filled(p_session) then
    update sessions set status = 'open' where id = p_session and status = 'confirmed';
  end if;

  /* 남은 사람에게 알린다. 채팅방에도 "○○님이 나갔어요" 가 뜨지만,
     채팅을 안 열어보면 모른다. 취소로 이어질 수 있는 일이다. */
  select * into me from profiles where id = me_id;
  for g_id in
    select user_id from signups
     where session_id = p_session and status = 'confirmed' and user_id <> me_id
  loop
    perform notify_add(g_id, '모임에서 한 자리가 비었어요',
      coalesce(nullif(me.nickname,''), '참가자') || '님이 ' || s.gym ||
      ' 모임에서 나갔어요. 시작 전까지 안 차면 취소돼요.',
      '/session?id=' || p_session::text);
  end loop;

  return json_build_object('ok', true);
end; $$;


create or replace function signups_expire()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select s.id from sessions s
     where s.starts_at <= now()
       -- 끝난 모임은 다시 판단하지 않는다. 이 조건이 없으면 탈퇴 한 번에
       -- 이미 만난 모임이 뒤늦게 취소로 뒤집힌다 (아래 설명).
       and s.ends_at > now()
       and s.status <> 'cancelled'
       and not session_is_filled(s.id)
  loop
    perform session_collapse(r.id);
    n := n + 1;
  end loop;

  for r in
    select g.session_id, g.user_id, s.gym, s.status as sess_status
      from signups g
      join sessions s on s.id = g.session_id
     where g.status = 'waiting'
       and (s.starts_at <= now() or s.status = 'cancelled')
  loop
    perform session_fee_refund(r.session_id, r.user_id);
    update signups set status = 'cut', decided_at = now()
     where session_id = r.session_id and user_id = r.user_id;

    /* 돈이 오갔는데 아무 말이 없던 유일한 자리였다. 호스트가 끝내
       답을 안 해서 시작 시각이 지난 경우인데, 신청함을 직접 열어보기
       전에는 환불된 줄도 몰랐다.

       모임이 취소된 경우는 빼야 한다. 위 루프에서 session_collapse 가
       이미 "모임이 취소됐어요" 를 남겼다. 같은 일로 두 줄을 받으면
       무슨 일인지 더 헷갈린다. */
    if r.sess_status <> 'cancelled' then
      perform notify_add(r.user_id, '신청비를 돌려드렸어요',
        r.gym || ' 모임이 호스트 확인 없이 시작 시각을 지났어요.', '/inbox');
    end if;
    n := n + 1;
  end loop;
  return n;
end; $$;


-- ── 방 · 최종선택 ──────────────────────────────────────────────

create or replace function session_room(p_session uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare me profiles; s sessions; n int; mine boolean;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  select * into s from sessions where id = p_session;
  if not found then return json_build_object('error','not_found'); end if;

  select exists (
    select 1 from signups
     where session_id = p_session and user_id = me.id and status = 'confirmed'
  ) into mine;
  if not mine then return json_build_object('error','not_confirmed'); end if;

  -- 확정 인원. 성비 모임은 짝이 맞는 수, 무관 모임은 그냥 머릿수다.
  n := session_matched(p_session);

  return json_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'gym', s.gym, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
      'capacity', s.capacity, 'gender_mode', s.gender_mode,
      'after_meal', s.after_meal, 'note', s.note),
    'me', jsonb_build_object('id', me.id, 'gender', me.gender, 'level', me.level),
    'matched', n,
    -- 확정된 참가자는 서로 프로필을 본다. 모임 목록은 여전히 블라인드다.
    'people', coalesce((
      select json_agg(row_to_json(t) order by t.gender, t.nickname) from (
        select p.id, p.nickname, p.age, p.gender, p.level, p.career, p.height,
               p.home_gym, p.area, p.mbti, p.intro, p.photo,
               (p.id = me.id) as is_me
          from signups g join profiles p on p.id = g.user_id
         where g.session_id = p_session and g.status = 'confirmed'
      ) t), '[]'::json),
    'videos', coalesce((
      select json_agg(row_to_json(v) order by v.created_at desc) from (
        select id, video_url, created_at
          from session_videos
         where session_id = p_session and user_id = me.id
      ) v), '[]'::json),
    -- 모임 시작 시각이 지나면 최종선택을 연다
    'selection_open', now() >= s.starts_at
  );
end; $$;

revoke execute on function session_room(uuid) from public, anon;
grant  execute on function session_room(uuid) to authenticated;


/* 최종선택. 성비 모임은 이성만 고를 수 있었다 — 그게 이 앱의 전제였다.
   성별 무관 모임에는 그 전제가 없으니 나를 뺀 전원이 대상이다. */
create or replace function selection_submit(p_session uuid, p_chosen uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; s sessions; valid uuid[];
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  select * into s from sessions where id = p_session;
  if not found then return json_build_object('error','not_found'); end if;

  if not exists (select 1 from signups
    where session_id = p_session and user_id = me.id and status = 'confirmed') then
    return json_build_object('error','not_confirmed');
  end if;

  select coalesce(array_agg(g.user_id), '{}') into valid
    from signups g
   where g.session_id = p_session and g.status = 'confirmed'
     and g.user_id <> me.id
     and (s.gender_mode = 'any' or g.gender <> me.gender)
     and g.user_id = any(p_chosen);

  delete from selections where session_id = p_session and chooser_id = me.id;

  if array_length(valid, 1) is not null then
    insert into selections (session_id, chooser_id, chosen_id)
    select p_session, me.id, unnest(valid);
  end if;

  -- 상호선택이 생겼으면 채팅방 개설
  perform sync_matches(p_session);

  return json_build_object('ok', true, 'count', coalesce(array_length(valid,1), 0));
end; $$;

revoke execute on function selection_submit(uuid, uuid[]) from public, anon;
grant  execute on function selection_submit(uuid, uuid[]) to authenticated;


-- ── 화면에 내려주는 목록들 ─────────────────────────────────────
-- gender_mode 를 같이 실어야 "2:2" 로 쓸지 "4명" 으로 쓸지 화면이 안다.
-- 안 실으면 성별 무관 모임이 목록마다 "2:2" 로 둔갑한다.

create or replace function session_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.gender_mode,
           s.level_min, s.level_max, s.age_min, s.age_max,
           s.after_meal, s.note, s.status,
           s.host_id,
           h.nickname as host_nickname,
           h.photo    as host_photo,
           h.age      as host_age,
           h.area     as host_area,
           h.level    as host_level,
           (s.host_id = auth.uid()) as i_am_host,
           s.early_confirm_at,
           exists (select 1 from session_confirm_acks a
                    where a.session_id = s.id and a.user_id = auth.uid()) as my_ack,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed') as m_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed') as f_confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
     where s.status in ('open','confirmed')
       -- 시작하면 목록에서 뺀다. 예외 없다 — 관계자도 여기서는 안 본다.
       -- 대신 session_detail() 로 언제든 열 수 있다.
       and s.starts_at > now()
       -- 내 모임은 항상 — 안 보이면 삭제·관리(환불)를 못 한다.
       -- 남의 모임은 차단 관계가 있으면 감춘다.
       and (s.host_id = auth.uid()
         or ((s.host_id is null or not blocked_with(s.host_id))
             and not exists (
               select 1 from signups g
                where g.session_id = s.id and g.status = 'confirmed'
                  and blocked_with(g.user_id))))
  ) t;
$$;


create or replace function session_detail(p_session uuid)
returns json language sql stable security definer set search_path = public as $$
  select row_to_json(t) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.gender_mode,
           s.level_min, s.level_max, s.age_min, s.age_max,
           s.after_meal, s.note, s.status,
           s.host_id,
           h.nickname as host_nickname,
           h.photo    as host_photo,
           h.age      as host_age,
           h.area     as host_area,
           h.level    as host_level,
           (s.host_id = auth.uid()) as i_am_host,
           s.early_confirm_at,
           exists (select 1 from session_confirm_acks a
                    where a.session_id = s.id and a.user_id = auth.uid()) as my_ack,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed') as m_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed') as f_confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
     where s.id = p_session
       -- 관계자(호스트·신청자)는 시각·상태와 무관하게 언제든 연다.
       -- 취소된 모임도 연다 — "취소됐어요" 를 보여줘야 하고, 환불 내역을
       -- 확인할 데가 여기뿐이다.
       -- 남은 시작 전이고 살아 있는 모임만.
       and (s.host_id = auth.uid()
         or exists (select 1 from signups g
                     where g.session_id = s.id and g.user_id = auth.uid()
                       and g.status in ('waiting','confirmed'))
         or (s.status in ('open','confirmed') and s.starts_at > now()))
       -- 차단 관계는 그대로 가린다 (내 모임은 예외 — 관리해야 하니까)
       and (s.host_id = auth.uid()
         or ((s.host_id is null or not blocked_with(s.host_id))
             and not exists (
               select 1 from signups g
                where g.session_id = s.id and g.status = 'confirmed'
                  and blocked_with(g.user_id))))
    limit 1
  ) t;
$$;


create or replace function my_hosted_sessions()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at desc), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.gender_mode, s.status,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed') as m_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed') as f_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'waiting') as waiting
      from sessions s
     where s.host_id = auth.uid()
       -- 채팅방이 살아 있는 동안은 카드도 남는다. 둘이 같은 시각에
       -- 사라져야 "방은 없는데 카드만 있다" 가 안 생긴다.
       and case when s.status = 'cancelled'
                then coalesce(s.cancelled_at, s.ends_at)
                else s.ends_at
           end > now() - interval '24 hours'
     order by s.starts_at desc
     limit 100
  ) t;
$$;


create or replace function my_signups()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.gender_mode,
           s.status as session_status,
           -- 시작한 모임의 대기 신청은 이미 끝난 것이다 (크론이 곧 반환한다)
           case when g.status = 'waiting' and s.starts_at <= now()
                then 'cut' else g.status end as my_status,
           h.nickname as host_nickname, h.photo as host_photo
      from signups g
      join sessions s on s.id = g.session_id
      left join profiles h on h.id = s.host_id
     where g.user_id = auth.uid()
       and g.status <> 'cancelled'
       and s.host_id <> auth.uid()
       -- 기준은 모임 시작 시각 하나뿐이다 — 그 사이에 거절당했든
       -- 취소됐든 상관없이 그날이 지나면 내려간다. 상태마다 다른 시각을
       -- 쓰면 "왜 이건 아직 있고 저건 없지" 를 설명할 수 없다.
       and s.starts_at > now() - interval '24 hours'
       and (s.host_id is null or not blocked_with(s.host_id))
  ) t;
$$;


create or replace function my_hosted_requests()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) from (
    select s.id as session_id, s.gym, s.starts_at, s.capacity, s.gender_mode,
           g.created_at,
           p.id as user_id, p.nickname, p.age, p.gender, p.level, p.career,
           p.height, p.home_gym, p.area, p.mbti, p.intro, p.photo,
           (select count(*) from signups x
             where x.session_id = s.id and x.gender = p.gender
               and x.status = 'confirmed') as same_gender_confirmed,
           -- 성별 무관 모임은 성별로 세면 안 된다. 화면이 "자리 없음" 을
           -- 이걸로 판단한다.
           (select count(*) from signups x
             where x.session_id = s.id and x.status = 'confirmed') as confirmed_total
      from signups g
      join sessions s on s.id = g.session_id
      join profiles p on p.id = g.user_id
     where s.host_id = auth.uid()
       and g.status = 'waiting'
       and s.status in ('open','confirmed')
       and s.starts_at > now() - interval '24 hours'
       and not blocked_with(p.id)
  ) t;
$$;


create or replace function my_confirm_proposals()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.early_confirm_at desc), '[]'::json)
  from (
    select s.id as session_id, s.gym, s.starts_at, s.capacity, s.gender_mode,
           s.early_confirm_at,
           h.nickname as host_nickname, h.photo as host_photo,
           session_matched(s.id) as matched
      from sessions s
      join signups g on g.session_id = s.id
      left join profiles h on h.id = s.host_id
     where g.user_id = auth.uid()
       and g.status = 'confirmed'
       and s.status = 'open'
       and s.host_id <> auth.uid()
       and s.early_confirm_at is not null
       and (s.host_id is null or not blocked_with(s.host_id))
       and not exists (select 1 from session_confirm_acks a
                        where a.session_id = s.id and a.user_id = auth.uid())
  ) t;
$$;


create or replace function my_session_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json)
  from (
    select s.id as session_id,
           s.gym,
           s.starts_at,
           s.ends_at,
           s.status,
           s.cancelled_at,
           s.capacity,
           s.gender_mode,
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'confirmed') as members,
           (select body from messages x
             where x.session_id = s.id order by x.created_at desc limit 1) as last_body,
           coalesce(
             (select max(created_at) from messages x where x.session_id = s.id),
             s.created_at) as last_at,
           (select count(*) from messages x
             where x.session_id = s.id
               and x.sender_id <> auth.uid()
               and x.created_at > coalesce(
                     (select r.last_read_at from session_chat_reads r
                       where r.session_id = s.id and r.user_id = auth.uid()),
                     '-infinity'::timestamptz)) as unread
      from sessions s
      join signups g on g.session_id = s.id
     where g.user_id = auth.uid()
       and g.status = 'confirmed'
       -- 취소 여부는 session_chat_open 이 함께 본다 (취소 뒤 24시간)
       and session_chat_open(s.id)
       -- 차단은 내 목록에서만 치운다. 차단당한 쪽은 방을 그대로 본다 —
       -- 제3자와의 대화까지 끊기면 영문도 모르고 잃는 게 너무 많다.
       and not exists (
         select 1 from signups b
          where b.session_id = s.id and b.status = 'confirmed'
            and blocked_by_me(b.user_id))
  ) t;
$$;


create or replace function my_match_history()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at desc), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.gender_mode,
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
