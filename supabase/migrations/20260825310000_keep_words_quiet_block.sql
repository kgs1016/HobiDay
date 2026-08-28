-- ═══════════════════════════════════════════════════════════════
--  탈퇴해도 말은 남는다 · 차단은 나가기처럼 보인다
-- ═══════════════════════════════════════════════════════════════
--
-- ① 탈퇴하면 그 사람이 쓴 메시지가 통째로 사라지고 있었다.
--    messages.sender_id 가 프로필을 CASCADE 로 따라간 탓이다. 남은
--    사람 화면에는 자기 말풍선만 남아 대화가 구멍 나고, 신고 근거도
--    함께 없어졌다. 채팅 화면에는 이미 "탈퇴한 사용자" 를 띄우는
--    처리가 있었는데, 메시지가 지워지니 한 번도 쓰인 적이 없었다.
--
--    메시지를 남기고, 이름도 그대로 보이게 한다. 프로필이 사라지기
--    직전에 닉네임을 메시지에 박아둔다.
--
-- ② 차단하면 방이 양쪽 목록에서 소리 없이 사라졌다. 차단당한 쪽은
--    아무 설명 없이 대화방이 증발한 걸로 보인다. 그렇다고 "차단당했다"
--    고 알릴 수도 없다.
--
--    나가기와 똑같은 자국을 남긴다 — "○○님이 나갔어요" 한 줄과 닫힌
--    입력창. 실제로는 차단이라 앞으로 서로 안 보이고 말도 못 건다.
--    그러려면 방을 감추는 조건이 한 방향이어야 한다: 차단한 사람의
--    목록에서만 치우고, 차단당한 사람의 방은 그대로 둔다.

-- ── ① 탈퇴해도 말과 이름이 남는다 ────────────────────────────
alter table messages add column if not exists sender_name text;
alter table messages alter column sender_id drop not null;

alter table messages drop constraint if exists messages_sender_id_fkey;
alter table messages add constraint messages_sender_id_fkey
  foreign key (sender_id) references profiles(id) on delete set null;


-- ── ② 차단을 한 방향으로 보는 눈 ─────────────────────────────
-- blocked_with 는 양방향이다(서로 안 보인다). 방을 감출 때만 "내가
-- 차단했는가" 를 따로 봐야 해서 하나 더 둔다.
create or replace function blocked_by_me(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from blocks
     where blocker_id = auth.uid() and blocked_id = p_other)
$$;
revoke execute on function blocked_by_me(uuid) from public, anon, authenticated;

create or replace function block_user(p_target uuid)
returns json language plpgsql security definer set search_path = public as $$
declare m matches; me profiles; i_am_a boolean;
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

  return json_build_object('ok', true);
end; $$;

revoke execute on function block_user(uuid) from public, anon;
grant  execute on function block_user(uuid) to authenticated;


create or replace function my_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json) from (
    select m.id as match_id,
           m.session_id,
           s.gym,                      -- 관심 수락으로 생긴 방이면 NULL
           p.id   as partner_id,
           p.nickname,
           p.age,
           p.level,
           p.home_gym,
           p.photo,
           -- 상대가 나갔으면 입력창을 닫는다 (보낼 데가 없다)
           (case when m.user_a = auth.uid() then m.b_left_at else m.a_left_at end)
             is not null as partner_left,
           (select body from messages x
             where x.match_id = m.id order by x.created_at desc limit 1) as last_body,
           coalesce(
             (select max(created_at) from messages x where x.match_id = m.id),
             m.created_at) as last_at,
           (select count(*) from messages x
             where x.match_id = m.id
               and x.sender_id <> auth.uid()
               and x.created_at > coalesce(
                     (select r.last_read_at from chat_reads r
                       where r.match_id = m.id and r.user_id = auth.uid()),
                     '-infinity'::timestamptz)) as unread
      from matches m
      left join sessions s on s.id = m.session_id
      join profiles p
        on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
     where auth.uid() in (m.user_a, m.user_b)
       -- 내가 나갔으면 내 목록에서만 사라진다 (상대에겐 남아 있다)
       and (case when m.user_a = auth.uid() then m.a_left_at else m.b_left_at end)
             is null
       -- 차단은 내 목록에서만 치운다. 상대에게는 내가 '나간' 것으로
       -- 보여야 해서, 상대 쪽 방은 그대로 둔다 (block_user 설명 참고).
       and not blocked_by_me(p.id)
  ) t;
$$;

revoke execute on function my_chats() from public, anon;
grant  execute on function my_chats() to authenticated;


create or replace function chat_messages(p_match uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare m matches; other uuid;
begin
  select * into m from matches
   where id = p_match and auth.uid() in (user_a, user_b);
  if not found then return json_build_object('error','not_allowed'); end if;
  if (case when m.user_a = auth.uid() then m.a_left_at else m.b_left_at end)
       is not null then
    return json_build_object('error','closed');
  end if;

  other := case when m.user_a = auth.uid() then m.user_b else m.user_a end;
  if blocked_by_me(other) then return json_build_object('error','blocked'); end if;

  return (
    select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) from (
      select id, sender_id, body, created_at, kind,
             (sender_id = auth.uid()) as mine
        from messages where match_id = p_match
    ) t
  );
end; $$;

revoke execute on function chat_messages(uuid) from public, anon;
grant  execute on function chat_messages(uuid) to authenticated;


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
             -- 탈퇴해도 쓴 말과 이름은 남는다 (프로필이 지워지면 스냅샷)
             coalesce(p.nickname, x.sender_name) as sender_name,
             p.photo    as sender_photo,
             (x.sender_id = s.host_id) as sender_is_host
        from messages x
        join sessions s on s.id = x.session_id
        left join profiles p on p.id = x.sender_id
       where x.session_id = p_session
    ) t
  );
end $$;

revoke execute on function session_chat_messages(uuid) from public, anon;
grant  execute on function session_chat_messages(uuid) to authenticated;


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

  /* 내가 쓴 말은 남는다. 프로필이 사라져도 누가 한 말인지 알아볼 수
     있게 이름을 메시지에 박아둔다 — 대화가 구멍 나면 남은 사람은
     자기 말만 보게 되고, 신고 근거도 함께 없어진다. */
  update messages set sender_name = coalesce(nullif(
           (select nickname from profiles where id = me_id), ''), '알 수 없음')
   where sender_id = me_id and sender_name is null;

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
grant  execute on function account_delete() to authenticated;
