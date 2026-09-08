-- ═══════════════════════════════════════════════════════════════
--  플레이어 리뷰 — 같이 탄 사람에게 추천과 한마디를 남긴다
-- ═══════════════════════════════════════════════════════════════
-- 모임이 끝나면 함께한 사람마다 리뷰를 남길 수 있다 (2026-09 결정).
--   · 추천(liked) 한 번 + 글(body) 한 줄. 둘 중 하나만 있어도 된다.
--   · 추천 수는 프로필 이름 아래 누적으로 보인다.
--   · 글은 프로필의 "플레이어 리뷰" 칸에 카드로 흐르고, 상세보기에서 다 본다.
--
-- 누가 누구에게: 같은 모임에 확정으로 함께 있던 사이. 모임이 끝난 뒤
-- 일주일 안에만 쓸 수 있고, 그 뒤엔 창이 닫힌다 (고쳐 쓰는 것도 같은 창).
-- 모임 하나에 한 사람당 리뷰 하나 — 다시 저장하면 덮어쓴다.
--
-- 알림: 모임이 끝나면 크론이 "리뷰를 남겨주세요" 를 알림함에 넣고,
-- 발송 대기열(pushed_at)을 통해 폰까지 간다. 까먹어도 내 정보의
-- "리뷰 작성" 에서 일주일 동안 다시 쓸 수 있다.
--
-- 보는 쪽: 프로필을 볼 수 있으면(profile_visible) 리뷰도 본다. 글쓴이가
-- 탈퇴해도 리뷰는 남긴다 (추천 수가 줄어들면 받은 사람이 억울하다) —
-- 글쓴이 자리만 비운다.

-- ───────────────────────────────────────────────────────────────
--  1. 표
-- ───────────────────────────────────────────────────────────────

create table if not exists reviews (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  target_id  uuid not null references profiles(id) on delete cascade,
  liked      boolean not null default false,
  body       text check (char_length(body) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, author_id, target_id),
  check (author_id is distinct from target_id)
);

create index if not exists reviews_target_idx on reviews (target_id, created_at desc);
create index if not exists reviews_session_idx on reviews (session_id);

alter table reviews enable row level security;
-- 정책을 두지 않는다. 아래 함수로만 드나든다.

-- 크론이 리뷰 요청 알림을 한 번만 보내려고 표시해둔다
alter table sessions add column if not exists review_asked_at timestamptz;

-- ───────────────────────────────────────────────────────────────
--  2. 창 — 끝난 뒤 일주일
-- ───────────────────────────────────────────────────────────────

create or replace function review_window_open(s sessions)
returns boolean language sql stable as $$
  select s.status in ('confirmed','done')
     and s.ends_at <= now()
     and s.ends_at > now() - interval '7 days';
$$;

/* 그 모임에 확정으로 함께 있었는가 (호스트는 session_create 가 signups 에
   confirmed 로 넣는다) */
create or replace function attended(p_session uuid, p_user uuid)
returns boolean language sql stable as $$
  select exists (select 1 from signups g
                  where g.session_id = p_session and g.user_id = p_user
                    and g.status = 'confirmed');
$$;

-- ───────────────────────────────────────────────────────────────
--  3. 쓰기
-- ───────────────────────────────────────────────────────────────

create or replace function review_submit(
  p_session uuid, p_target uuid, p_liked boolean, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); s sessions; body_ text; is_new boolean; me_name text;
begin
  if me_id is null then return json_build_object('error','auth'); end if;
  if p_target = me_id then return json_build_object('error','self'); end if;

  select * into s from sessions where id = p_session;
  if not found or not review_window_open(s) then
    return json_build_object('error','closed');
  end if;
  if not attended(p_session, me_id) or not attended(p_session, p_target) then
    return json_build_object('error','not_member');
  end if;
  if blocked_with(p_target) then return json_build_object('error','blocked'); end if;
  if not exists (select 1 from profiles where id = p_target) then
    return json_build_object('error','left');
  end if;

  body_ := nullif(left(trim(coalesce(p_body,'')), 300), '');
  if not coalesce(p_liked,false) and body_ is null then
    -- 아무것도 안 남긴 리뷰는 지운다 (추천 취소 + 글 삭제)
    delete from reviews
     where session_id = p_session and author_id = me_id and target_id = p_target;
    return json_build_object('ok', true, 'removed', true);
  end if;

  is_new := not exists (select 1 from reviews
                         where session_id = p_session and author_id = me_id
                           and target_id = p_target);

  insert into reviews (session_id, author_id, target_id, liked, body)
  values (p_session, me_id, p_target, coalesce(p_liked,false), body_)
  on conflict (session_id, author_id, target_id) do update
    set liked = excluded.liked, body = excluded.body, updated_at = now();

  -- 처음 남길 때 한 번만 알린다. 고칠 때마다 울리면 시끄럽다.
  if is_new then
    select nickname into me_name from profiles where id = me_id;
    perform notify_add(p_target, '새 리뷰가 달렸어요',
      coalesce(me_name,'함께한 사람') || '님이 ' || s.gym || ' 모임 리뷰를 남겼어요.',
      '/user/reviews?id=' || p_target::text);
  end if;

  return json_build_object('ok', true);
end $$;

revoke execute on function review_submit(uuid,uuid,boolean,text) from public, anon;
grant  execute on function review_submit(uuid,uuid,boolean,text) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  4. 내가 쓸 수 있는 모임들 — 내 정보 > 리뷰 작성
-- ───────────────────────────────────────────────────────────────
-- 모임마다 함께한 사람과 내가 이미 남긴 리뷰가 붙어 온다.

create or replace function review_session_json(s sessions)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id',        s.id,
    'gym',       s.gym,
    'starts_at', s.starts_at,
    'ends_at',   s.ends_at,
    'until',     s.ends_at + interval '7 days',
    'open',      review_window_open(s),
    'people',    coalesce((
      select json_agg(row_to_json(m) order by m.is_host desc, m.nickname) from (
        select p.id, p.nickname, p.photo,
               (p.id = s.host_id) as is_host,
               r.liked, r.body
          from signups g
          join profiles p on p.id = g.user_id
          left join reviews r on r.session_id = s.id
                             and r.author_id = auth.uid()
                             and r.target_id = p.id
         where g.session_id = s.id
           and g.status = 'confirmed'
           and p.id <> auth.uid()
           and not blocked_with(p.id)
      ) m), '[]'::json));
$$;

revoke execute on function review_session_json(sessions) from public, anon, authenticated;

create or replace function my_review_sessions()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(review_session_json(s) order by s.ends_at desc), '[]'::json)
    from sessions s
   where auth.uid() is not null
     and review_window_open(s)
     and attended(s.id, auth.uid())
     -- 나 말고 아무도 없으면(전원 탈퇴·차단) 쓸 데가 없다
     and exists (select 1 from signups g
                  where g.session_id = s.id and g.status = 'confirmed'
                    and g.user_id <> auth.uid());
$$;

revoke execute on function my_review_sessions() from public, anon;
grant  execute on function my_review_sessions() to authenticated;

/* 모임 하나 — 알림에서 바로 들어올 때. 창이 닫혔어도 모임은 돌려준다
   (open=false) — 화면이 "기간이 지났어요" 를 말할 수 있게. */
create or replace function review_session(p_session uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare s sessions;
begin
  if auth.uid() is null then return json_build_object('error','auth'); end if;
  select * into s from sessions where id = p_session
     and status in ('confirmed','done') and ends_at <= now();
  if not found or not attended(p_session, auth.uid()) then
    return json_build_object('error','not_found');
  end if;
  return review_session_json(s);
end $$;

revoke execute on function review_session(uuid) from public, anon;
grant  execute on function review_session(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  5. 읽기 — 프로필의 리뷰
-- ───────────────────────────────────────────────────────────────
-- 글이 있는 것만 준다. 추천만 누른 리뷰는 수로만 보인다.
-- 내가 차단한 사람이 쓴 글은 뺀다 — 앱 어디서도 그 사람은 안 보인다.

create or replace function profile_reviews(
  p_user uuid, p_before timestamptz default null, p_limit int default 20)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select r.id, r.liked, r.body, r.created_at,
           r.author_id,
           a.nickname as author_name,
           a.photo    as author_photo,
           s.gym
      from reviews r
      left join profiles a on a.id = r.author_id
      left join sessions s on s.id = r.session_id
     where r.target_id = p_user
       and r.body is not null
       and profile_visible(p_user)
       and (r.author_id is null or not blocked_with(r.author_id))
       and (p_before is null or r.created_at < p_before)
     order by r.created_at desc
     limit least(greatest(coalesce(p_limit,20),1), 50)
  ) t;
$$;

revoke execute on function profile_reviews(uuid,timestamptz,int) from public, anon;
grant  execute on function profile_reviews(uuid,timestamptz,int) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  6. 프로필에 추천 수와 리뷰 수
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260909100000_one_profile_screen 의 user_profile 본문을 옮겨 적고
-- likes · reviews 두 칸만 더했다.

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
    'is_host',  case when p_session is null then null else (p.id = v_host) end,
    'joined',   (select count(*) from sessions s
                  where s.status in ('confirmed','done')
                    and s.starts_at <= now()
                    and (s.host_id = p.id
                         or exists (select 1 from signups g
                                     where g.session_id = s.id
                                       and g.user_id = p.id
                                       and g.status = 'confirmed'))),
    -- 받은 추천 수. 차단과 무관하게 누적 그대로 — 숫자는 개인의 기록이다
    'likes',    (select count(*) from reviews r where r.target_id = p.id and r.liked),
    -- 글이 있는 리뷰 수 (내가 차단한 사람 글은 뺀다 — 목록과 수가 맞게)
    'reviews',  (select count(*) from reviews r
                  where r.target_id = p.id and r.body is not null
                    and (r.author_id is null or not blocked_with(r.author_id))));
end $$;

revoke execute on function user_profile(uuid, uuid) from public, anon;
grant  execute on function user_profile(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  7. 크론 — 끝난 모임에 리뷰를 부탁한다
-- ───────────────────────────────────────────────────────────────
-- 십 분에 한 번. 끝난 지 하루가 넘은 모임은 건너뛴다 — 이 파일이 적용되는
-- 순간 지난 모임 전부에 알림이 쏟아지지 않게.

create or replace function reviews_ask()
returns int language plpgsql security definer set search_path = public as $$
declare r record; g record; n int := 0;
begin
  for r in
    select s.* from sessions s
     where s.status in ('confirmed','done')
       and s.review_asked_at is null
       and s.ends_at <= now()
       and s.ends_at > now() - interval '1 day'
       and (select count(*) from signups x
             where x.session_id = s.id and x.status = 'confirmed') >= 2
  loop
    for g in
      select user_id from signups
       where session_id = r.id and status = 'confirmed'
    loop
      perform notify_add(g.user_id, '오늘 모임은 어땠나요?',
        r.gym || ' 모임에서 함께한 사람에게 리뷰를 남겨주세요.',
        '/review?id=' || r.id::text);
      n := n + 1;
    end loop;
    update sessions set review_asked_at = now() where id = r.id;
  end loop;
  return n;
end $$;

revoke execute on function reviews_ask() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('reviews-ask', '*/10 * * * *', 'select public.reviews_ask()');
