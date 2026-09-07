-- ═══════════════════════════════════════════════════════════════
--  읽은 것만 읽음으로 친다 — 알림함 · 보낸 신청 배지
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 Run · 몇 번 돌려도 안전
-- ═══════════════════════════════════════════════════════════════
--
-- 두 군데가 "봤다" 를 잘못 세고 있었다.
--
--  1) 알림함 — 화면을 열면 notifications_read() 가 안 읽은 것을 전부
--     읽음으로 밀었다. 종을 눌러 목록만 훑어도 20개가 한꺼번에 읽음이 돼서,
--     정작 안 열어본 알림이 흐려진 채 24시간 뒤 사라졌다.
--     이제 실제로 누른 알림 하나만 읽음이 된다.
--
--  2) 보낸 신청 배지 — signups 중 'waiting' 개수를 셌다. 대기는 내가 할 일이
--     아니라 호스트가 답할 일이라, 호스트가 답하지 않는 내내 1이 박혀 있었다.
--     배지는 "내가 볼 게 생겼다" 는 뜻이어야 한다. 이제 결과가 나온 것
--     (승인·거절·채팅 수락)만 세고, 보낸 신청 탭을 열면 사라진다.

-- ───────────────────────────────────────────────────────────────
--  1. 알림 — 하나씩 읽음 처리
-- ───────────────────────────────────────────────────────────────
-- notifications_read() (전체 읽음) 은 지우지 않는다. "모두 읽음" 을 나중에
-- 달 수도 있고, 남아 있어도 아무도 부르지 않으면 아무 일도 안 한다.

create or replace function notification_read(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update notifications set read_at = now()
   where id = p_id and user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

revoke execute on function notification_read(uuid) from public, anon;
grant  execute on function notification_read(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 보낸 신청 — "언제까지 봤는가" 를 기억한다
-- ───────────────────────────────────────────────────────────────

alter table profiles add column if not exists sent_seen_at timestamptz;

-- 승인에도 결정 시각을 남긴다. 거절(session_reject)·무응답 만료
-- (signups_expire)는 이미 남기고 있었는데 승인만 빠져 있어서, "받아줬다" 를
-- 배지로 셀 방법이 없었다.
-- ⚠️ 20260907140000 의 본문을 그대로 들고 온 뒤 decided_at 만 더했다.

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

  update signups set status = 'confirmed', decided_at = now()
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

/* 보낸 신청 배지 = 아직 안 본 "결과".

   세는 것과 안 세는 것
     세다   승인 · 거절(무응답 만료 포함) · 채팅 신청 수락
     안 센다 대기 중 — 내가 할 일이 없다. 이게 박혀 있던 1이다.
     안 센다 채팅 신청 거절 — 거절과 무응답을 구분해주지 않는 게 이 앱의
             규칙이다(requests_sent 참고). 배지로 알려주면 그 규칙이 깨진다.

   창은 목록과 같아야 한다. 목록에서 이미 내려간 것을 배지가 세면
   눌러도 안 없어지는 1이 다시 생긴다. */
create or replace function sent_changes()
returns int language sql stable security definer set search_path = public as $$
  select (
    (select count(*)
       from signups g
       join sessions s on s.id = g.session_id
      where g.user_id = auth.uid()
        and g.status in ('confirmed','cut')
        and g.decided_at is not null
        and g.decided_at > coalesce(p.sent_seen_at, '-infinity'::timestamptz)
        and s.host_id <> auth.uid()
        -- my_signups 와 같은 창
        and s.starts_at > now() - interval '24 hours'
        and (s.host_id is null or not blocked_with(s.host_id)))
  + (select count(*)
       from requests r
      where r.from_id = auth.uid()
        and r.status = 'accepted'
        and r.responded_at > coalesce(p.sent_seen_at, '-infinity'::timestamptz)
        -- requests_sent 와 같은 창
        and r.created_at > now() - interval '7 days'
        and r.responded_at > now() - interval '24 hours'
        and not blocked_with(r.to_id))
  )::int
  from profiles p where p.id = auth.uid();
$$;

-- 보낸 신청 탭을 열었다 = 여기까지는 봤다
create or replace function sent_mark_seen()
returns void language sql security definer set search_path = public as $$
  update profiles set sent_seen_at = now() where id = auth.uid();
$$;

revoke execute on function sent_changes()   from public, anon;
revoke execute on function sent_mark_seen() from public, anon;
grant  execute on function sent_changes(), sent_mark_seen() to authenticated;
