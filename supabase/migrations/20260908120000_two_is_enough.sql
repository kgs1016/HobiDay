-- ═══════════════════════════════════════════════════════════════
--  둘이면 모임이다 — 정원은 "최대" 가 된다 · 조기 확정 제거
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 Run · 몇 번 돌려도 안전
-- ═══════════════════════════════════════════════════════════════
--
-- 지금까지 모임은 "정원을 채워야" 열렸다. 못 채우면 시작 시각에 취소됐고,
-- 그 사이를 메우려고 조기 확정(호스트가 제안 → 게스트 전원 수락 → 정원을
-- 지금 인원으로 줄여 못 박음)을 뒀다.
--
-- 규칙을 뒤집는다.
--
--   capacity   채워야 하는 수  →  **최대 정원** (여기까지만 받는다)
--   성사       정원이 찼을 때   →  **둘 이상이면 그 순간부터**
--   한 명 남음 모임 취소        →  다시 모집 (시작할 때까지)
--   조기 확정  필요             →  없앤다 (둘이면 이미 확정이다)
--
-- 그래서 status 의 뜻도 바뀐다. 예전엔 'confirmed' 가 "정원이 찼다" 라
-- 모집의 끝이었다. 이제는 "열린다" 는 뜻이고, **확정된 뒤에도 최대
-- 정원까지 계속 받는다.** 확정과 모집 중이 더 이상 배타적이지 않다.
--
--   open       아직 혼자 (호스트뿐)
--   confirmed  둘 이상 — 열린다. 자리가 남아 있으면 계속 받는다
--   cancelled  호스트가 지웠거나, 시작할 때까지 둘이 못 됐다
--
-- 취소가 남는 자리는 둘뿐이다 — 호스트 삭제(session_delete)와 시작
-- 시각에 혼자인 모임(signups_expire). 사람이 빠져서 취소되는 길은 없앤다.

-- ───────────────────────────────────────────────────────────────
--  1. 상태를 인원에 맞춘다
-- ───────────────────────────────────────────────────────────────
-- session_try_confirm 은 "정원이 찼으면 확정" 이었다. 이제 판단이
-- 양방향이라(둘이 되면 확정 · 하나로 줄면 다시 모집) 이름부터 바꾼다.

create or replace function session_sync_status(p_session uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s sessions; cnt int; want text;
begin
  select * into s from sessions where id = p_session for update;
  -- 취소·종료된 모임은 인원과 무관하게 그대로 둔다
  if not found or s.status not in ('open','confirmed') then return null; end if;

  select count(*) into cnt from signups
   where session_id = p_session and status = 'confirmed';

  want := case when cnt >= 2 then 'confirmed' else 'open' end;
  if s.status is distinct from want then
    update sessions set status = want where id = p_session;
  end if;
  return want;
end $$;

revoke execute on function session_sync_status(uuid) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 승인 — 둘이 되는 순간 확정이다
-- ───────────────────────────────────────────────────────────────
-- 방이 열리는 시점(확정 2명)과 모임이 확정되는 시점이 같아졌다. 예전엔
-- 방이 먼저 열리고 확정은 정원이 찰 때까지 기다렸다.
-- ⚠️ 20260907160000 의 본문을 그대로 들고 온 뒤 확정 판정만 바꿨다.

create or replace function session_approve(p_session uuid, p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; g signups; total_cnt int; opened boolean;
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
     다른 사람이 먼저 확정되는 순서라면 여기서 처음 마주친다. */
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

  -- 최대 정원까지만 받는다
  if not session_has_seat(p_session) then
    return json_build_object('error','full');
  end if;

  update signups set status = 'confirmed', decided_at = now()
   where session_id = p_session and user_id = p_user;

  select count(*) into total_cnt from signups
   where session_id = p_session and status = 'confirmed';

  -- 둘이 됐다 = 모임이 열렸다 = 채팅방도 열렸다. 한 사건이다.
  opened := (total_cnt = 2);
  perform session_sync_status(p_session);

  -- 방이 처음 열린 시각을 적어둔다. 나중에 사람이 빠져 인원이 줄어도
  -- "이 모임엔 방이 있었다" 를 알아야 취소 안내를 띄울 수 있다.
  if opened then
    update sessions set chat_opened_at = now()
     where id = p_session and chat_opened_at is null;
  end if;

  -- 알릴 사람 = 나(호스트)와 방금 승인한 사람을 뺀 확정자.
  -- 방금 승인된 사람은 클라이언트가 따로 "수락됐어요" 를 보낸다.
  return json_build_object('ok', true,
    'chat_opened', opened, 'confirmed', opened,
    'notify', case when opened then
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
--  3. 나가기 — 혼자 남아도 모임은 안 무너진다
-- ───────────────────────────────────────────────────────────────
-- 예전엔 확정이 1명까지 떨어지면 모임을 취소로 넘겼다(session_collapse).
-- 이제는 다시 모집으로 돌아간다. 시작할 때까지 한 명만 더 오면 열린다.
-- ⚠️ 20260907140000 의 본문을 그대로 들고 온 뒤 붕괴 갈래를 걷어냈다.

create or replace function session_cancel(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); my signups; me profiles; s sessions; g_id uuid;
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

  /* 방이 열려 있으면 누가 빠졌는지 남긴다 */
  if my.status = 'confirmed' and session_chat_open(p_session) then
    select * into me from profiles where id = me_id;
    insert into messages (session_id, sender_id, body, kind)
    values (p_session, me_id,
            coalesce(nullif(me.nickname,''), '참가자') || '님이 나갔어요', 'system');
  end if;

  /* 인원에 맞춰 상태만 되돌린다. 혼자 남으면 open 으로 내려가 다시
     모집이고, 시작할 때까지 못 채우면 그때 크론이 정리한다. */
  perform session_sync_status(p_session);

  /* 남은 사람에게 알린다. 채팅방에도 "○○님이 나갔어요" 가 뜨지만,
     채팅을 안 열어보면 모른다. */
  select * into me from profiles where id = me_id;
  for g_id in
    select user_id from signups
     where session_id = p_session and status = 'confirmed' and user_id <> me_id
  loop
    perform notify_add(g_id, '모임에서 한 자리가 비었어요',
      coalesce(nullif(me.nickname,''), '참가자') || '님이 ' || s.gym ||
      ' 모임에서 나갔어요.',
      '/session?id=' || p_session::text);
  end loop;

  return json_build_object('ok', true);
end; $$;

revoke execute on function session_cancel(uuid) from public, anon;
grant  execute on function session_cancel(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  4. 시작 시각 — 혼자인 모임만 정리한다
-- ───────────────────────────────────────────────────────────────
-- "정원을 못 채웠으면 취소" 가 "혼자면 취소" 가 된다. 둘이면 열린 것이고,
-- 최대 정원은 애초에 채우라고 정한 수가 아니다.
-- ⚠️ 20260907140000 의 본문을 그대로 들고 온 뒤 조건만 바꿨다.

create or replace function signups_expire()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select s.id from sessions s
     where s.starts_at <= now()
       -- 끝난 모임은 다시 판단하지 않는다
       and s.ends_at > now()
       and s.status <> 'cancelled'
       and (select count(*) from signups g
             where g.session_id = s.id and g.status = 'confirmed') < 2
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

    if r.sess_status <> 'cancelled' then
      perform notify_add(r.user_id, '신청비를 돌려드렸어요',
        r.gym || ' 모임이 호스트 확인 없이 시작 시각을 지났어요.', '/inbox');
    end if;
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function signups_expire() from public, anon, authenticated;

-- 혼자라서 못 연 모임의 안내도 정원 이야기를 뗀다
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
    perform session_fee_refund(p_session, g.user_id);
    affected := affected || g.user_id;
    perform notify_add(g.user_id, '😢 모임이 취소됐어요',
      s.gym || ' 모임이 취소됐어요.', '/inbox');
  end loop;

  if s.host_id is not null and s.host_id is distinct from auth.uid() then
    perform notify_add(s.host_id, '😢 내 모임이 취소됐어요',
      s.gym || ' 모임에 아무도 오지 않아 취소됐어요.', '/session/mine');
  end if;

  return affected;
end $$;

revoke execute on function session_collapse(uuid) from public, anon, authenticated;

-- 시작 한 시간 전 알림도 "정원" 이 아니라 "혼자" 를 말한다
create or replace function sessions_remind()
returns int language plpgsql security definer set search_path = public as $$
declare r record; g record; n int := 0; hm text;
begin
  for r in
    select s.* from sessions s
     where s.status in ('open','confirmed')
       and s.reminded_at is null
       and s.starts_at > now()
       and s.starts_at <= now() + interval '70 minutes'
  loop
    hm := to_char(r.starts_at at time zone 'Asia/Seoul', 'HH24:MI');
    for g in
      select user_id from signups
       where session_id = r.id and status = 'confirmed'
    loop
      if r.status = 'confirmed' then
        perform notify_add(g.user_id, '오늘 모임이 있어요',
          r.gym || ' · ' || hm || ' 에 만나요.',
          '/session?id=' || r.id::text);
      else
        perform notify_add(g.user_id, '아직 아무도 오지 않았어요',
          r.gym || ' · ' || hm ||
          ' 모임에 아직 참가자가 없어요. 시작할 때까지 아무도 없으면 열리지 않아요.',
          '/session?id=' || r.id::text);
      end if;
      n := n + 1;
    end loop;
    update sessions set reminded_at = now() where id = r.id;
  end loop;
  return n;
end $$;

revoke execute on function sessions_remind() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
--  5. 조기 확정 제거
-- ───────────────────────────────────────────────────────────────
-- 존재 이유가 "정원을 못 채워 멈춘 모임을 지금 인원으로 열자" 였다.
-- 둘이면 이미 열리므로 멈추는 일 자체가 없어졌다.
--
-- 무엇보다 session_accept_confirm 은 확정하면서 capacity 를 그때 인원으로
-- 줄여 못 박았다. capacity 가 "최대 정원" 이 된 지금은 정반대 동작이다 —
-- 더 받을 수 있는 자리를 스스로 닫아버린다.
--
-- 함수를 먼저 지우고 표·컬럼을 지운다 (본문이 그것들을 읽는다).

drop function if exists session_propose_confirm(uuid);
drop function if exists session_accept_confirm(uuid);
drop function if exists session_withdraw_confirm(uuid);
drop function if exists my_confirm_proposals();
drop function if exists session_try_confirm(uuid);

-- 목록·상세에서 early_confirm_at · my_ack 를 뺀다
-- ⚠️ 20260907140000 의 본문을 그대로 들고 온 뒤 두 칸만 뺐다.

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
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'confirmed') as confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
      left join gyms mg on mg.id = s.gym_id
     where s.status in ('open','confirmed')
       and s.starts_at > now()
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
           (select count(*) from signups g
             where g.session_id = s.id and g.status = 'confirmed') as confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
      left join gyms mg on mg.id = s.gym_id
     where s.id = p_session
       and (s.host_id = auth.uid()
         or exists (select 1 from signups g
                     where g.session_id = s.id and g.user_id = auth.uid()
                       and g.status in ('waiting','confirmed'))
         or (s.status in ('open','confirmed') and s.starts_at > now()))
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

-- 신청함 배지에서 확정 제안을 뺀다
create or replace function inbox_counts()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'requests', (select count(*) from requests r
                  where r.to_id = auth.uid() and r.status = 'pending'
                    and r.created_at > now() - interval '7 days'
                    and not blocked_with(r.from_id))
              + (select count(*) from json_array_elements(my_hosted_requests())),
    'likes', (select count(*) from requests r
               where r.to_id = auth.uid() and r.status = 'pending'
                 and r.created_at > now() - interval '7 days'
                 and not blocked_with(r.from_id)),
    'hosted', (select count(*) from json_array_elements(my_hosted_requests())),
    'sent_today', (select count(*) from requests
                    where from_id = auth.uid() and created_at > now() - interval '1 day'),
    'daily_limit', request_daily_limit(),
    'unread_messages',
      (select count(*)
         from messages x
         join matches m on m.id = x.match_id
        where auth.uid() in (m.user_a, m.user_b)
          and m.closed_at is null
          and (case when m.user_a = auth.uid() then m.a_left_at else m.b_left_at end) is null
          and x.sender_id is distinct from auth.uid()
          and not blocked_by_me(case when m.user_a = auth.uid() then m.user_b else m.user_a end)
          and x.created_at > coalesce(
                (select r.last_read_at from chat_reads r
                  where r.match_id = m.id and r.user_id = auth.uid()),
                '-infinity'::timestamptz))
      +
      (select count(*)
         from messages x
         join signups g on g.session_id = x.session_id and g.user_id = auth.uid()
         join sessions s on s.id = x.session_id
        where g.status = 'confirmed'
          and session_chat_open(s.id)
          and x.sender_id is distinct from auth.uid()
          and not exists (
            select 1 from signups b
             where b.session_id = s.id and b.status = 'confirmed'
               and blocked_by_me(b.user_id))
          and x.created_at > coalesce(
                (select r.last_read_at from session_chat_reads r
                  where r.session_id = s.id and r.user_id = auth.uid()),
                '-infinity'::timestamptz)),
    'unread_rooms', (
      select count(*) from matches m
       where auth.uid() in (m.user_a, m.user_b)
         and m.closed_at is null
         and (case when m.user_a = auth.uid() then m.a_left_at else m.b_left_at end) is null
         and not blocked_by_me(case when m.user_a = auth.uid() then m.user_b else m.user_a end)
         and exists (
           select 1 from messages x
            where x.match_id = m.id
              and x.sender_id is distinct from auth.uid()
              and x.created_at > coalesce(
                    (select r.last_read_at from chat_reads r
                      where r.match_id = m.id and r.user_id = auth.uid()),
                    '-infinity'::timestamptz)))
  );
$$;

revoke execute on function inbox_counts() from public, anon;
grant  execute on function inbox_counts() to authenticated;

-- 이제 아무도 안 읽는다
drop table if exists session_confirm_acks;
alter table sessions drop column if exists early_confirm_at;

-- ───────────────────────────────────────────────────────────────
--  6. 이미 있는 모임에 새 규칙을 적용한다
-- ───────────────────────────────────────────────────────────────
-- 둘 이상 모였는데 정원을 못 채워 'open' 으로 남아 있던 모임들. 새 규칙
-- 에서는 이미 확정된 모임이다. 안 맞춰주면 상세는 "모집 중" 이라 하고
-- 채팅방은 열려 있는 상태가 그대로 굳는다.

update sessions s
   set status = 'confirmed'
 where s.status = 'open'
   and (select count(*) from signups g
         where g.session_id = s.id and g.status = 'confirmed') >= 2;
