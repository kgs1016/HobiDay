-- ═══════════════════════════════════════════════════════════════
--  성비를 없앤다 — 모임은 그냥 2~8명이다
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 Run · 몇 번 돌려도 안전
-- ═══════════════════════════════════════════════════════════════
--
-- 방향이 바뀌었다. "이성을 만나는 앱" 이 아니라 "같이 클라이밍할 사람을
-- 찾는 앱" 이다. 그래서 성별로 판정하던 것을 전부 뗀다.
--
--   모임 확정     남녀 같은 수 → 그냥 정원(2~8명)
--   사람 찾기     이성만 → 전원
--   관심 보내기   이성에게만 → 전원
--   최종선택      이성만 고를 수 있었다 → 나를 뺀 전원
--
-- capacity 의 뜻도 하나로 통일된다. 예전엔 모드에 따라 갈렸다 —
-- balanced 는 성별당 인원(2 = 2:2 = 4명), any 는 총 인원. 이제 언제나
-- 총 인원이다. 그래서 남아 있는 balanced 모임은 capacity 를 2배로
-- 환산해야 뜻이 보존된다 (2:2 로 열린 모임 = 4명 모임).
--
-- ⚠️ 남겨두는 것
--   · profiles.gender · signups.gender — 프로필 표시와 기록용으로 남는다.
--     판정에는 이제 아무 데도 안 쓴다.
--   · profiles_gender_is_fixed 트리거 — 성별 변경 잠금. 근거 넷 중 셋이
--     사라졌지만 signups 에 남은 기록과의 정합성은 그대로다. 풀지 여부는
--     따로 정한다.
--   · 조기 확정 — 성비 조건만 걷어내고 기능은 남긴다. 정원이 8명까지
--     열리면 못 채우는 모임이 늘어서 오히려 더 쓸모가 있다.

-- ───────────────────────────────────────────────────────────────
--  1. 표 — gender_mode 를 떼고 capacity 를 총원으로 통일
-- ───────────────────────────────────────────────────────────────
-- 컬럼이 아직 있을 때만 환산한다. 두 번 돌려도 2배가 두 번 되지 않는다.

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'sessions'
                and column_name = 'gender_mode') then
    -- 옛 제약이 gender_mode 를 보고 있어서 환산 전에 걷어내야 한다
    alter table sessions drop constraint if exists sessions_capacity_check;
    alter table sessions drop constraint if exists sessions_gender_mode_check;

    -- 2:2 로 열린 모임은 4명 모임이었다. 뜻을 그대로 옮긴다.
    update sessions set capacity = capacity * 2 where gender_mode = 'balanced';

    alter table sessions drop column gender_mode;
  end if;
end $$;

alter table sessions drop constraint if exists sessions_capacity_check;
alter table sessions add constraint sessions_capacity_check
  check (capacity between 2 and 8);

-- ───────────────────────────────────────────────────────────────
--  2. 자리 계산 — 성별을 안 본다
-- ───────────────────────────────────────────────────────────────
-- session_has_seat 은 성별 인자를 받던 함수다. 인자를 뺀 새 함수를 만들고
-- 옛 시그니처는 이 파일 맨 끝에서 지운다 (부르는 쪽을 다 고친 뒤에).

create or replace function session_has_seat(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from signups g
           where g.session_id = s.id and g.status = 'confirmed') < s.capacity
    from sessions s where s.id = p_session;
$$;

create or replace function session_is_filled(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (select count(*) from signups g
           where g.session_id = s.id and g.status = 'confirmed') >= s.capacity
    from sessions s where s.id = p_session;
$$;

-- 확정 인원. 성비가 없으니 짝을 맞출 것도 없다 — 그냥 머릿수다.
create or replace function session_matched(p_session uuid)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from signups g
           where g.session_id = p_session and g.status = 'confirmed')::int;
$$;

revoke execute on function session_has_seat(uuid)  from public, anon;
revoke execute on function session_is_filled(uuid) from public, anon;
revoke execute on function session_matched(uuid)   from public, anon;
grant  execute on function session_has_seat(uuid), session_is_filled(uuid),
                           session_matched(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3. 모임 만들기 — 성비 인자를 뺀다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260828122000 의 본문을 그대로 들고 온 뒤 성비만 걷어냈다.
--    인자가 하나 줄어 시그니처가 바뀌므로 옛 함수는 끝에서 지운다.

create or replace function session_create(
  p_gym text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_capacity int, p_level_min int, p_level_max int,
  p_age_min int, p_age_max int,
  p_after_meal boolean, p_note text,
  -- master 에서 고른 암장. 안 주면 예전처럼 p_gym 자유입력으로 동작한다
  p_gym_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; sid uuid; mg gyms;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  -- 정원은 총 인원 하나뿐이다. 혼자는 모임이 아니라서 2부터 시작한다.
  if p_capacity not between 2 and 8 then
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

  -- master 암장을 골랐다면 실재하고 운영 중인지 확인하고,
  -- gym 문자열에는 canonical name 을 담는다. source of truth 는 gym_id 지만
  -- 옛 화면들(my_hosted_sessions·채팅 목록 등)은 아직 문자열을 읽는다.
  if p_gym_id is not null then
    select * into mg from gyms where id = p_gym_id and is_active;
    if not found then return json_build_object('error','bad_gym'); end if;
  end if;

  insert into sessions (host_id, gym, gym_id, starts_at, ends_at, capacity,
                        level_min, level_max, age_min, age_max,
                        after_meal, note)
  values (me.id, coalesce(mg.name, p_gym), p_gym_id,
          p_starts_at, p_ends_at, p_capacity,
          p_level_min, p_level_max, p_age_min, p_age_max,
          p_after_meal, nullif(trim(p_note), ''))
  returning id into sid;

  -- 호스트는 자기 모임의 첫 확정 인원이다 (정원 안에 든다)
  insert into signups (session_id, user_id, gender, status)
  values (sid, me.id, me.gender, 'confirmed');

  return json_build_object('id', sid);
end; $$;

revoke execute on function session_create(
  text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,uuid) from public, anon;
grant execute on function session_create(
  text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  4. 신청 · 승인 — 성별로 자리를 세지 않는다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260902120000 의 본문을 그대로 들고 왔다. session_has_seat 호출에서
--    성별 인자만 빠졌다.

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
                      else signups.status end;

  return json_build_object(
    'status', (select status from signups where session_id = s.id and user_id = me.id),
    'cost', cost, 'balance', credit_balance(me.id));
end; $$;

revoke execute on function session_join(uuid) from public, anon;
grant  execute on function session_join(uuid) to authenticated;

-- ⚠️ 20260827140000 의 본문을 그대로 들고 왔다. session_has_seat 호출만 바뀐다.

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

  if not session_has_seat(p_session) then
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

-- ───────────────────────────────────────────────────────────────
--  5. 조기 확정 — "남녀 수가 맞아야" 를 뗀다
-- ───────────────────────────────────────────────────────────────
-- 기능은 그대로 둔다. 뜻만 하나로 줄었다 —
-- "정원은 못 채웠지만 지금 인원으로 가자". 2명 이상이면 언제든 건다.
-- (혼자서는 모임이 아니라 최소 2명이다. not_balanced 에러 코드는 화면이
--  이미 쓰고 있어서 이름만 그대로 두고 뜻을 "인원 부족" 으로 옮겼다.)

create or replace function session_propose_confirm(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; matched int;
begin
  select * into s from sessions where id = p_session for update;
  if not found then return json_build_object('error','not_found'); end if;
  if s.host_id <> auth.uid() then return json_build_object('error','not_host'); end if;
  if s.status <> 'open' then return json_build_object('error','not_open'); end if;

  select count(*) into matched from signups
   where session_id = p_session and status = 'confirmed';
  if matched < 2 then return json_build_object('error','not_balanced'); end if;

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
declare s sessions; matched int; pending int;
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

  select count(*) into matched from signups
   where session_id = p_session and status = 'confirmed';
  if matched < 2 then return json_build_object('error','not_balanced'); end if;

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

  -- 정원을 지금 인원으로 줄여 못 박는다. 이제 뜻은 하나 — 총 인원이다.
  update sessions set capacity = matched, status = 'confirmed' where id = p_session;

  -- 확정의 순간 — 나 빼고 전원(호스트 포함)에게 알린다
  return json_build_object('ok', true, 'confirmed', true, 'capacity', matched,
    'notify', (select coalesce(json_agg(g.user_id), '[]'::json)
                 from signups g
                where g.session_id = p_session
                  and g.status = 'confirmed'
                  and g.user_id <> auth.uid()));
end $$;

-- ───────────────────────────────────────────────────────────────
--  6. 목록 · 상세 — m_confirmed / f_confirmed 를 confirmed 하나로
-- ───────────────────────────────────────────────────────────────
-- 성별로 나눠 세던 두 칸이 필요 없어졌다. 화면도 "남 1자리 · 여 2자리"
-- 대신 "3자리" 하나만 말한다.
-- ⚠️ 20260828122000 의 본문을 그대로 들고 온 뒤 select 목록만 바꿨다.

create or replace function session_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id,
           coalesce(mg.name, s.gym) as gym,
           s.gym_id,
           mg.thumbnail_url as gym_thumb,
           s.starts_at, s.ends_at, s.capacity,
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
             where g.session_id = s.id and g.status = 'confirmed') as confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
      left join gyms mg on mg.id = s.gym_id
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
    select s.id,
           coalesce(mg.name, s.gym) as gym,
           s.gym_id,
           mg.thumbnail_url as gym_thumb,
           s.starts_at, s.ends_at, s.capacity,
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
             where g.session_id = s.id and g.status = 'confirmed') as confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
      left join gyms mg on mg.id = s.gym_id
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

revoke execute on function session_list()       from public, anon;
revoke execute on function session_detail(uuid) from public, anon;
grant  execute on function session_list(), session_detail(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  7. 화면에 내려주는 목록들 — gender_mode 를 뺀다
-- ───────────────────────────────────────────────────────────────
-- 예전엔 "2:2" 로 쓸지 "4명" 으로 쓸지 화면이 알아야 해서 모드를 같이
-- 실었다. 이제 표기가 하나뿐이라 실을 것도 없다.

create or replace function my_signups()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
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

-- same_gender_confirmed 는 뜻을 잃었다. 자리 판단은 confirmed_total 하나로.
create or replace function my_hosted_requests()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) from (
    select s.id as session_id, s.gym, s.starts_at, s.capacity,
           g.created_at,
           p.id as user_id, p.nickname, p.age, p.gender, p.level, p.career,
           p.height, p.home_gym, p.area, p.mbti, p.intro, p.photo,
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

create or replace function my_hosted_sessions()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at desc), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.status,
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'confirmed') as confirmed,
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

create or replace function my_confirm_proposals()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.early_confirm_at desc), '[]'::json)
  from (
    select s.id as session_id, s.gym, s.starts_at, s.capacity,
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

create or replace function my_match_history()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at desc), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
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

create or replace function my_session_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json)
  from (
    select s.id as session_id,
           coalesce(mg.name, s.gym) as gym,
           mg.thumbnail_url as gym_thumb,
           s.starts_at,
           s.ends_at,
           s.status,
           s.cancelled_at,
           s.capacity,
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
      left join gyms mg on mg.id = s.gym_id
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

revoke execute on function my_signups()            from public, anon;
revoke execute on function my_hosted_requests()    from public, anon;
revoke execute on function my_hosted_sessions()    from public, anon;
revoke execute on function my_confirm_proposals()  from public, anon;
revoke execute on function my_match_history()      from public, anon;
revoke execute on function my_session_chats()      from public, anon;
grant  execute on function my_signups(), my_hosted_requests(), my_hosted_sessions(),
                           my_confirm_proposals(), my_match_history(), my_session_chats()
to authenticated;

-- ───────────────────────────────────────────────────────────────
--  8. 모임 진행 화면 · 최종선택
-- ───────────────────────────────────────────────────────────────

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

  -- 확정 인원 = 머릿수. 성비가 없으니 짝을 맞출 것도 없다.
  n := session_matched(p_session);

  return json_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'gym', s.gym, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
      'capacity', s.capacity,
      'after_meal', s.after_meal, 'note', s.note),
    'me', jsonb_build_object('id', me.id, 'gender', me.gender, 'level', me.level),
    'matched', n,
    -- 확정된 참가자는 서로 프로필을 본다. 모임 목록은 여전히 블라인드다.
    'people', coalesce((
      select json_agg(row_to_json(t) order by t.nickname) from (
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

/* 최종선택. 이성만 고를 수 있다는 전제가 사라졌으니 나를 뺀 전원이
   대상이다. (화면에서는 2026-08 에 이미 뺐다 — 함수만 남아 있다.) */
create or replace function selection_submit(p_session uuid, p_chosen uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; valid uuid[];
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  if not exists (select 1 from sessions where id = p_session) then
    return json_build_object('error','not_found');
  end if;

  if not exists (select 1 from signups
    where session_id = p_session and user_id = me.id and status = 'confirmed') then
    return json_build_object('error','not_confirmed');
  end if;

  select coalesce(array_agg(g.user_id), '{}') into valid
    from signups g
   where g.session_id = p_session and g.status = 'confirmed'
     and g.user_id <> me.id
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

-- ───────────────────────────────────────────────────────────────
--  9. 관심 보내기 — 이성에게만 이던 것을 푼다
-- ───────────────────────────────────────────────────────────────
-- 화면에서는 "채팅 보내기" 로 부른다. 하는 일은 그대로다 — 상대 신청함에
-- 뜨고, 수락하면 채팅방이 열린다.
-- ⚠️ 20260815223000 의 본문을 그대로 들고 온 뒤 same_gender 만 뺐다.

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
    return json_build_object('error','already', 'status', existing.status);
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

-- ───────────────────────────────────────────────────────────────
--  10. 옛 시그니처 정리
-- ───────────────────────────────────────────────────────────────
-- create or replace 는 인자가 다르면 교체가 아니라 오버로드다. 남겨두면
-- 어느 쪽이 불릴지 모호해지므로 부르는 쪽을 다 고친 지금 지운다.

drop function if exists session_has_seat(uuid, text);
drop function if exists session_create(
  text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,text,uuid);
