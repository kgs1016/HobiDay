-- 신청 목록에 이미 표시되는 상대를 같은 상세 프로필로 연결한다.
-- 요청 종류별 보존 기간을 유지하며, 무관한 비공개 프로필·차단한 상대는 열지 않는다.
begin;

create or replace function requests_sent()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select r.id, r.created_at, r.responded_at, r.status,
           p.id as to_id, p.nickname, p.age, p.level, p.home_gym, p.photo
      from requests r join profiles p on p.id = r.to_id
     where r.from_id = auth.uid()
       and r.created_at > now() - interval '7 days'
       and (r.status = 'pending'
         or coalesce(r.responded_at, r.created_at) > now() - interval '24 hours')
       and not blocked_with(p.id)
  ) t;
$$;
revoke execute on function requests_sent() from public, anon;
grant execute on function requests_sent() to authenticated;

create or replace function profile_visible(p_user uuid, p_session uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and p_user is not null
     and not blocked_with(p_user)
     and (
       p_user = auth.uid()
       or exists (select 1 from profiles p where p.id = p_user and p.is_public)
       or exists (select 1 from matches m
                   where auth.uid() in (m.user_a, m.user_b)
                     and p_user in (m.user_a, m.user_b))
       or exists (
            select 1 from sessions s
             where s.status in ('open','confirmed','done')
               and (s.host_id = p_user
                    or exists (select 1 from signups g where g.session_id = s.id
                                and g.user_id = p_user and g.status = 'confirmed'))
               and (s.host_id = auth.uid()
                    or exists (select 1 from signups g where g.session_id = s.id
                                and g.user_id = auth.uid() and g.status = 'confirmed')))
       or (p_session is not null
           and coalesce(session_member(p_session, p_user)->>'id', '') = p_user::text)
       -- 받은 채팅: 미처리 7일. 보낸 채팅: 미처리 또는 처리 후 24시간, 최대 7일.
       or exists (
            select 1 from requests r
             where r.created_at > now() - interval '7 days'
               and ((r.from_id = p_user and r.to_id = auth.uid() and r.status = 'pending')
                 or (r.from_id = auth.uid() and r.to_id = p_user
                     and (r.status = 'pending'
                       or coalesce(r.responded_at,r.created_at) > now() - interval '24 hours'))))
       -- 모임 맥락이 주어진 경우에만 신청자와 호스트의 기존 신청 목록 범위를 허용한다.
       or exists (
            select 1 from sessions s join signups g on g.session_id = s.id
             where s.id = p_session
               and s.starts_at > now() - interval '24 hours'
               and ((s.host_id = auth.uid() and g.user_id = p_user
                     and g.status = 'waiting' and s.status in ('open','confirmed'))
                 or (s.host_id = p_user and g.user_id = auth.uid()
                     and g.status <> 'cancelled' and s.host_id <> auth.uid())))
     );
$$;
revoke execute on function profile_visible(uuid, uuid) from public, anon;
grant execute on function profile_visible(uuid, uuid) to authenticated;

commit;
