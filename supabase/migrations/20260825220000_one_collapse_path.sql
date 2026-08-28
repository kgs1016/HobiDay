-- ═══════════════════════════════════════════════════════════════
--  모임이 무너지는 모든 길을 하나로 모은다
-- ═══════════════════════════════════════════════════════════════
-- 모임이 안 열리게 되는 경로가 다섯인데 처리가 제각각이었다.
--
--   호스트가 지움          취소 + 전원 환불          (되어 있었음)
--   확정이 1명이 됨        취소 + 환불               (되어 있었음)
--   정원 미달로 그날이 옴   아무것도 안 함  ← 확정자 10크레딧이 증발
--   성비 깨진 채 그날이 옴  아무것도 안 함
--   호스트 탈퇴            status 만 바꿈  ← 환불 없음
--   참가자 탈퇴            대기자 자동 승격 ← 승인제와 충돌
--
-- session_collapse() 하나로 모은다. 취소 표시 · 남은 사람 전원 환불 ·
-- 알릴 사람 목록 반환을 한 곳에서 한다. 넷이 이걸 부른다.
--
-- 시작 시각 판정은 성비로 한다. capacity 는 성별당 인원이고, 조기
-- 확정이 성사되면 합의한 수로 낮춰 적힌다(session_accept_confirm).
-- 그래서 "남 확정 < capacity 또는 여 확정 < capacity" 한 줄이
-- 정원 미달 · 성비 깨짐 · 탈퇴로 빈 자리를 전부 덮는다.
--
-- 탈퇴 시 대기자 자동 승격은 걷어낸다. 호스트가 안 고른 사람이
-- 자동으로 확정되는 건 승인제의 전제를 깬다.
--
-- 채팅방 조건도 바꾼다. "지금 확정 2명 이상" 을 보면 호스트 혼자
-- 남았을 때 방이 즉시 사라져서 "매칭이 취소됐어요" 를 볼 사람이
-- 없어진다. 확정이 2명 미만이 되는 길은 이제 전부 취소를 거치므로,
-- 인원을 다시 셀 필요 없이 "열린 적 있는가 + 24시간 이내" 면 된다.
--
-- ⚠️ 아래 함수들은 이전 본문을 그대로 들고 온 뒤 필요한 곳만 고쳤다.
--    create or replace 는 통째로 갈아치운다.

alter table sessions add column if not exists chat_opened_at timestamptz;

-- 이미 열려 있던 방들. 새 컬럼이 비어 있으면 전부 닫힌 것으로 보인다.
update sessions s
   set chat_opened_at = coalesce(s.created_at, now())
 where s.chat_opened_at is null
   and (select count(*) from signups g
         where g.session_id = s.id and g.status = 'confirmed') >= 2;

/* 모임이 무너졌을 때 하는 일을 한 군데로 모은다.
   부르는 데가 넷이다 — 참가자 이탈 · 시작 시각의 성비 미달 · 탈퇴 ·
   호스트 삭제. 곳곳에서 따로 쓰면 한 군데는 반드시 환불을 빠뜨린다.

   남은 사람은 자기 의지로 나간 게 아니다. 대기든 확정이든 돌려준다.
   (호스트는 신청비를 낸 적이 없어서 대상이 아니다)
   session_fee_refund 가 중복 반환을 막으므로 몇 번 불려도 안전하다.

   반환값 = 알려야 할 사람 목록. 클라이언트가 push 를 부탁한다. */
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
  end loop;

  return affected;
end $$;

revoke execute on function session_collapse(uuid) from public, anon, authenticated;

create or replace function session_cancel(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); my signups;
        left_cnt int; affected uuid[] := '{}';
begin
  select * into my from signups
   where session_id = p_session and user_id = me_id for update;
  if not found or my.status = 'cancelled' then
    return json_build_object('error','not_joined');
  end if;

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  -- 대기 중 취소는 반환. 확정 후 취소는 반환 없음 —
  -- 수락된 자리를 비우는 건 남은 사람들에게 비용이다.
  if my.status = 'waiting' then
    perform session_fee_refund(p_session, me_id);
  end if;

  /* 확정이 1명까지 떨어지면 모임이 무너진 것이다. 호스트 혼자 남은 방은
     이야기할 상대가 없다 — 모임을 취소로 넘긴다. */
  select count(*) into left_cnt from signups
   where session_id = p_session and status = 'confirmed';

  if left_cnt < 2 then
    affected := session_collapse(p_session);
    return json_build_object('ok', true, 'cancelled', true, 'notify', affected);
  end if;

  return json_build_object('ok', true);
end; $$;

/* 모임 시작 시각이 지났는데 성비가 안 맞으면 그 모임은 안 열린 것이다.
   capacity 는 성별당 인원이고, 조기 확정이 성사되면 그때 합의한 수로
   낮춰 적힌다(session_accept_confirm). 그래서 이 한 줄이 세 경우를
   전부 덮는다 —
     정원을 못 채운 채 그날이 옴
     정원은 찼었는데 누가 빠져서 성비가 깨진 채 그날이 옴
     탈퇴로 자리가 빈 채 그날이 옴

   승인 안 된 대기 신청도 같이 정리한다. 취소된 모임에 남아 있는
   대기 신청도 함께 훑는다. */
create or replace function signups_expire()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select s.id from sessions s
     where s.starts_at <= now()
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

revoke execute on function signups_expire() from public, anon, authenticated;

/* 호스트가 지운다. 하는 일은 무너진 모임과 똑같다. */
create or replace function session_delete(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions;
begin
  select * into s from sessions where id = p_session for update;
  if not found then return json_build_object('error','not_found'); end if;
  if s.host_id is distinct from auth.uid() then
    return json_build_object('error','not_host');
  end if;

  return json_build_object('ok', true, 'notify', session_collapse(p_session));
end; $$;

revoke execute on function session_delete(uuid) from public, anon;
grant execute on function session_delete(uuid) to authenticated;

create or replace function account_delete()
returns json language plpgsql security definer set search_path = public as $$
declare
  me_id    uuid := auth.uid();
  my_email text;
  g        record;
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;

  /* 내가 참가자로 들어가 있던 다가올 모임.
     예전엔 같은 성별 대기 1순위를 자동 승격시켰는데, 승인제가 생긴
     뒤로는 호스트가 안 고른 사람이 자동으로 확정되는 셈이라 걷어냈다.
     자리를 비우고, 그 때문에 확정이 2명 미만이 되면 모임을 취소한다.
     성비가 깨진 것만으로는 취소하지 않는다 — 모임 시작 시각에
     signups_expire 가 판단한다 (호스트가 아직 채울 수도 있다). */
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

  -- 내가 연 다가올 모임은 호스트가 지운 것과 똑같이 처리한다.
  -- 예전엔 status 만 바꿔서 신청비를 아무도 안 돌려줬다.
  for g in
    select id from sessions
     where host_id = me_id and starts_at > now() and status <> 'cancelled'
  loop
    perform session_collapse(g.id);
  end loop;

  select email into my_email from auth.users where id = me_id;
  if my_email is not null and my_email <> '' then
    insert into deleted_accounts (email_hash) values (account_email_hash(my_email))
    on conflict (email_hash) do update set deleted_at = now();
  end if;

  -- 보관 기간이 지난 흔적은 여기서 같이 정리한다 (별도 배치 불필요)
  delete from deleted_accounts
   where deleted_at < now() - (account_rejoin_block_days() || ' days')::interval;

  -- 나머지는 전부 cascade 로 딸려 나간다
  delete from auth.users where id = me_id;

  return json_build_object('ok', true);
end; $$;
revoke execute on function account_delete() from public, anon;
grant execute on function account_delete() to authenticated;

create or replace function session_approve(p_session uuid, p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; g signups; confirmed_cnt int; total_cnt int;
        opened boolean; filled boolean;
begin
  select * into s from sessions where id = p_session for update;
  if not found then return json_build_object('error','not_found'); end if;
  if s.host_id <> auth.uid() then return json_build_object('error','not_host'); end if;
  if blocked_with(p_user) then return json_build_object('error','blocked'); end if;

  select * into g from signups
   where session_id = p_session and user_id = p_user;
  if not found or g.status <> 'waiting' then
    return json_build_object('error','not_waiting');
  end if;

  select count(*) into confirmed_cnt from signups
   where session_id = p_session and gender = g.gender and status = 'confirmed';
  if confirmed_cnt >= s.capacity then
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
grant execute on function session_approve(uuid,uuid) to authenticated;

/* 방이 열려 있는가.
   조건이 둘로 줄었다.
     1. 한 번이라도 열린 적 있다   (chat_opened_at)
     2. 아직 24시간이 안 지났다    (취소면 취소 시각, 아니면 종료 시각)

   예전엔 "지금 확정이 2명 이상" 을 봤는데, 확정이 2명 미만이 되는 길은
   이제 전부 session_collapse 를 거쳐 모임을 취소로 만든다. 그러니 인원을
   다시 셀 필요가 없고, 오히려 세면 호스트 혼자 남았을 때 방이 즉시
   사라져서 "매칭이 취소됐어요" 를 볼 사람이 없어진다. */
create or replace function session_chat_open(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sessions s
     where s.id = p_session
       and s.chat_opened_at is not null
       and case when s.status = 'cancelled'
                then coalesce(s.cancelled_at, s.ends_at)
                else s.ends_at
           end > now() - interval '24 hours')
$$;

revoke execute on function session_chat_open(uuid) from public, anon, authenticated;
