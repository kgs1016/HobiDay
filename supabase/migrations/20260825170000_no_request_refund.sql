-- ═══════════════════════════════════════════════════════════════
--  관심은 반환하지 않는다
-- ═══════════════════════════════════════════════════════════════
-- 지금은 거절당하거나 7일간 답이 없으면 10크레딧을 돌려준다.
-- 그런데 관심은 "보냈다" 는 행위 자체가 값이다 — 상대 화면에 내 프로필과
-- 메시지가 올라가고, 상대는 그걸 보고 정한다. 결과가 어떻든 그 자리는
-- 이미 썼다. 돌려주면 사실상 공짜가 되어 아무에게나 뿌리게 된다.
--
-- 모임 신청(session_join)은 그대로 반환한다. 그쪽은 호스트가 승인해야
-- 자리가 생기는 구조라, 승인을 못 받으면 아무것도 못 받은 게 맞다.
--
-- request_fee_refund() 는 지우지 않고 남긴다 — 이미 반환된 원장 기록이
-- 있고, 나중에 운영상 되돌릴 일이 생길 수 있다. 부르는 데가 없어질 뿐이다.
--
-- ⚠️ 두 함수 모두 이전 본문(20260821130000 · 20260821110000)을 그대로
--    들고 온 뒤 반환 호출만 뺐다. create or replace 는 통째로 갈아치운다.

create or replace function request_respond(p_request uuid, p_accept boolean)
returns json language plpgsql security definer set search_path = public as $$
declare r requests; a uuid; b uuid; mid uuid;
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
    -- 반환하지 않는다. 관심은 보내는 순간 쓰는 것이다 (아래 설명)
    return json_build_object('ok', true, 'accepted', false);
  end if;

  -- 수락 → 채팅방 개설 (모임 없이 생긴 매칭이라 session_id 는 NULL)
  a := least(r.from_id, r.to_id);
  b := greatest(r.from_id, r.to_id);

  insert into matches (session_id, user_a, user_b)
  values (null, a, b)
  on conflict do nothing;

  select id into mid from matches
   where session_id is null and user_a = a and user_b = b;

  -- 전에 나가서 닫혀 있던 방이면 다시 연다 — 새로 수락했다는 건
  -- 다시 이야기하겠다는 뜻이다 (지난 대화도 그대로 남아 있다)
  update matches set closed_at = null, closed_by = null
   where id = mid and closed_at is not null;

  return json_build_object('ok', true, 'accepted', true, 'match_id', mid);
end; $$;

create or replace function requests_expire()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select id from requests
     where status = 'pending' and created_at < now() - interval '7 days'
  loop
    -- 반환하지 않는다. 행만 지워서 다시 보낼 수 있게 자리를 비운다.
    delete from requests where id = r.id;
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function request_respond(uuid,boolean) from public, anon;
grant execute on function request_respond(uuid,boolean) to authenticated;
revoke execute on function requests_expire() from public, anon, authenticated;
