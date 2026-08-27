-- ═══════════════════════════════════════════════════════════════
--  알림함에 크론과 뒷정리를 태운다
-- ═══════════════════════════════════════════════════════════════
-- 알림함을 만든 진짜 이득은 크론이 알릴 수 있게 된 것이다. 지금까지
-- 크론 작업은 조용히 처리되고 끝이었다 — DB 에서는 푸시를 못 쏜다
-- (pg_net 이 없다). 알림함은 DB 에 쌓기만 하면 되니 크론도 쓸 수 있다.
--
-- 넷을 태운다.
--   ① 무응답 만료 · 자동 환불   돈이 오갔는데 아무 말이 없던 유일한 자리
--   ② 모임 시작 임박           당일 알림. 노쇼를 줄이는 가장 싼 방법
--   ③ 확정된 모임에서 한 자리 빔  취소로 이어질 수 있는 일이다
--   ④ 크레딧 적립              화면 알림창은 한 번 뜨고 사라진다
--
-- 곁들여 모임이 무너졌다는 알림을 session_collapse 한 군데로 모은다.
-- 무너지는 길이 다섯인데 그중 둘(정원 미달, 탈퇴)은 앱이 알릴 자리가
-- 없었다. 한 군데서 남기면 어느 길로 오든 빠짐없이 알린다.
--
-- 그리고 사람이 빠져 자리가 비면 sessions.status 를 open 으로 되돌린다.
-- 예전엔 confirmed 로 남아서, 목록에는 빈자리가 보이는데 상세 화면은
-- "✓ 모임이 확정됐어요" 라고 했다.


/* 알림 한 줄 남기기 — 안에서만 쓴다.
   notify_send 는 앱이 부르는 것이라 can_notify 로 문을 지키지만, 이쪽은
   크론과 서버 로직이 부르는 자리라 보내는 사람이 없다. 바깥에 열어두면
   아무나 아무에게 꽂을 수 있으므로 실행 권한을 전부 거둔다. */
create or replace function notify_add(
  p_user uuid, p_title text, p_body text, p_url text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, title, body, url)
  select p_user, left(p_title,120), left(coalesce(p_body,''),300), p_url
   where p_user is not null and exists (select 1 from profiles where id = p_user);
$$;

revoke execute on function notify_add(uuid,text,text,text) from public, anon, authenticated;


-- 시작 임박 알림을 한 번만 보내려고 표시해둔다
alter table sessions add column if not exists reminded_at timestamptz;

/* 오늘 갈 모임을 알린다. 한 시간마다 돌면서 세 시간 안에 시작하는
   모임을 집는다. 사람은 보통 그날 아침이나 몇 시간 전에 일정을
   확인하니, 그 창에 한 번 알려주면 족하다. */
create or replace function sessions_remind()
returns int language plpgsql security definer set search_path = public as $$
declare r record; g record; n int := 0;
begin
  for r in
    select s.* from sessions s
     where s.status <> 'cancelled'
       and s.reminded_at is null
       and s.starts_at > now()
       and s.starts_at <= now() + interval '3 hours'
  loop
    for g in
      select user_id from signups
       where session_id = r.id and status = 'confirmed'
    loop
      perform notify_add(g.user_id, '오늘 모임이 있어요',
        r.gym || ' · ' || to_char(r.starts_at at time zone 'Asia/Seoul', 'HH24:MI') ||
        ' 에 만나요.', '/session?id=' || r.id::text);
      n := n + 1;
    end loop;
    update sessions set reminded_at = now() where id = r.id;
  end loop;
  return n;
end $$;

revoke execute on function sessions_remind() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('sessions-remind', '7 * * * *',
                     'select public.sessions_remind()');


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

    /* 알림함에는 여기서 남긴다. 모임이 무너지는 길은 다섯인데 그중
       둘(정원 미달, 탈퇴)은 크론과 뒷정리라 앱이 알릴 자리가 없다.
       한 군데서 남기면 어느 길로 오든 빠짐없이 알린다.
       푸시는 앱이 따로 쏜다 — DB 에서는 못 쏜다(pg_net 이 없다). */
    perform notify_add(g.user_id, '😢 모임이 취소됐어요',
      s.gym || ' 모임이 취소됐어요. 신청 크레딧은 돌려드렸어요.', '/inbox');
  end loop;

  return affected;
end $$;

revoke execute on function session_collapse(uuid) from public, anon, authenticated;


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
  if (select count(*) from signups
       where session_id = p_session and gender = 'm' and status = 'confirmed') < s.capacity
     or (select count(*) from signups
          where session_id = p_session and gender = 'f' and status = 'confirmed') < s.capacity then
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

revoke execute on function session_cancel(uuid) from public, anon;
grant  execute on function session_cancel(uuid) to authenticated;


create or replace function signups_expire()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select s.id from sessions s
     where s.starts_at <= now()
       -- 끝난 모임은 다시 판단하지 않는다. 이 조건이 없으면 탈퇴 한 번에
       -- 이미 만난 모임이 뒤늦게 취소로 뒤집힌다 (아래 설명).
       and s.ends_at > now()
       and s.status <> 'cancelled'
       and ((select count(*) from signups g
              where g.session_id = s.id and g.gender = 'm'
                and g.status = 'confirmed') < s.capacity
         or (select count(*) from signups g
              where g.session_id = s.id and g.gender = 'f'
                and g.status = 'confirmed') < s.capacity)
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

revoke execute on function signups_expire() from public, anon, authenticated;


create or replace function session_video_add(p_session uuid, p_video text)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); earned int;
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  if nullif(trim(coalesce(p_video,'')), '') is null then
    return json_build_object('error','no_video');
  end if;

  if not exists (
    select 1 from signups
     where session_id = p_session and user_id = me_id and status = 'confirmed'
  ) then
    return json_build_object('error','not_confirmed');
  end if;

  /* 등반 인증은 실제로 등반했을 때 하는 것이다. 내 자리가 잡혔는지만
     보고 모임이 어떤 상태인지는 안 봤다. 그래서 —
       · 취소된 모임에서도 인증하고 크레딧을 받을 수 있었다
       · 다음 달 모임을 만들어 확정만 시켜놓고 오늘 바로 인증할 수 있었다
     시작한 모임, 취소되지 않은 모임에서만 받는다. */
  if not exists (
    select 1 from sessions
     where id = p_session and status <> 'cancelled' and starts_at <= now()
  ) then
    return json_build_object('error','not_started');
  end if;

  insert into session_videos (session_id, user_id, video_url)
  values (p_session, me_id, trim(p_video));

  earned := credit_grant(me_id, 'session_video', p_session::text);

  -- 화면 알림창은 한 번 뜨고 사라진다. 적립은 기록으로 남을 만하다.
  if earned > 0 then
    perform notify_add(me_id, '🧗 크레딧이 쌓였어요',
      '등반 인증으로 ' || earned || '크레딧을 받았어요.', '/me');
  end if;

  return json_build_object('ok', true, 'earned', earned,
                           'balance', credit_balance(me_id));
end; $$;

revoke execute on function session_video_add(uuid,text) from public, anon;
grant  execute on function session_video_add(uuid,text) to authenticated;
