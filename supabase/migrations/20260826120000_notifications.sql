-- ═══════════════════════════════════════════════════════════════
--  알림함
-- ═══════════════════════════════════════════════════════════════
-- 지금까지 알림은 네이티브 푸시뿐이었다. 놓치면 끝이고, 웹에서는
-- 아예 오지 않고, 크론이 하는 일(무응답 만료, 자동 취소)은 알릴 방법이
-- 없었다 — DB 에서 푸시를 쏘려면 pg_net 이 필요하다.
--
-- 알림을 DB 에 쌓아두면 셋 다 풀린다. 푸시는 그대로 두고, 같은 내용을
-- 여기에도 남긴다. 푸시를 못 봐도 종 아이콘에 남아 있다.
--
-- 수명 — 읽으면 24시간 뒤에 사라진다. 읽었다는 건 "봤다" 는 뜻이고,
-- 본 알림을 계속 쌓아둘 이유가 없다. 다만 방금 읽고 화면을 나갔다가
-- 다시 들어온 사람이 "어? 아까 그거 뭐였지" 할 여지는 남긴다.
-- 안 읽은 알림은 30일까지 둔다. 그보다 오래된 소식은 이미 소식이 아니다.

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  title      text not null,
  body       text not null,
  url        text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists notifications_mine
  on notifications (user_id, created_at desc);

alter table notifications enable row level security;
-- 정책을 두지 않는다. 아래 함수로만 드나든다.


/* 알림을 남긴다. 푸시를 부탁하는 것과 같은 자리에서 함께 부른다.

   보낼 수 있는 상대인지는 can_notify 가 판단한다 — 푸시와 같은 잣대다.
   차단했거나, 아무 인연도 없는 사람에게는 못 남긴다. 이 문이 없으면
   아무나 아무에게 알림을 꽂을 수 있다. */
create or replace function notify_send(
  p_to uuid[], p_title text, p_body text, p_url text default null)
returns int language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); u uuid; n int := 0;
begin
  if me_id is null then return 0; end if;
  if nullif(trim(coalesce(p_title,'')), '') is null then return 0; end if;

  foreach u in array coalesce(p_to, '{}'::uuid[]) loop
    if can_notify(me_id, u) then
      insert into notifications (user_id, title, body, url)
      values (u, left(p_title, 120), left(coalesce(p_body,''), 300), p_url);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function notify_send(uuid[],text,text,text) from public, anon;
grant  execute on function notify_send(uuid[],text,text,text) to authenticated;


/* 내 알림함. 사라질 때가 지난 것은 애초에 안 보낸다 — 크론이 지우기
   전에 열어봐도 화면과 DB 가 어긋나지 않게. */
create or replace function my_notifications()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'unread', (select count(*) from notifications
                where user_id = auth.uid() and read_at is null),
    'items', coalesce((
      select json_agg(row_to_json(t) order by t.created_at desc) from (
        select id, title, body, url, created_at, read_at
          from notifications
         where user_id = auth.uid()
           and (read_at is null or read_at > now() - interval '24 hours')
           and created_at > now() - interval '30 days'
         order by created_at desc
         limit 100
      ) t), '[]'::json));
$$;

revoke execute on function my_notifications() from public, anon;
grant  execute on function my_notifications() to authenticated;


/* 알림함을 열면 다 읽은 것으로 친다. 목록을 봤다는 게 곧 읽었다는
   뜻이라, 알림마다 따로 눌러 읽게 하지 않는다. 이미 읽은 것의 시각은
   건드리지 않는다 — 건드리면 24시간이 계속 미뤄져서 안 사라진다. */
create or replace function notifications_read()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function notifications_read() from public, anon;
grant  execute on function notifications_read() to authenticated;


create or replace function notifications_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from notifications
   where (read_at is not null and read_at < now() - interval '24 hours')
      or created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function notifications_purge() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('notifications-purge', '41 * * * *',
                     'select public.notifications_purge()');
