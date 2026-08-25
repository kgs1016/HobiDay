-- ═══════════════════════════════════════════════════════════════
--  끝난 일은 보낸 신청에서 3시간 뒤에 내린다
-- ═══════════════════════════════════════════════════════════════
-- 보낸 신청함이 7일치 기록 보관함이 되어 있다. 끝난 일과 아직 진행
-- 중인 일이 섞여서, 정작 "지금 뭘 기다리고 있는지" 가 안 보인다.
--
--   모임 신청  끝난 지 3시간 뒤 내린다
--              (참여했든 · 거절당했든 · 대기 중 모임이 끝났든 · 취소됐든)
--   관심       수락되면 3시간 뒤 내린다 — 할 일이 채팅으로 넘어갔다
--              거절·무응답은 남긴다
--
-- 그래서 결국 남는 건 아직 답을 기다리는 것들이다.
--
-- "끝난 시점" 이 상태마다 달라서 시각을 두 개 새로 적는다.
--   signups.decided_at    거절·무응답 만료가 일어난 때
--   sessions.cancelled_at 호스트가 모임을 지운 때
-- 둘 다 없으면 모임 종료 시각(ends_at)을 쓴다.
--
-- 이미 있는 행은 이 값이 비어 있다. coalesce 가 ends_at 으로 떨어지니
-- 지난 모임은 그대로 사라지고, 앞으로 생기는 것부터 정확해진다.
--
-- 반환 규칙은 안 건드린다 — 거절·무응답·모임 취소는 이미 반환하고,
-- 승인받아 참여한 신청은 반환하지 않는다(자리를 실제로 썼다).
--
-- ⚠️ 아래 다섯 함수는 이전 본문을 그대로 들고 온 뒤 필요한 곳만 고쳤다.
--    create or replace 는 통째로 갈아치운다.

alter table signups  add column if not exists decided_at   timestamptz;
alter table sessions add column if not exists cancelled_at timestamptz;

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

  return json_build_object('ok', true);
end $$;

create or replace function signups_expire()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select g.session_id, g.user_id
      from signups g
      join sessions s on s.id = g.session_id
     where g.status = 'waiting'
       and (s.starts_at <= now() or s.status = 'cancelled')
  loop
    perform session_fee_refund(r.session_id, r.user_id);
    update signups set status = 'cut', decided_at = now()
     where session_id = r.session_id and user_id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end; $$;

create or replace function session_delete(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; g record; affected uuid[] := '{}';
begin
  select * into s from sessions where id = p_session for update;
  if not found then return json_build_object('error','not_found'); end if;
  if s.host_id is distinct from auth.uid() then
    return json_build_object('error','not_host');
  end if;
  if s.status = 'cancelled' then return json_build_object('ok', true, 'notify', affected); end if;

  for g in
    select user_id from signups
     where session_id = p_session
       and status in ('waiting','confirmed')
       and user_id <> s.host_id
  loop
    perform session_fee_refund(p_session, g.user_id);
    affected := affected || g.user_id;
  end loop;

  update sessions set status = 'cancelled', cancelled_at = now()
   where id = p_session;

  -- 알림은 클라이언트가 이 목록으로 push 함수를 부른다
  return json_build_object('ok', true, 'notify', affected);
end; $$;

create or replace function my_signups()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.status as session_status,
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
       -- 끝난 일은 3시간만 보여준다. "끝난 시점" 이 상태마다 다르다:
       --   거절·무응답 만료  decided_at   (모임 날짜와 무관하게 그때 끝났다)
       --   호스트가 취소     cancelled_at (모임 전에 끝났다)
       --   그 외            ends_at      (참여했거나 대기 중이었거나)
       and coalesce(
             case when g.status = 'cut' then g.decided_at end,
             case when s.status = 'cancelled' then s.cancelled_at end,
             s.ends_at
           ) > now() - interval '3 hours'
       and (s.host_id is null or not blocked_with(s.host_id))
  ) t;
$$;

create or replace function requests_sent()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select r.id, r.created_at,
           case when r.status = 'accepted' then 'accepted' else 'pending' end as status,
           p.id as to_id, p.nickname, p.age, p.level, p.home_gym
      from requests r join profiles p on p.id = r.to_id
     where r.from_id = auth.uid()
       and r.created_at > now() - interval '7 days'
       -- 수락되면 채팅방이 생긴다 — 할 일이 채팅으로 넘어갔으니 3시간만
       -- 더 보여주고 내린다. 거절·무응답은 그대로 남는다 (거절은
       -- '기다리는 중' 으로 보인다 — 짝사랑을 드러내지 않기로 했다).
       and (r.status <> 'accepted'
         or coalesce(r.responded_at, r.created_at) > now() - interval '3 hours')
       and not blocked_with(p.id)
  ) t;
$$;

revoke execute on function session_reject(uuid,uuid) from public, anon;
revoke execute on function session_delete(uuid)      from public, anon;
revoke execute on function signups_expire()          from public, anon, authenticated;
revoke execute on function my_signups()              from public, anon;
revoke execute on function requests_sent()           from public, anon;
grant execute on function
  session_reject(uuid,uuid), session_delete(uuid), my_signups(), requests_sent()
to authenticated;
