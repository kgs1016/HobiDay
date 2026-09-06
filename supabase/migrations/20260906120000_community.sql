-- ═══════════════════════════════════════════════════════════════
--  커뮤니티 — 대회 정보 · 클라이밍 뉴스 · 자유 게시판
-- ═══════════════════════════════════════════════════════════════
-- 하단 탭 "신청함" 옆에 "커뮤니티" 가 생긴다. 세 칸이다.
--
--   대회 정보 · 클라이밍 뉴스   community_articles — 밖에서 긁어와 쌓는다
--   자유 게시판                 posts · post_comments — 로그인한 누구나 쓴다
--
-- ── 기사(articles) ──────────────────────────────────────────────
-- 유저가 쓰는 표가 아니다. GitHub Actions 크론(.github/workflows/
-- community-feed.yml)이 service role 키로 몇 시간마다 업서트한다 —
-- IFSC 공식 일정(ICS)과 구글 뉴스 RSS. external_id 가 출처 고유키라
-- 같은 기사가 두 번 쌓이지 않는다. 운영자는 community_article_upsert 로
-- 국내 대회를 손으로 넣을 수 있다 (연맹 공지는 기계가 읽을 형식이 아니다).
-- 잘못 들어온 기사는 hidden = true 로 감춘다 (지우면 다음 크론에 되살아난다).
--
-- ── 게시판(posts) ────────────────────────────────────────────────
-- 직접 접근 정책 없음 — 전부 RPC. 이유가 둘이다.
--   · 작성자 닉네임·사진은 profiles 에 있는데, profiles 는 공개 프로필만
--     읽히도록 RLS 가 걸려 있다. 글쓴이가 비공개면 이름이 비게 된다.
--   · 차단은 앱 전체가 지키는 약속이다. 차단한 사람의 글·댓글은 여기서도
--     안 보여야 하고, 그 판정(blocked_with)은 서버가 해야 뚫리지 않는다.
-- 삭제는 soft delete. 신고 증거로 남고, 댓글 수 집계가 흔들리지 않는다.
-- 탈퇴하면 author_id 가 null 이 된다 (글은 남고 "탈퇴한 회원" 으로 뜬다).
--
-- ── 신고 ─────────────────────────────────────────────────────────
-- reports.context 에 'post' · 'comment' 를 더한다. 신고하면 여느 신고처럼
-- 글쓴이가 차단되고(글이 사라진다), 증거 스냅샷에 글·댓글 본문이 뜬다.
--
-- 몇 번 돌려도 안전하다.
--
-- ── 운영 SQL (대시보드 SQL Editor) ───────────────────────────────
--
-- 국내 대회 손으로 넣기 (운영자 계정으로 로그인한 앱에서 RPC 를 불러도 된다):
--   select community_article_upsert(json_build_object(
--     'kind', 'competition',
--     'external_id', 'kaf:2026-46th-national',
--     'title', '제46회 전국 스포츠클라이밍 선수권대회',
--     'summary', '2026 아시아선수권 출전선수 선발전',
--     'url', 'https://www.kaf.or.kr/news_01/2301',
--     'source', '대한산악연맹',
--     'location', '군산클라이밍센터',
--     'starts_at', '2026-03-20', 'ends_at', '2026-03-22'));
--
-- 기사 감추기:
--   update community_articles set hidden = true where id = '<id>';

-- ───────────────────────────────────────────────────────────────
--  1. 기사 — 대회 정보 · 뉴스
-- ───────────────────────────────────────────────────────────────
create table if not exists community_articles (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('competition','news')),
  external_id  text not null unique,      -- 출처 고유키 (ifsc:<uid> · gnews:<guid> · kaf:<no>)
  title        text not null,
  summary      text,
  url          text,
  source       text,                      -- 출처 이름 (IFSC · 연합뉴스 …)
  image_url    text,
  location     text,                      -- 대회: 장소
  starts_at    date,                      -- 대회: 일정. 뉴스는 null
  ends_at      date,
  published_at timestamptz not null default now(),
  hidden       boolean not null default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists community_articles_kind_idx
  on community_articles (kind, published_at desc) where not hidden;
create index if not exists community_articles_starts_idx
  on community_articles (starts_at) where kind = 'competition' and not hidden;

alter table community_articles enable row level security;
-- 정책 없음 = 앱은 RPC 로만 읽는다. 쓰기는 service role(크론)과 운영자 RPC 뿐.

create or replace function is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid())
$$;
revoke execute on function is_app_admin() from public, anon, authenticated;

/* 목록.
   대회는 "다가오는 것부터" — 아직 안 끝난 대회를 시작일 순으로, 그 뒤에
   날짜 없는 대회 소식(뉴스에서 건진 것)을 최신순으로. 끝난 대회는 뺀다.
   뉴스는 최신순. */
create or replace function community_articles(p_kind text, p_limit int default 60)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select id, kind, title, summary, url, source, image_url, location,
           starts_at, ends_at, published_at
      from community_articles
     where kind = p_kind
       and not hidden
       and (p_kind <> 'competition' or ends_at is null
            or ends_at >= (now() at time zone 'Asia/Seoul')::date)
     order by
       case when starts_at is null then 1 else 0 end,
       starts_at asc,
       published_at desc
     limit greatest(1, least(coalesce(p_limit, 60), 200))
  ) t;
$$;
revoke execute on function community_articles(text,int) from public, anon;
grant  execute on function community_articles(text,int) to authenticated;

/* 운영자 손 입력. 크론과 같은 열을 받는다. external_id 가 같으면 덮어쓴다. */
create or replace function community_article_upsert(p json)
returns json language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  if not is_app_admin() then return json_build_object('error','not_admin'); end if;
  if coalesce(p->>'external_id','') = '' or coalesce(p->>'title','') = '' then
    return json_build_object('error','bad_input');
  end if;

  insert into community_articles
    (kind, external_id, title, summary, url, source, image_url, location,
     starts_at, ends_at, published_at, hidden)
  values
    (coalesce(p->>'kind','competition'), p->>'external_id', left(p->>'title', 200),
     left(p->>'summary', 600), p->>'url', p->>'source', p->>'image_url',
     p->>'location', (p->>'starts_at')::date, (p->>'ends_at')::date,
     coalesce((p->>'published_at')::timestamptz, now()),
     coalesce((p->>'hidden')::boolean, false))
  on conflict (external_id) do update set
    kind = excluded.kind, title = excluded.title, summary = excluded.summary,
    url = excluded.url, source = excluded.source, image_url = excluded.image_url,
    location = excluded.location, starts_at = excluded.starts_at,
    ends_at = excluded.ends_at, published_at = excluded.published_at,
    hidden = excluded.hidden, updated_at = now()
  returning id into rid;

  return json_build_object('ok', true, 'id', rid);
end; $$;
revoke execute on function community_article_upsert(json) from public, anon;
grant  execute on function community_article_upsert(json) to authenticated;

/* 오래된 기사는 치운다 — 뉴스 90일, 끝난 대회 60일. 매일 새벽. */
create or replace function community_articles_purge()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from community_articles
   where (kind = 'news' and published_at < now() - interval '90 days')
      or (kind = 'competition' and ends_at is not null
          and ends_at < (now() at time zone 'Asia/Seoul')::date - 60)
      or (kind = 'competition' and ends_at is null
          and published_at < now() - interval '90 days');
  get diagnostics n = row_count;
  return n;
end; $$;
revoke execute on function community_articles_purge() from public, anon, authenticated;

-- 같은 이름으로 다시 걸면 갱신된다 (다른 크론과 같은 방식)
select cron.schedule('community-articles-purge', '31 18 * * *',   -- KST 03:31
                     'select public.community_articles_purge()');

-- ───────────────────────────────────────────────────────────────
--  2. 자유 게시판
-- ───────────────────────────────────────────────────────────────
create table if not exists posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid references profiles(id) on delete set null,
  title      text not null check (char_length(title) between 1 and 80),
  body       text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists posts_feed_idx on posts (created_at desc) where deleted_at is null;
create index if not exists posts_author_idx on posts (author_id);

create table if not exists post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  author_id  uuid references profiles(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists post_comments_post_idx on post_comments (post_id, created_at);

alter table posts enable row level security;
alter table post_comments enable row level security;
-- 정책 없음 = 직접 접근 차단. 아래 RPC 만 통한다.

/* 글 목록 — 최신순, p_before 로 다음 장을 받는다 (무한 스크롤).
   차단한/당한 사람의 글은 빠진다. 댓글 수도 차단 관계를 빼고 센다. */
create or replace function post_list(p_before timestamptz default null, p_limit int default 30)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select p.id, p.title,
           left(regexp_replace(p.body, E'\\s+', ' ', 'g'), 140) as preview,
           p.author_id,
           pr.nickname, pr.photo,
           p.created_at,
           p.author_id = auth.uid() as mine,
           (select count(*) from post_comments c
             where c.post_id = p.id and c.deleted_at is null
               and (c.author_id is null or not blocked_with(c.author_id)))::int
             as comment_count
      from posts p
      left join profiles pr on pr.id = p.author_id
     where p.deleted_at is null
       and (p_before is null or p.created_at < p_before)
       and (p.author_id is null or not blocked_with(p.author_id))
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 30), 100))
  ) t;
$$;

/* 글 하나 + 댓글. 차단 관계면 글 자체를 못 연다 (목록과 같은 기준). */
create or replace function post_detail(p_post uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'body', p.body,
    'author_id', p.author_id, 'nickname', pr.nickname, 'photo', pr.photo,
    'created_at', p.created_at, 'updated_at', p.updated_at,
    'mine', p.author_id = auth.uid(),
    'comments', coalesce((
      select json_agg(row_to_json(c) order by c.created_at) from (
        select c.id, c.author_id, cp.nickname, cp.photo, c.body, c.created_at,
               c.author_id = auth.uid() as mine
          from post_comments c
          left join profiles cp on cp.id = c.author_id
         where c.post_id = p.id and c.deleted_at is null
           and (c.author_id is null or not blocked_with(c.author_id))
      ) c), '[]'::json))
    from posts p
    left join profiles pr on pr.id = p.author_id
   where p.id = p_post and p.deleted_at is null
     and (p.author_id is null or not blocked_with(p.author_id));
$$;

/* 글쓰기. 프로필이 있어야 한다 (닉네임이 거기 있다).
   도배 방지 — 1분에 한 편. */
create or replace function post_create(p_title text, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); rid uuid;
        t text := left(trim(p_title), 80); b text := left(trim(p_body), 3000);
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  if not exists (select 1 from profiles where id = me_id) then
    return json_build_object('error','no_profile');
  end if;
  if coalesce(t,'') = '' or coalesce(b,'') = '' then
    return json_build_object('error','empty');
  end if;
  if exists (select 1 from posts where author_id = me_id
              and created_at > now() - interval '1 minute') then
    return json_build_object('error','too_fast');
  end if;

  insert into posts (author_id, title, body) values (me_id, t, b) returning id into rid;
  return json_build_object('ok', true, 'id', rid);
end; $$;

create or replace function post_update(p_post uuid, p_title text, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid();
        t text := left(trim(p_title), 80); b text := left(trim(p_body), 3000);
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  if coalesce(t,'') = '' or coalesce(b,'') = '' then
    return json_build_object('error','empty');
  end if;
  update posts set title = t, body = b, updated_at = now()
   where id = p_post and author_id = me_id and deleted_at is null;
  if not found then return json_build_object('error','not_mine'); end if;
  return json_build_object('ok', true);
end; $$;

/* 삭제 — 글쓴이 본인, 또는 운영자(신고 조치). */
create or replace function post_delete(p_post uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid();
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  update posts set deleted_at = now()
   where id = p_post and deleted_at is null
     and (author_id = me_id or is_app_admin());
  if not found then return json_build_object('error','not_mine'); end if;
  return json_build_object('ok', true);
end; $$;

/* 댓글. 글쓴이에게 알림함 한 줄 — 푸시는 1분 크론이 대기열에서 보낸다.
   (클라이언트 푸시는 can_notify 관계 검사에 걸린다. 글쓴이와 댓글쓴이는
   매칭·모임 관계가 아니라서 서버가 직접 남기는 길뿐이다.)
   차단 관계면 글 자체가 안 보이니 여기서도 막는다. */
create or replace function comment_create(p_post uuid, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); rid uuid; p record;
        b text := left(trim(p_body), 1000);
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  if not exists (select 1 from profiles where id = me_id) then
    return json_build_object('error','no_profile');
  end if;
  if coalesce(b,'') = '' then return json_build_object('error','empty'); end if;

  select id, author_id, title into p from posts
   where id = p_post and deleted_at is null;
  if p.id is null then return json_build_object('error','not_found'); end if;
  if p.author_id is not null and blocked_with(p.author_id) then
    return json_build_object('error','blocked');
  end if;
  if exists (select 1 from post_comments where author_id = me_id
              and created_at > now() - interval '10 seconds') then
    return json_build_object('error','too_fast');
  end if;

  insert into post_comments (post_id, author_id, body)
  values (p_post, me_id, b) returning id into rid;

  if p.author_id is not null and p.author_id <> me_id then
    perform notify_add(p.author_id, '💬 내 글에 댓글이 달렸어요',
      left(p.title, 40) || ' — ' || left(b, 80),
      '/community/post?id=' || p_post::text);
  end if;

  return json_build_object('ok', true, 'id', rid);
end; $$;

create or replace function comment_delete(p_comment uuid)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid();
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  update post_comments set deleted_at = now()
   where id = p_comment and deleted_at is null
     and (author_id = me_id or is_app_admin());
  if not found then return json_build_object('error','not_mine'); end if;
  return json_build_object('ok', true);
end; $$;

revoke execute on function post_list(timestamptz,int)          from public, anon;
revoke execute on function post_detail(uuid)                   from public, anon;
revoke execute on function post_create(text,text)              from public, anon;
revoke execute on function post_update(uuid,text,text)         from public, anon;
revoke execute on function post_delete(uuid)                   from public, anon;
revoke execute on function comment_create(uuid,text)           from public, anon;
revoke execute on function comment_delete(uuid)                from public, anon;
grant  execute on function post_list(timestamptz,int)          to authenticated;
grant  execute on function post_detail(uuid)                   to authenticated;
grant  execute on function post_create(text,text)              to authenticated;
grant  execute on function post_update(uuid,text,text)         to authenticated;
grant  execute on function post_delete(uuid)                   to authenticated;
grant  execute on function comment_create(uuid,text)           to authenticated;
grant  execute on function comment_delete(uuid)                to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3. 신고 — 글·댓글도 신고할 수 있게
-- ───────────────────────────────────────────────────────────────
alter table reports drop constraint if exists reports_context_check;
alter table reports add constraint reports_context_check
  check (context in ('profile','chat','session','post','comment'));

-- ⚠️ report_user 를 다시 정의한다 — 20260901160000 의 본문(운영자 알림 +
--    증거 스냅샷)을 그대로 들고 오고, 글·댓글 증거와 문구만 얹었다.
create or replace function report_user(
  p_target  uuid,
  p_reason  text,
  p_detail  text default null,
  p_context text default 'profile',
  p_ref     uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); rid uuid; t_name text; a uuid;
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  if p_target = me_id then return json_build_object('error','self'); end if;
  if not exists (select 1 from profiles where id = p_target) then
    return json_build_object('error','not_found');
  end if;

  insert into reports (reporter_id, target_id, reason, detail, context, ref_id)
  values (me_id, p_target, p_reason, nullif(trim(p_detail), ''),
          coalesce(p_context, 'profile'), p_ref)
  on conflict do nothing   -- 이미 처리 대기 중인 신고가 있으면 그대로 둔다
  returning id into rid;

  if rid is not null then
    select nickname into t_name from profiles where id = p_target;

    -- 증거 스냅샷 — 같은 트랜잭션이라 접수와 함께 뜨거나 함께 안 뜬다
    insert into report_evidence (report_id, target_profile, messages)
    values (
      rid,
      (select to_jsonb(p) - 'survey' from profiles p where id = p_target),
      case
        when p_ref is null then null
        when coalesce(p_context, 'profile') = 'chat' then
          (select jsonb_agg(row_to_json(m)::jsonb order by m.created_at)
             from (select x.sender_id, pr.nickname, x.kind, x.body, x.created_at
                     from messages x
                     left join profiles pr on pr.id = x.sender_id
                    where x.match_id = p_ref
                    order by x.created_at desc
                    limit 100) m)
        when coalesce(p_context, 'profile') = 'session' then
          (select jsonb_agg(row_to_json(m)::jsonb order by m.created_at)
             from (select x.sender_id, pr.nickname, x.kind, x.body, x.created_at
                     from messages x
                     left join profiles pr on pr.id = x.sender_id
                    where x.session_id = p_ref
                    order by x.created_at desc
                    limit 100) m)
        -- 글 신고: 글 본문 + 그 글의 댓글 (맥락째 남긴다)
        when coalesce(p_context, 'profile') = 'post' then
          (select jsonb_agg(row_to_json(m)::jsonb order by m.created_at)
             from (select x.author_id as sender_id, pr.nickname, 'post' as kind,
                          x.title || E'\n' || x.body as body, x.created_at
                     from posts x
                     left join profiles pr on pr.id = x.author_id
                    where x.id = p_ref
                    union all
                   select c.author_id, cp.nickname, 'comment', c.body, c.created_at
                     from post_comments c
                     left join profiles cp on cp.id = c.author_id
                    where c.post_id = p_ref
                    order by created_at desc
                    limit 100) m)
        -- 댓글 신고: 그 댓글과, 달린 글
        when coalesce(p_context, 'profile') = 'comment' then
          (select jsonb_agg(row_to_json(m)::jsonb order by m.created_at)
             from (select x.author_id as sender_id, pr.nickname, 'post' as kind,
                          x.title || E'\n' || x.body as body, x.created_at
                     from post_comments c
                     join posts x on x.id = c.post_id
                     left join profiles pr on pr.id = x.author_id
                    where c.id = p_ref
                    union all
                   select c.author_id, cp.nickname, 'comment', c.body, c.created_at
                     from post_comments c
                     left join profiles cp on cp.id = c.author_id
                    where c.id = p_ref) m)
        else null
      end
    );

    -- 새로 접수된 경우에만 운영자를 부른다 (같은 대상 재신고는 조용히).
    -- 푸시에는 사유·맥락·대상만 싣는다 — 신고자를 폰 화면에 띄울 이유가 없다.
    for a in select user_id from app_admins loop
      perform notify_add(
        a,
        '🚨 새 신고',
        '사유: '
          || case p_reason
               when 'abuse'      then '욕설·괴롭힘'
               when 'sexual'     then '성적 불쾌감'
               when 'fake'       then '사진·정보 불일치'
               when 'commercial' then '광고·영업'
               when 'noshow'     then '노쇼'
               else '기타' end
          || ' · '
          || case coalesce(p_context, 'profile')
               when 'chat' then '채팅' when 'session' then '모임'
               when 'post' then '게시글' when 'comment' then '댓글'
               else '프로필' end
          || ' · 대상: ' || coalesce(t_name, '(알 수 없음)'),
        null);
    end loop;
  end if;

  /* 차단 행을 직접 넣지 않는다. block_user 가 방을 정리하고 모임에서
     갈라놓는 일까지 맡으므로, 신고와 차단이 같은 길을 타야 한다. */
  return block_user(p_target);
end; $$;

revoke execute on function report_user(uuid,text,text,text,uuid) from public, anon;
grant  execute on function report_user(uuid,text,text,text,uuid) to authenticated;
