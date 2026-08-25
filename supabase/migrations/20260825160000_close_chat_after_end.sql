-- ═══════════════════════════════════════════════════════════════
--  모임 채팅방은 끝나고 3시간 뒤에 없어진다
-- ═══════════════════════════════════════════════════════════════
-- 지금은 한 번 열린 방이 영원히 남는다. 모임을 열 번 하면 방이 열 개
-- 쌓이고, 나갈 방법도 없다(1:1 관심 채팅에는 나가기가 있는데 여기엔
-- 없다). 이 방의 쓸모는 만날 시간·장소를 맞추는 것이라 모임이 끝나면
-- 할 일이 끝난다.
--
--   ends_at + 3시간  session_chat_open 이 false → 목록·입장·전송 모두 닫힘
--   그 뒤 크론       messages·session_chat_reads 행을 지운다
--
-- 닫기를 크론과 따로 두는 이유: 크론은 한 시간에 한 번이라 그때까지
-- 방이 살아 있으면 안 된다. 읽는 쪽에서 먼저 닫고, 지우기는 뒤따른다.
--
-- ⚠️ 아래 두 함수는 20260825130000 의 본문을 그대로 들고 온 뒤 조건과
--    컬럼만 더했다. create or replace 는 통째로 갈아치운다.
--
-- 남은 기록: 메시지를 지우면 신고가 들어왔을 때 근거로 삼을 내용이
-- 사라진다. 신고 자체는 reports 에 남지만 대화 내용은 안 남는다.
-- 보관이 필요해지면 지우는 대신 별도 테이블로 옮기는 쪽이 낫다.

create or replace function session_chat_open(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions s
                  where s.id = p_session and s.status <> 'cancelled')
     and (select count(*) from signups g
           where g.session_id = p_session and g.status = 'confirmed') >= 2
     -- 끝나고 3시간이 지나면 닫는다. 실제 메시지는 아래 크론이 지우지만,
     -- 크론을 기다리지 않고 이 순간부터 방이 없는 것처럼 보여야 한다.
     and exists (select 1 from sessions s
                  where s.id = p_session
                    and s.ends_at > now() - interval '3 hours')
$$;

create or replace function my_session_chats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.last_at desc nulls last), '[]'::json)
  from (
    select s.id as session_id,
           s.gym,
           s.starts_at,
           s.ends_at,
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
       and s.status <> 'cancelled'
       and session_chat_open(s.id)
       and not exists (
         select 1 from signups b
          where b.session_id = s.id and b.status = 'confirmed'
            and blocked_with(b.user_id))
  ) t;
$$;

-- 닫힌 방의 메시지를 실제로 지운다.
-- 방이 닫힌 뒤로도 행은 남아 있으니, 여기서 정리한다.
create or replace function session_chats_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with dead as (
    select s.id from sessions s
     where s.ends_at <= now() - interval '3 hours'
  ), gone as (
    delete from messages m
     where m.session_id in (select id from dead)
    returning 1
  )
  select count(*) into n from gone;

  delete from session_chat_reads r
   where r.session_id in (select s.id from sessions s
                           where s.ends_at <= now() - interval '3 hours');
  return n;
end; $$;

revoke execute on function session_chats_purge() from public, anon, authenticated;

-- 한 시간에 한 번이면 충분하다 — 이미 화면에서는 닫혀 있고, 남은 건
-- 자리를 비우는 일뿐이다. jobname 이 같으면 갱신이라 여러 번 안전하다.
create extension if not exists pg_cron;
select cron.schedule('session-chats-purge', '23 * * * *',
                     'select public.session_chats_purge()');

revoke execute on function session_chat_open(uuid) from public, anon, authenticated;
revoke execute on function my_session_chats()      from public, anon;
grant execute on function my_session_chats() to authenticated;
