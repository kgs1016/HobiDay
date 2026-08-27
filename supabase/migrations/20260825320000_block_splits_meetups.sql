-- ═══════════════════════════════════════════════════════════════
--  차단하면 같은 모임에서도 갈라놓는다
-- ═══════════════════════════════════════════════════════════════
-- 차단은 "안 마주치게 해달라" 는 뜻이다. 그런데 지금은 화면에서만
-- 안 보이게 하고 자리는 그대로 뒀다. 약속한 날 현장에서 그대로 만난다.
--
-- 얽힌 모습에 따라 셋으로 갈린다.
--
-- ① 한쪽이 아직 대기 중이면 그 신청을 조용히 거둔다. 신청비는 돌려준다.
--    호스트에게는 아무 말도 안 한다 — 호스트는 제3자고, 누가 누구를
--    차단했는지 알 이유가 없다. 받은 신청 목록에서 한 줄이 사라질 뿐이다.
--
-- ② 둘 다 확정이고 내가 참가자면, 내가 그 모임에서 빠진다. 신청비는
--    그 자리에서 돌려주지 않고 신고 내용을 확인한 뒤 처리한다.
--
-- ③ 둘 다 확정이고 내가 호스트면, 모임을 통째로 취소한다.
--    참가자를 콕 집어 내보내면 그 사람은 자기가 신고당한 걸 안다.
--    호스트가 모임을 없앤 것으로 보이는 편이 낫다 — 남은 사람들에게는
--    여느 취소와 똑같이 "매칭이 취소되었어요" 가 뜨고 전원 환불된다.
--
-- 손대는 범위는 아직 시작 안 한 모임뿐이다. 이미 시작했거나 끝난
-- 모임은 그 모임이 성사된 것이고, 취소된 모임은 이미 끝난 얘기다.
-- 사람만 차단하고 자리는 건드리지 않는다.
--
-- 그리고 신고가 차단과 같은 길을 타게 한다. report_user 가 blocks 에
-- 한 줄만 넣어서, 신고로 들어온 차단은 모임 자리를 그대로 뒀다.
--
-- 모임방을 감추는 조건도 1:1 과 같이 한 방향으로 바꾼다. 차단당한
-- 쪽이 거기 있던 제3자와의 대화까지 잃을 이유는 없다.

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

  /* 상대에게는 내가 그냥 나간 것으로 보인다. 차단당했다는 걸 알리지
     않으면서도 방이 소리 없이 증발하지 않게 하려면, 나가기와 똑같은
     자국을 남기는 게 맞다 — 시스템 한 줄과 닫힌 입력창.
     실제로는 차단이라 앞으로 서로 안 보이고 말도 못 건다. */
  for m in
    select * from matches
     where (user_a = auth.uid() and user_b = p_target)
        or (user_b = auth.uid() and user_a = p_target)
  loop
    i_am_a := (m.user_a = auth.uid());
    if (case when i_am_a then m.a_left_at else m.b_left_at end) is not null then
      continue;                                   -- 이미 나간 방
    end if;

    if (case when i_am_a then m.b_left_at else m.a_left_at end) is not null then
      delete from matches where id = m.id;        -- 상대도 나갔다 — 지운다
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

  /* 같은 모임에 얽혀 있으면 갈라놓는다. 아직 시작 안 한 모임만 —
     이미 시작했거나 끝난 모임은 그 모임이 성사된 것이고, 취소된
     모임은 이미 끝난 얘기다. 자리를 빼봐야 기록만 지워진다. */
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
        /* ③ 내 모임 — 통째로 취소한다. 참가자를 콕 집어 내보내면
           그 사람은 자기가 신고당한 걸 안다. 호스트가 모임을 없앤
           것으로 보이는 편이 낫다. */
        affected   := affected || session_collapse(sess.id);
        killed_cnt := killed_cnt + 1;
      else
        /* ② 내가 빠진다. 자의로 나가는 것이라 신청비는 그 자리에서
           돌려주지 않는다 — 신고 내용을 확인한 뒤 처리한다. */
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

    /* ① 아직 대기 중인 신청은 조용히 거둔다. 자리를 잡은 적이 없으니
       신청비는 돌려준다. 호스트는 받은 신청 목록에서 한 줄이 사라지는
       것만 본다 — 누가 누구를 차단했는지 알 이유가 없다. */
    elsif my_st = 'waiting' then
      update signups set status = 'cut', decided_at = now()
       where session_id = sess.id and user_id = auth.uid();
      perform session_fee_refund(sess.id, auth.uid());

    elsif your_st = 'waiting' then
      update signups set status = 'cut', decided_at = now()
       where session_id = sess.id and user_id = p_target;
      perform session_fee_refund(sess.id, p_target);
    end if;
  end loop;

  return json_build_object('ok', true,
    'left_sessions', left_cnt,          -- 내가 빠진 모임
    'cancelled_sessions', killed_cnt,   -- 내가 열었다가 취소한 모임
    'notify', to_json(affected));       -- 그 취소를 알려야 할 사람들
end; $$;

revoke execute on function block_user(uuid) from public, anon;
grant  execute on function block_user(uuid) to authenticated;


create or replace function report_user(
  p_target  uuid,
  p_reason  text,
  p_detail  text default null,
  p_context text default 'profile',
  p_ref     uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid();
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  if p_target = me_id then return json_build_object('error','self'); end if;
  if not exists (select 1 from profiles where id = p_target) then
    return json_build_object('error','not_found');
  end if;

  insert into reports (reporter_id, target_id, reason, detail, context, ref_id)
  values (me_id, p_target, p_reason, nullif(trim(p_detail), ''),
          coalesce(p_context, 'profile'), p_ref)
  on conflict do nothing;   -- 이미 처리 대기 중인 신고가 있으면 그대로 둔다

  /* 차단 행을 직접 넣지 않는다. block_user 가 방을 정리하고 모임에서
     갈라놓는 일까지 맡으므로, 신고와 차단이 같은 길을 타야 한다.
     예전엔 여기서 blocks 에 한 줄만 넣어서, 신고로 들어온 차단은
     모임 자리를 그대로 뒀다. */
  return block_user(p_target);
end; $$;

revoke execute on function report_user(uuid,text,text,text,uuid) from public, anon;
grant  execute on function report_user(uuid,text,text,text,uuid) to authenticated;


create or replace function session_approve(p_session uuid, p_user uuid)
returns json language plpgsql security definer set search_path = public as $$
declare s sessions; g signups; confirmed_cnt int; total_cnt int;
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
grant  execute on function session_approve(uuid,uuid) to authenticated;


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

revoke execute on function my_session_chats() from public, anon;
grant  execute on function my_session_chats() to authenticated;


create or replace function session_chat_member(p_session uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from signups g
     where g.session_id = p_session
       and g.user_id = auth.uid()
       and g.status = 'confirmed')
   and session_chat_open(p_session)
   and not exists (
    select 1 from signups b
     where b.session_id = p_session and b.status = 'confirmed'
       and blocked_by_me(b.user_id))
$$;

revoke execute on function session_chat_member(uuid) from public, anon, authenticated;
