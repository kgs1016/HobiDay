-- 모든 앱 기능 무료 전환. 신청·승인·취소·차단 규칙은 그대로 유지한다.
-- 과거 원장은 API에 노출되지 않는 retired 스키마로 옮겨 보관한다.
-- 잔액 조회·적립·차감·반환 RPC는 제거하며 새 활동은 원장을 쓰지 않는다.
-- 기존 배포의 함수 정의를 대조한 뒤 비용 관련 부분만 제거했다.

-- 1. 채팅 신청: 잔액과 일일 유료 전환 한도 없이 보낸다.
create or replace function request_send(p_to uuid, p_message text default null)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; you profiles; existing requests;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;
  if p_to = me.id then return json_build_object('error','self'); end if;

  select * into you from profiles where id = p_to;
  if not found then return json_build_object('error','not_found'); end if;
  if blocked_with(p_to) then return json_build_object('error','blocked'); end if;
  if not you.is_public then return json_build_object('error','not_public'); end if;

  -- 같은 상대에게 동시에 보내도 신청은 한 건이다.
  perform pg_advisory_xact_lock(hashtext(me.id::text));

  select * into existing from requests where from_id = me.id and to_id = p_to;
  if found then
    if existing.status = 'declined' then

      delete from requests where id = existing.id;
    else
      return json_build_object('error','already', 'status', existing.status);
    end if;
  end if;

  insert into requests (from_id, to_id, message)
  values (me.id, p_to, nullif(trim(p_message), ''));

  return json_build_object('ok', true);
end; $$;

-- 2. 모임 신청: 비용과 잔액 반환 필드를 없앤다.
create or replace function session_join(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; s sessions; existing signups;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  select * into s from sessions where id = p_session for update;
  if not found or s.status not in ('open','confirmed') then
    return json_build_object('error','not_open');
  end if;

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

  if not session_has_seat(s.id) then
    return json_build_object('error','full');
  end if;

  select * into existing from signups
   where session_id = s.id and user_id = me.id;
  if found and existing.status in ('waiting','confirmed') then
    return json_build_object('status', existing.status);
  end if;

  insert into signups (session_id, user_id, gender, status)
  values (s.id, me.id, me.gender, 'waiting')
  on conflict (session_id, user_id) do update
    set status = case when signups.status in ('cancelled','cut') then 'waiting'
                      else signups.status end,

        decided_at = case when signups.status in ('cancelled','cut') then null
                          else signups.decided_at end,
        created_at = case when signups.status in ('cancelled','cut') then now()
                          else signups.created_at end;

  return json_build_object(
    'status', (select status from signups where session_id = s.id and user_id = me.id));
end; $$;

-- 3. 취소·거절·만료·차단: 자리와 알림만 처리한다.

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

  if s.host_id = me_id then
    return json_build_object('error','host');
  end if;

  if s.starts_at <= now() then
    return json_build_object('error','started');
  end if;

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  if my.status = 'confirmed' and session_chat_open(p_session) then
    select * into me from profiles where id = me_id;
    insert into messages (session_id, sender_id, body, kind)
    values (p_session, me_id,
            coalesce(nullif(me.nickname,''), '참가자') || '님이 나갔어요', 'system');
  end if;

  perform session_sync_status(p_session);

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

  if exists (
    select 1 from signups x
      join blocks b on (b.blocker_id = x.user_id and b.blocked_id = p_user)
                    or (b.blocker_id = p_user and b.blocked_id = x.user_id)
     where x.session_id = p_session and x.status = 'confirmed') then
    update signups set status = 'cut', decided_at = now()
     where session_id = p_session and user_id = p_user;

    return json_build_object('error','blocked_member');
  end if;

  if not session_has_seat(p_session) then
    return json_build_object('error','full');
  end if;

  update signups set status = 'confirmed', decided_at = now()
   where session_id = p_session and user_id = p_user;

  select count(*) into total_cnt from signups
   where session_id = p_session and status = 'confirmed';

  opened := (total_cnt = 2);
  perform session_sync_status(p_session);

  if opened then
    update sessions set chat_opened_at = now()
     where id = p_session and chat_opened_at is null;
  end if;

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

create or replace function session_reject(p_session uuid, p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session;
  if not found then return json_build_object('error','not_found'); end if;
  if s.host_id <> auth.uid() then return json_build_object('error','not_host'); end if;

  update signups set status = 'cut', decided_at = now()
   where session_id = p_session and user_id = p_user and status = 'waiting';
  if not found then return json_build_object('error','not_waiting'); end if;

  perform notify_add(p_user, '모임 신청 결과를 알려드려요',
    s.gym || ' 모임은 이번엔 함께하지 못하게 됐어요.',
    '/inbox');

  return json_build_object('ok', true);
end $$;

create or replace function signups_expire()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select s.id from sessions s
     where s.starts_at <= now()

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

    update signups set status = 'cut', decided_at = now()
     where session_id = r.session_id and user_id = r.user_id;

    if r.sess_status <> 'cancelled' then
      perform notify_add(r.user_id, '모임 신청이 마감됐어요',
        r.gym || ' 모임이 호스트 확인 없이 시작 시각을 지났어요.', '/inbox');
    end if;
    n := n + 1;
  end loop;
  return n;
end; $$;

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

create or replace function block_user(p_target uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m matches; me profiles; i_am_a boolean;
        sess sessions; who profiles; my_st text; your_st text;
        left_cnt int := 0; killed_cnt int := 0; affected uuid[] := '{}';
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  if p_target = auth.uid() then return json_build_object('error','self'); end if;
  if not exists (select 1 from profiles where id = p_target) then
    return json_build_object('error','not_found');
  end if;

  insert into blocks (blocker_id, blocked_id) values (auth.uid(), p_target)
  on conflict do nothing;

  for m in
    select * from matches
     where (user_a = auth.uid() and user_b = p_target)
        or (user_b = auth.uid() and user_a = p_target)
  loop
    i_am_a := (m.user_a = auth.uid());
    if (case when i_am_a then m.a_left_at else m.b_left_at end) is not null then
      continue;                                   
    end if;

    if (case when i_am_a then m.b_left_at else m.a_left_at end) is not null then
      delete from matches where id = m.id;        
      continue;
    end if;

    if i_am_a then
      update matches set a_left_at = now() where id = m.id;
    else
      update matches set b_left_at = now() where id = m.id;
    end if;

    select * into me from profiles where id = auth.uid();
    insert into messages (match_id, sender_id, body, kind)
    values (m.id, auth.uid(),
            coalesce(nullif(me.nickname,''), '상대방') || '님이 나갔어요', 'system');
  end loop;

  for sess in
    select s.* from sessions s
     where s.starts_at > now()
       and s.status <> 'cancelled'
       and exists (select 1 from signups g
                    where g.session_id = s.id and g.user_id = auth.uid()
                      and g.status in ('waiting','confirmed'))
       and exists (select 1 from signups g
                    where g.session_id = s.id and g.user_id = p_target
                      and g.status in ('waiting','confirmed'))
  loop
    select status into my_st   from signups
     where session_id = sess.id and user_id = auth.uid();
    select status into your_st from signups
     where session_id = sess.id and user_id = p_target;

    if my_st = 'confirmed' and your_st = 'confirmed' then
      if sess.host_id = auth.uid() then

        affected   := affected || session_collapse(sess.id);
        killed_cnt := killed_cnt + 1;
      else

        update signups set status = 'cancelled'
         where session_id = sess.id and user_id = auth.uid();

        if session_chat_open(sess.id) then
          select * into who from profiles where id = auth.uid();
          insert into messages (session_id, sender_id, body, kind)
          values (sess.id, auth.uid(),
                  coalesce(nullif(who.nickname,''), '참가자') || '님이 나갔어요', 'system');
        end if;

        if (select count(*) from signups
             where session_id = sess.id and status = 'confirmed') < 2 then
          affected := affected || session_collapse(sess.id);
        end if;
        left_cnt := left_cnt + 1;
      end if;

    elsif my_st = 'waiting' and your_st = 'confirmed' then
      update signups set status = 'cut', decided_at = now()
       where session_id = sess.id and user_id = auth.uid();

    elsif your_st = 'waiting' and my_st = 'confirmed' then
      update signups set status = 'cut', decided_at = now()
       where session_id = sess.id and user_id = p_target;

    end if;
  end loop;

  return json_build_object('ok', true,
    'left_sessions', left_cnt,          
    'cancelled_sessions', killed_cnt,   
    'notify', to_json(affected));       
end; $$;

-- 4. 신청함: 사용량·일일 제공량 집계 제거.
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

-- 5. 탈퇴: 가입 보너스 중복 방지용 이메일 해시를 더는 저장하지 않는다.
create or replace function account_delete()
returns json language plpgsql security definer set search_path = public as $$
declare
  me_id    uuid := auth.uid();
  g        record;
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;

  for g in
    select s.session_id
      from signups s join sessions ss on ss.id = s.session_id
     where s.user_id = me_id and s.status = 'confirmed' and ss.starts_at > now()
  loop
    update signups set status = 'cancelled'
     where session_id = g.session_id and user_id = me_id;
    if (select count(*) from signups x
         where x.session_id = g.session_id and x.status = 'confirmed') < 2 then
      perform session_collapse(g.session_id);
    end if;
  end loop;

  for g in
    select id from sessions
     where host_id = me_id and starts_at > now() and status <> 'cancelled'
  loop
    perform session_collapse(g.id);
  end loop;

  update messages set sender_name = coalesce(nullif(
           (select nickname from profiles where id = me_id), ''), '알 수 없음')
   where sender_id = me_id and sender_name is null;

  delete from auth.users where id = me_id;

  return json_build_object('ok', true);
end; $$;

-- 개인 신청의 거절·만료도 반환 도우미에 의존하지 않는다.
create or replace function request_respond(p_request uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare r requests; me profiles; a uuid; b uuid; mid uuid; who text;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.to_id <> auth.uid() then
    return json_build_object('error','not_allowed');
  end if;
  if r.status <> 'pending' then
    return json_build_object('error','already', 'status', r.status);
  end if;

  update requests
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = p_request;

  if not p_accept then

    select * into me from profiles where id = auth.uid();
    who := coalesce(nullif(me.nickname, ''), '상대');

    perform notify_add(r.from_id, '채팅 신청이 거절됐어요',
      who || '님이 거절했어요.', '/inbox');
    
    return json_build_object('ok', true, 'accepted', false,
                             'notify', r.from_id, 'by', who);
  end if;

  a := least(r.from_id, r.to_id);
  b := greatest(r.from_id, r.to_id);

  insert into matches (session_id, user_a, user_b)
  values (null, a, b)
  on conflict do nothing;

  select id into mid from matches
   where session_id is null and user_a = a and user_b = b;

  update matches
     set closed_at = null, a_left_at = null, b_left_at = null
   where id = mid;

  return json_build_object('ok', true, 'accepted', true, 'match_id', mid);
end; $$;

-- 6. 금액·적립·조회·반환과 폐기된 영상 미션 RPC 제거.
-- CASCADE 없이 제거하므로 예상하지 못한 의존성이 있으면 전체 적용이 실패한다.
drop function if exists public.mission_done(uuid, integer, text);
drop function if exists public.my_credits();
drop function if exists public.claim_profile_bonus();
drop function if exists public.early_bird_status();
drop function if exists public.early_bird_slots();
drop function if exists public.request_fee_refund(uuid);
drop function if exists public.session_fee_refund(uuid, uuid);
drop function if exists public.credit_grant(uuid, text, text);
drop function if exists public.credit_balance(uuid);
drop function if exists public.credit_rule(text);
drop function if exists public.request_daily_limit();
drop function if exists public.account_rejoin_block_days();
drop function if exists public.account_email_hash(text);
drop table if exists public.deleted_accounts;

-- API 스키마와 접근 권한에서 과거 원장을 분리한다. 원본 행은 삭제하지 않는다.
create schema if not exists retired;
revoke all on schema retired from public, anon, authenticated, service_role;
do $$ begin
  if to_regclass('public.credit_ledger') is not null then
    alter table public.credit_ledger set schema retired;
  end if;
end $$;
revoke all on table retired.credit_ledger from public, anon, authenticated, service_role;
comment on table retired.credit_ledger is '2026-09-08 무료 전환 이전 내역. 앱에서 조회하거나 추가하지 않는 과거 기록.';

-- 공지의 옛 보너스 약속도 지운다. 오픈 스위치와 날짜는 운영 설정을 유지한다.
update public.app_config
set notice = '모임과 채팅을 무료로 이용할 수 있어요.'
where notice ~ '크레딧|적립|보너스';

-- 인증 범위를 명시한다. 내부 취소·만료 도우미는 기존 권한을 유지한다.
revoke execute on function public.request_send(uuid,text), public.session_join(uuid),
  public.session_cancel(uuid), public.session_approve(uuid,uuid), public.session_reject(uuid,uuid),
  public.block_user(uuid), public.inbox_counts(), public.account_delete() from public, anon;
grant execute on function public.request_send(uuid,text), public.session_join(uuid),
  public.session_cancel(uuid), public.session_approve(uuid,uuid), public.session_reject(uuid,uuid),
  public.block_user(uuid), public.inbox_counts(), public.account_delete() to authenticated;

