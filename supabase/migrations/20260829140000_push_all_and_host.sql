-- ═══════════════════════════════════════════════════════════════
--  알림이 폰까지 가게 · 거절도 알리게 · 호스트도 받게
-- ═══════════════════════════════════════════════════════════════
-- 알림을 넣는 길이 둘인데 도착지가 달랐다.
--
--   앱  → notify_send()  → notifications 한 줄 + Edge Function 으로 푸시
--   서버 → notify_add()   → notifications 한 줄.  끝.
--
-- DB 에서는 밖으로 HTTP 를 못 쏜다. 그래서 크론이 보내는 다섯 가지는
-- 종 아이콘 안에만 쌓이고 폰은 조용했다. 그중 하나가 "오늘 모임이
-- 있어요" 다 — 시작 전에 알려주려고 만든 알림인데, 그걸 보려면 앱을
-- 먼저 열어야 했다. 앱을 여는 사람은 이미 기억하고 있는 사람이다.
--
-- 여기서는 notifications 를 발송 대기열로 만든다. pushed_at 이 비어
-- 있으면 아직 폰에 안 간 것이고, 밖에서 그것만 집어 보내면 된다.
-- 앱이 이미 즉시 쏜 줄은 넣을 때 도장을 찍어 두 번 가지 않게 한다.
--
-- 곁들여 두 가지를 고친다.
--   ② 거절 알림이 알림함에 안 쌓이던 것
--   ③ 호스트가 자기 모임 소식을 못 받던 것

-- ───────────────────────────────────────────────────────────────
--  1. 발송 대기열
-- ───────────────────────────────────────────────────────────────
alter table notifications add column if not exists pushed_at timestamptz;

-- 대기열을 긁는 질의는 "아직 안 보낸 것" 만 본다. 부분 인덱스라
-- 보내고 나면 인덱스에서도 빠져서, 쌓인 알림이 많아도 가볍다.
create index if not exists notifications_unpushed_idx
  on notifications (created_at) where pushed_at is null;

/* 이미 보낸 것으로 친다 — 앱이 부르는 길에서 쓴다.
   앱은 알림함에 남기는 것과 별개로 Edge Function 을 직접 불러 그 자리에서
   푸시한다. 도장을 안 찍으면 대기열이 같은 걸 한 번 더 보낸다. */
create or replace function notify_send(
  p_to uuid[], p_title text, p_body text, p_url text default null)
returns int language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); u uuid; n int := 0;
begin
  if me_id is null then return 0; end if;
  if nullif(trim(coalesce(p_title,'')), '') is null then return 0; end if;

  foreach u in array coalesce(p_to, '{}'::uuid[]) loop
    if can_notify(me_id, u) then
      insert into notifications (user_id, title, body, url, pushed_at)
      values (u, left(p_title, 120), left(coalesce(p_body,''), 300), p_url, now());
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function notify_send(uuid[],text,text,text) from public, anon;
grant  execute on function notify_send(uuid[],text,text,text) to authenticated;

-- notify_add(서버·크론)는 pushed_at 을 비워둔 채로 넣는다. 그게 대기열이다.

/* 대기열을 비우는 쪽에서 쓴다. 오래된 것부터, 한 번에 조금씩.
   service role 로만 부른다 — 남의 알림을 통째로 읽는 창구다. */
create or replace function notifications_pending(p_limit int default 200)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) from (
    select n.id, n.user_id, n.title, n.body, n.url, n.created_at
      from notifications n
     where n.pushed_at is null
       -- 밀린 걸 한꺼번에 쏟아내지 않는다. 하루 지난 소식은 알림이 아니다
       and n.created_at > now() - interval '1 day'
     order by n.created_at
     limit greatest(1, least(p_limit, 500))
  ) t;
$$;

create or replace function notifications_mark_pushed(p_ids uuid[])
returns int language sql security definer set search_path = public as $$
  with u as (
    update notifications set pushed_at = now()
     where id = any(coalesce(p_ids, '{}'::uuid[])) and pushed_at is null
     returning 1)
  select count(*)::int from u;
$$;

revoke execute on function notifications_pending(int)        from public, anon, authenticated;
revoke execute on function notifications_mark_pushed(uuid[]) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 거절도 알린다
-- ───────────────────────────────────────────────────────────────
-- 앱이 rejectSignup 을 부른 뒤 곧바로 알림을 보내고 있었는데, 그 사이에
-- 관계가 끊긴다. can_notify 는 signups.status 가 waiting 이나 confirmed
-- 일 때만 통과시키는데, 거절이 방금 그걸 'cut' 으로 바꿔놨다.
--
--   거절 직전  can_notify = true
--   거절       status → 'cut'
--   알림 발송  can_notify = false   → 알림함에 0줄
--
-- notify_send 는 0을 조용히 반환하고 앱은 실패를 삼킨다. 아무도 모른 채
-- 신청비 10크레딧이 걸린 소식이 사라졌다.
--
-- 관계가 끊기기 전에, 끊는 쪽이 직접 남긴다. notify_add 는 can_notify 를
-- 지나지 않는다 — 여기는 보내는 사람이 없는 자리다.
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

  -- 거절당한 사람 잘못이 아니다 — 신청비를 돌려준다
  perform session_fee_refund(p_session, p_user);

  perform notify_add(p_user, '모임 신청 결과를 알려드려요',
    s.gym || ' 모임은 이번엔 함께하지 못하게 됐어요. 신청비는 돌려드렸어요.',
    '/inbox');

  return json_build_object('ok', true);
end $$;

revoke execute on function session_reject(uuid,uuid) from public, anon;
grant  execute on function session_reject(uuid,uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3-a. 시작 임박 — 호스트도 받는다
-- ───────────────────────────────────────────────────────────────
-- 알림 대상을 signups 에서만 고르고 있었다. 그런데 호스트는 signups 에
-- 없다 — 모임을 여는 건 신청이 아니라 개설이라서다. 그래서 자기가 연
-- 모임인데 자기만 못 받았다. 호스트가 안 나가면 모임은 통째로 깨진다.
create or replace function sessions_remind()
returns int language plpgsql security definer set search_path = public as $$
declare r record; g record; n int := 0;
begin
  for r in
    select s.* from sessions s
     where s.status = 'confirmed'
       and s.reminded_at is null
       and s.starts_at > now()
       and s.starts_at <= now() + interval '3 hours'
  loop
    for g in
      -- 확정된 참가자 + 호스트. 호스트가 탈퇴하면 host_id 가 null 이라
      -- 그 줄은 빠지고, notify_add 도 null 은 그냥 흘려보낸다.
      select user_id from signups
       where session_id = r.id and status = 'confirmed'
      union
      select r.host_id
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

-- ───────────────────────────────────────────────────────────────
--  3-b. 모임이 무너졌을 때 — 호스트도 받는다
-- ───────────────────────────────────────────────────────────────
-- 단, 호스트가 직접 지운 경우는 뺀다. 방금 자기 손으로 지워놓고
-- "취소됐어요" 를 받으면 무슨 일이 또 생긴 줄 안다.
--
-- 크론(정원 미달)이 부를 때는 auth.uid() 가 null 이라 자연히 통과하고,
-- 참가자가 나가서 무너질 때도 auth.uid() 는 그 참가자라 통과한다.
-- session_delete 만 auth.uid() 가 호스트라서 걸러진다.
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

  /* 호스트에게도 알린다 — 자기가 지운 게 아닐 때만.
     환불 대상(affected)에는 넣지 않는다. 호스트는 신청비를 낸 적이 없다. */
  if s.host_id is not null and s.host_id is distinct from auth.uid() then
    perform notify_add(s.host_id, '😢 내 모임이 취소됐어요',
      s.gym || ' 모임이 정원을 채우지 못해 취소됐어요.', '/session/mine');
  end if;

  return affected;
end $$;

revoke execute on function session_collapse(uuid) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
--  4. 대기열을 비우는 크론 — 손으로 한 번 걸어야 한다
-- ───────────────────────────────────────────────────────────────
-- 아래는 이 파일에 넣지 않는다. service role 키가 필요한데 그걸 저장소에
-- 커밋할 수는 없고, pg_net 이 없는 곳(로컬 재생 등)에서는 이 파일이
-- 통째로 실패해버린다. 프로덕션에서 한 번만 직접 돌린다.
--
--   -- ① 키를 금고에 넣는다 (한 번)
--   select vault.create_secret('<service role 키>', 'service_role_key');
--
--   -- ② 1분마다 대기열을 비운다
--   create extension if not exists pg_net with schema extensions;
--
--   select cron.schedule('notifications-push', '* * * * *', $job$
--     select net.http_post(
--       url     := 'https://<프로젝트 ref>.supabase.co/functions/v1/push',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' ||
--           (select decrypted_secret from vault.decrypted_secrets
--             where name = 'service_role_key')),
--       body    := '{"drain":true}'::jsonb);
--   $job$);
--
-- 되돌리려면: select cron.unschedule('notifications-push');
