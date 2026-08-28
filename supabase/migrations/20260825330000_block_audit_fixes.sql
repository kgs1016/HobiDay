-- ═══════════════════════════════════════════════════════════════
--  차단 검증에서 나온 두 가지
-- ═══════════════════════════════════════════════════════════════
-- ① 둘 다 아직 대기 중인 모임에서 차단하면 차단한 사람의 신청이
--    잘렸다. 상대는 그대로 대기 중이고 나만 자리를 잃는다.
--
--      나 → cut          차단상대 → waiting
--
--    아직 아무도 자리를 안 잡았으니 마주칠 일도 없다. 호스트가 한쪽을
--    받는 순간 session_approve 가 나머지를 거둔다. 그때 정하면 된다.
--    대기 신청을 거두는 건 반대쪽이 이미 확정일 때만이다.
--
-- ② 방 목록은 한 방향(내가 차단한 방만 숨김)으로 바꿨는데 안읽음
--    배지가 아직 양방향이었다. 차단당한 사람은 방은 보이는데 배지가
--    안 뜬다 — 새 메시지가 와도 모른다.
--
--      방은_보이나: 제3자    안읽음_배지: 0
--
--    같은 눈으로 보게 맞춘다. 곁들여 내가 나간 1:1 방이 배지에는
--    남아 있던 것도 고친다(목록에는 이미 없었다). 그리고 탈퇴한 사람의
--    메시지는 sender_id 가 null 이라 <> 비교에서 빠지므로
--    is distinct from 으로 바꿔 세게 한다.

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

    /* ① 한쪽이 자리를 잡았고 다른 쪽이 아직 대기 중이면, 그 대기
       신청을 조용히 거둔다. 자리를 잡은 적이 없으니 신청비는 돌려준다.
       호스트는 받은 신청 목록에서 한 줄이 사라지는 것만 본다 — 누가
       누구를 차단했는지 알 이유가 없다.

       둘 다 대기 중이면 아무것도 안 한다. 아직 아무도 자리를 안 잡아서
       마주칠 일이 없고, 호스트가 한쪽을 받는 순간 session_approve 가
       나머지를 거둔다. 여기서 미리 자르면 차단한 사람이 자기 자리를
       잃는다 — 남의 행동 때문에 내 신청이 없어질 이유가 없다. */
    elsif my_st = 'waiting' and your_st = 'confirmed' then
      update signups set status = 'cut', decided_at = now()
       where session_id = sess.id and user_id = auth.uid();
      perform session_fee_refund(sess.id, auth.uid());

    elsif your_st = 'waiting' and my_st = 'confirmed' then
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


create or replace function inbox_counts()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'requests', (select count(*) from requests r
                  where r.to_id = auth.uid() and r.status = 'pending'
                    and r.created_at > now() - interval '7 days'
                    and not blocked_with(r.from_id))
              + (select count(*) from json_array_elements(my_hosted_requests()))
              + (select count(*) from json_array_elements(my_confirm_proposals())),
    'likes', (select count(*) from requests r
               where r.to_id = auth.uid() and r.status = 'pending'
                 and r.created_at > now() - interval '7 days'
                 and not blocked_with(r.from_id)),
    'hosted', (select count(*) from json_array_elements(my_hosted_requests())),
    'proposals', (select count(*) from json_array_elements(my_confirm_proposals())),
    'sent_today', (select count(*) from requests
                    where from_id = auth.uid() and created_at > now() - interval '1 day'),
    'daily_limit', request_daily_limit(),
    'unread_messages',
      (select count(*)
         from messages x
         join matches m on m.id = x.match_id
        where auth.uid() in (m.user_a, m.user_b)
          and m.closed_at is null
          -- 내가 나간 방은 내 목록에 없다. 배지에도 없어야 한다.
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
