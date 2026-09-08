-- ═══════════════════════════════════════════════════════════════
--  상대 프로필은 한 화면 · 키는 선택 · "몇 번 참여했는지"
-- ═══════════════════════════════════════════════════════════════
-- 지금까지 상대 프로필은 들어온 길마다 다른 화면이었다.
--   · 모임 단체 채팅·참가 현황  → 참여자 프로필 (session_member, 전체 화면)
--   · 사람 찾기·1:1 채팅       → 사진과 한 줄 요약뿐인 시트
-- 어디서 누르든 같은 프로필 화면이 열리게 한다 (2026-09 결정). 그러려면
-- "이 모임의 참여자" 로만 닿던 조회를 "이 사람" 단위로 넓혀야 한다.
--
-- 아무나 id 로 조회하게 열지는 않는다. 볼 수 있는 사이는 지금 앱이 이미
-- 보여주고 있는 사이와 같다:
--   1. 나 자신
--   2. 사람 찾기에 공개한 사람            (profiles.is_public)
--   3. 1:1 채팅방이 있는 사이              (matches)
--   4. 같은 모임에 확정으로 함께 있(었)던 사이 (signups / sessions.host_id)
--   5. 모임 id 를 같이 넘기면 session_member 의 판정 그대로
--      — 열려 있는 모임을 구경하는 사람이 호스트·참여자를 볼 때
-- 차단한 사이는 어느 길로도 열리지 않는다.
--
-- 사진 아래 "모임 N번 열었어요" 는 "N번 참여했어요" 로 바꾼다. 호스트만
-- 세는 숫자라 신청해서 다닌 사람은 늘 0이었다. 호스트든 참가자든 실제로
-- 열린(2명 이상 확정) 모임을 시작 시각이 지난 것만 센다.
--
-- 키는 다시 선택 입력이다. 20260822150000 이 공개 조건에 걸어둔 제약을
-- 푼다. 같이 클라이밍할 사람을 찾는 앱에서 키가 필수일 이유가 없다.
--
-- session_host(uuid) · session_member(uuid,uuid) 는 그대로 둔다 — 이미
-- 폰에 깔린 앱이 부른다. 새 화면은 user_profile 만 쓴다.

-- ───────────────────────────────────────────────────────────────
--  1. 키는 선택
-- ───────────────────────────────────────────────────────────────

alter table profiles drop constraint if exists profiles_public_needs_height;

-- ───────────────────────────────────────────────────────────────
--  2. 이 사람을 내가 볼 수 있는가
-- ───────────────────────────────────────────────────────────────
-- 프로필과 완등 성취가 같은 판정을 쓰도록 한곳에 둔다.

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
                     and p_user     in (m.user_a, m.user_b))
       or exists (
            select 1 from sessions s
             where s.status in ('open','confirmed','done')
               and (s.host_id = p_user
                    or exists (select 1 from signups g
                                where g.session_id = s.id and g.user_id = p_user
                                  and g.status = 'confirmed'))
               and (s.host_id = auth.uid()
                    or exists (select 1 from signups g
                                where g.session_id = s.id and g.user_id = auth.uid()
                                  and g.status = 'confirmed')))
       or (p_session is not null
           and coalesce(session_member(p_session, p_user)->>'id', '') = p_user::text)
     );
$$;

revoke execute on function profile_visible(uuid, uuid) from public, anon;
grant  execute on function profile_visible(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3. 프로필 한 사람
-- ───────────────────────────────────────────────────────────────
-- p_user 없이 p_session 만 오면 그 모임의 호스트다 — 모임 상세의
-- "호스트" 칸이 사람 id 없이도 열리게.

create or replace function user_profile(p_user uuid, p_session uuid default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare p profiles; v_host uuid;
begin
  if auth.uid() is null then return json_build_object('error','auth'); end if;

  if p_session is not null then
    select host_id into v_host from sessions where id = p_session;
  end if;
  if p_user is null then p_user := v_host; end if;
  if p_user is null then return json_build_object('error','not_found'); end if;

  if not profile_visible(p_user, p_session) then
    return json_build_object('error','not_found');
  end if;

  select * into p from profiles where id = p_user;
  if not found then return json_build_object('error','left'); end if;

  return json_build_object(
    'id',       p.id,
    'nickname', p.nickname,
    'gender',   p.gender,
    'age',      p.age,
    'area',     p.area,
    'level',    p.level,
    'career',   p.career,
    'height',   p.height,
    'home_gym', p.home_gym,
    'mbti',     p.mbti,
    'intro',    p.intro,
    'photo',    p.photo,
    'is_public', p.is_public,
    -- 모임 맥락이 있을 때만 뜻이 있다. 없으면 null
    'is_host',  case when p_session is null then null else (p.id = v_host) end,
    -- 실제로 열려서 시작 시각이 지난 모임에 호스트 또는 확정 참가자로 있던 수
    'joined',   (select count(*) from sessions s
                  where s.status in ('confirmed','done')
                    and s.starts_at <= now()
                    and (s.host_id = p.id
                         or exists (select 1 from signups g
                                     where g.session_id = s.id
                                       and g.user_id = p.id
                                       and g.status = 'confirmed'))));
end $$;

revoke execute on function user_profile(uuid, uuid) from public, anon;
grant  execute on function user_profile(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  4. 완등 성취도 같은 판정으로
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260908190000_public_climbing_achievements 의 본문을 옮겨 적고
-- visible 절만 profile_visible 로 바꿨다. 1:1 채팅 상대가 프로필을 내린
-- 뒤에는 성취가 안 떴는데, 이제 채팅방이 있는 사이면 뜬다.

create or replace function public_climbing_achievements(p_users uuid[], p_session uuid default null)
returns table(user_id uuid, stage text, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if coalesce(cardinality(p_users),0) > 100 then
    raise exception 'at most 100 profiles per request' using errcode = '22023';
  end if;

  return query
  with visible as (
    select p.id from profiles p
    where p.id = any(coalesce(p_users, '{}'::uuid[]))
      and profile_visible(p.id, p_session)
  ), counts as (
    select p.id, count(a.id) as n,
      count(*) filter (where a.v_grade >= 1) as v1,
      count(*) filter (where a.v_grade >= 2) as v2,
      count(*) filter (where a.v_grade >= 3) as v3,
      count(*) filter (where a.v_grade >= 4) as v4,
      count(*) filter (where a.v_grade >= 6) as v6,
      count(*) filter (where a.v_grade >= 8) as v8
    from visible p left join climbing_ascents a on a.user_id = p.id
    group by p.id
  )
  select c.id,
    case when c.v8 >= 15 then 'black'
         when c.v6 >= 12 then 'purple'
         when c.v4 >= 10 then 'blue'
         when c.v3 >= 8 then 'green'
         when c.v2 >= 5 then 'orange'
         when c.v1 >= 3 then 'yellow'
         else 'white' end,
    c.n
  from counts c;
end;
$$;

revoke all on function public_climbing_achievements(uuid[],uuid) from public, anon;
grant execute on function public_climbing_achievements(uuid[],uuid) to authenticated;
