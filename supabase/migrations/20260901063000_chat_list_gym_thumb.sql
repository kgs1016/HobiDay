-- ═══════════════════════════════════════════════════════════════
--  모임 채팅 목록에 암장 대표사진 — 동그라미가 비어 있었다
-- ═══════════════════════════════════════════════════════════════
-- 관심 채팅 줄은 상대 사진이 동그라미에 뜨는데, 모임 채팅 줄은 회색 원에
-- 사람 아이콘뿐이었다. my_session_chats 가 gym_thumb 을 안 내려줘서다.
-- session_list · session_detail 이 쓰는 값(gyms.thumbnail_url)을 한 칸
-- 얹는다. 대표사진이 없는 암장은 null — 화면이 지금처럼 아이콘을 그린다.
--
-- 곁들여 gym 도 coalesce(master name, legacy 문자열)로 맞춘다. 목록 카드는
-- master 의 정식 이름을 쓰는데 채팅 목록만 옛 문자열이면, 같은 모임이 두
-- 화면에서 다른 이름으로 보인다.
--
-- ⚠️ 20260827140000 의 본문을 그대로 들고 오고 위 두 칸만 더했다.
--    create or replace 는 통째로 갈아치우므로, 이 함수를 다시 고칠 때는
--    차단 필터(blocked_by_me)와 24시간 창(session_chat_open)을 반드시
--    함께 들고 갈 것.

create or replace function my_session_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json)
  from (
    select s.id as session_id,
           coalesce(mg.name, s.gym) as gym,
           mg.thumbnail_url as gym_thumb,
           s.starts_at,
           s.ends_at,
           s.status,
           s.cancelled_at,
           s.capacity,
           s.gender_mode,
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
      left join gyms mg on mg.id = s.gym_id
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

-- 시그니처가 그대로라 grant 도 그대로 유지되지만, 관례대로 명시한다
revoke execute on function my_session_chats() from public, anon;
grant  execute on function my_session_chats() to authenticated;
