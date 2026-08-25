-- ═══════════════════════════════════════════════════════════════
--  신청비 반환은 "모임이 성사됐는가" 로 판단한다
-- ═══════════════════════════════════════════════════════════════
-- 두 가지 '확정' 이 섞여 있었다.
--   signups.status  = 'confirmed'   호스트가 나를 받아줬다
--   sessions.status = 'confirmed'   정원이 차서 모임이 성사됐다
--
-- 반환 규칙이 앞엣것을 보고 있었다. 그래서 2:2 모임에 호스트와 나
-- 둘뿐인 상태(채팅방은 열리지만 모임은 아직 open)에서 내가 빠지면
-- "확정된 자리를 비우는 것" 으로 보고 10크레딧을 안 돌려줬다.
-- 아직 열릴지 안 열릴지도 모르는 모임인데 돈만 묶인 셈이다.
--
-- 신청비를 안 돌려주는 건 성사된 모임의 자리를 비워서 남은 사람들에게
-- 피해를 줄 때뿐이다. 성사 전이면 잃을 자리가 없다.
--
-- ⚠️ 20260825230000 의 본문을 그대로 들고 온 뒤 그 조건만 바꿨다.

create or replace function session_cancel(p_session uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); my signups; me profiles; s sessions;
        left_cnt int; affected uuid[] := '{}';
begin
  select * into my from signups
   where session_id = p_session and user_id = me_id for update;
  if not found or my.status = 'cancelled' then
    return json_build_object('error','not_joined');
  end if;

  update signups set status = 'cancelled'
   where session_id = p_session and user_id = me_id;

  /* 신청비를 안 돌려주는 건 "성사된 모임의 자리를 비워서 남은 사람들에게
     피해를 줄 때" 뿐이다. 아직 성사되지 않은 모임이면 잃을 자리가 없다.

     여기서 헷갈리기 쉬운 두 가지 —
       signups.status  = 'confirmed'  호스트가 나를 받아줬다
       sessions.status = 'confirmed'  정원이 차서 모임이 성사됐다
     전에는 앞엣것을 봤다. 2:2 모임에 2명(호스트+나)만 있어도 승인만
     받으면 반환이 막혔는데, 그 모임은 아직 열릴지도 모르는 상태다. */
  select * into s from sessions where id = p_session;
  if my.status = 'waiting' or s.status <> 'confirmed' then
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

  return json_build_object('ok', true);
end; $$;

create or replace function session_chat_messages(p_session uuid)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not session_chat_member(p_session) then
    return json_build_object('error','not_allowed');
  end if;

  return (
    select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) from (
      select x.id, x.sender_id, x.body, x.created_at, x.kind,
             (x.sender_id = auth.uid()) as mine,
             p.nickname as sender_name,
             p.photo    as sender_photo,
             (x.sender_id = s.host_id) as sender_is_host
        from messages x
        join sessions s on s.id = x.session_id
        left join profiles p on p.id = x.sender_id
       where x.session_id = p_session
    ) t
  );
end $$;

revoke execute on function session_cancel(uuid) from public, anon;
grant execute on function session_cancel(uuid) to authenticated;
