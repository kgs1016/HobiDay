-- Board and comment recommendations, plus a reaction-based HOT feed.
-- Existing video likes keep using post_likes; board recommendations share the
-- same one-user/one-post uniqueness rule without changing old video RPCs.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

alter table public.post_likes
  add column if not exists created_at timestamptz not null default now();
create index if not exists post_likes_recent_idx
  on public.post_likes (post_id, created_at desc);

create table if not exists public.post_comment_recommendations (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists post_comment_recommendations_recent_idx
  on public.post_comment_recommendations (created_at desc, comment_id);
alter table public.post_comment_recommendations enable row level security;
-- No direct client policies: recommendations are written and read through RPCs.

create or replace function public.post_recommend_set(p_post uuid, p_recommended boolean)
returns json language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target public.posts;
  desired boolean := coalesce(p_recommended, false);
begin
  if me is null then return json_build_object('error', 'no_auth'); end if;

  select * into target from public.posts where id = p_post for update;
  if not found or target.deleted_at is not null or target.category <> 'board'
     or target.video_path is not null or target.pinned_rank is not null
     or target.author_id is null
     or public.blocked_with(target.author_id) then
    return json_build_object('error', 'not_found');
  end if;
  if target.author_id = me then return json_build_object('error', 'self'); end if;
  if desired and not public.my_participation_profile_ready() then
    return json_build_object('error', 'profile_incomplete');
  end if;

  if desired then
    insert into public.post_likes(post_id, user_id) values (p_post, me)
    on conflict (post_id, user_id) do nothing;
  else
    delete from public.post_likes where post_id = p_post and user_id = me;
  end if;

  return json_build_object(
    'ok', true,
    'recommended', desired,
    'recommend_count', (
      select count(*) from public.post_likes l
      where l.post_id = p_post and not public.blocked_with(l.user_id)
    )
  );
end;
$$;

create or replace function public.comment_recommend_set(p_comment uuid, p_recommended boolean)
returns json language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target record;
  desired boolean := coalesce(p_recommended, false);
begin
  if me is null then return json_build_object('error', 'no_auth'); end if;

  select c.author_id, c.deleted_at, p.author_id as post_author_id,
         p.deleted_at as post_deleted_at, p.category, p.video_path
    into target
    from public.post_comments c
    join public.posts p on p.id = c.post_id
   where c.id = p_comment
   for update of c;
  if not found or target.deleted_at is not null or target.post_deleted_at is not null
     or target.category <> 'board' or target.video_path is not null
     or target.author_id is null
     or public.blocked_with(target.author_id)
     or (target.post_author_id is not null and public.blocked_with(target.post_author_id)) then
    return json_build_object('error', 'not_found');
  end if;
  if target.author_id = me then return json_build_object('error', 'self'); end if;
  if desired and not public.my_participation_profile_ready() then
    return json_build_object('error', 'profile_incomplete');
  end if;

  if desired then
    insert into public.post_comment_recommendations(comment_id, user_id)
    values (p_comment, me)
    on conflict (comment_id, user_id) do nothing;
  else
    delete from public.post_comment_recommendations
     where comment_id = p_comment and user_id = me;
  end if;

  return json_build_object(
    'ok', true,
    'recommended', desired,
    'recommend_count', (
      select count(*) from public.post_comment_recommendations r
      where r.comment_id = p_comment and not public.blocked_with(r.user_id)
    )
  );
end;
$$;

-- A v2 endpoint keeps the five-argument board_feed signature available to old
-- installed apps. HOT ranks posts from the last 30 days using reactions from
-- the last 7 days: recommendation x3 + unique commenter x2.
create or replace function public.board_feed_v2(
  p_topic text default null,
  p_query text default null,
  p_hot boolean default false,
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 30
) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'pinned', coalesce((
      select json_agg(row_to_json(n) order by n.pinned_rank) from (
        select p.id, p.title, p.pinned_rank
          from public.posts p
         where auth.uid() is not null and p.category = 'board'
           and p.pinned_rank is not null and p.deleted_at is null
           and p.video_path is null
           and (p.author_id is null or not public.blocked_with(p.author_id))
         order by p.pinned_rank limit 2
      ) n
    ), '[]'::json),
    'items', coalesce((
      select json_agg(row_to_json(t) order by
        case when coalesce(p_hot, false) then t.hot_score end desc nulls last,
        case when coalesce(p_hot, false) then t.recommend_count end desc nulls last,
        t.created_at desc, t.id desc)
      from (
        select p.id, p.category, p.topic, p.title,
               left(regexp_replace(p.body, E'\\s+', ' ', 'g'), 140) as preview,
               p.author_id,
               coalesce(pr.nickname, p.editorial_author_name) as nickname,
               coalesce(pr.photo, p.editorial_author_photo) as photo,
               p.created_at, p.author_id = auth.uid() as mine,
               stats.comment_count, stats.recommend_count,
               (stats.recent_recommend_count * 3 + stats.recent_commenter_count * 2)::int as hot_score
          from public.posts p
          left join public.profiles pr on pr.id = p.author_id
          cross join lateral (
            select
              (select count(*) from public.post_comments c
                where c.post_id = p.id and c.deleted_at is null
                  and (c.author_id is null or not public.blocked_with(c.author_id)))::int as comment_count,
              (select count(*) from public.post_likes l
                where l.post_id = p.id and not public.blocked_with(l.user_id))::int as recommend_count,
              (select count(*) from public.post_likes l
                where l.post_id = p.id and l.created_at >= now() - interval '7 days'
                  and not public.blocked_with(l.user_id))::int as recent_recommend_count,
              (select count(distinct c.author_id) from public.post_comments c
                where c.post_id = p.id and c.deleted_at is null
                  and c.created_at >= now() - interval '7 days'
                  and c.author_id is not null and c.author_id is distinct from p.author_id
                  and not public.blocked_with(c.author_id))::int as recent_commenter_count
          ) stats
         where auth.uid() is not null and p.category = 'board'
           and p.pinned_rank is null and p.deleted_at is null and p.video_path is null
           and (p_topic is null or p.topic = p_topic)
           and (p.author_id is null or not public.blocked_with(p.author_id))
           and strpos(lower(p.title || E'\n' || p.body),
                 lower(left(btrim(coalesce(p_query, '')), 80))) > 0
           and (coalesce(p_hot, false) or p_before is null or p.created_at < p_before
             or (p.created_at = p_before and p.id < p_before_id))
           and (not coalesce(p_hot, false) or (
             p.created_at >= now() - interval '30 days'
             and stats.recent_recommend_count >= 2
           ))
         order by
           case when coalesce(p_hot, false) then (stats.recent_recommend_count * 3 + stats.recent_commenter_count * 2) end desc nulls last,
           case when coalesce(p_hot, false) then stats.recommend_count end desc nulls last,
           p.created_at desc, p.id desc
         limit case when coalesce(p_hot, false) then least(greatest(coalesce(p_limit, 20), 1), 20)
                    else least(greatest(coalesce(p_limit, 30), 1), 100) end
      ) t
    ), '[]'::json)
  );
$$;

-- Extend detail responses with per-comment recommendation state while
-- preserving the independent 운영팀 attribution for deleted operator accounts.
create or replace function public.post_detail(p_post uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'category', p.category,
    'topic', p.topic, 'pinned_rank', p.pinned_rank,
    'video_path', p.video_path, 'thumbnail_path', p.thumbnail_path,
    'liked', exists(select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'like_count', (select count(*) from public.post_likes l where l.post_id = p.id and not public.blocked_with(l.user_id)),
    'author_id', p.author_id,
    'nickname', coalesce(pr.nickname, p.editorial_author_name),
    'photo', coalesce(pr.photo, p.editorial_author_photo),
    'created_at', p.created_at, 'updated_at', p.updated_at,
    'mine', p.author_id = auth.uid(),
    'comments', coalesce((
      select json_agg(row_to_json(c) order by c.created_at) from (
        select c.id, c.author_id, cp.nickname, cp.photo, c.body, c.created_at,
               c.author_id = auth.uid() as mine,
               exists(select 1 from public.post_comment_recommendations r
                 where r.comment_id = c.id and r.user_id = auth.uid()) as recommended,
               (select count(*) from public.post_comment_recommendations r
                 where r.comment_id = c.id and not public.blocked_with(r.user_id))::int as recommend_count
          from public.post_comments c
          left join public.profiles cp on cp.id = c.author_id
         where c.post_id = p.id and c.deleted_at is null
           and (c.author_id is null or not public.blocked_with(c.author_id))
      ) c
    ), '[]'::json))
    from public.posts p
    left join public.profiles pr on pr.id = p.author_id
   where p.id = p_post and p.deleted_at is null
     and (p.author_id is null or not public.blocked_with(p.author_id));
$$;

revoke all on table public.post_comment_recommendations from anon, authenticated;
revoke all on function public.post_recommend_set(uuid, boolean),
  public.comment_recommend_set(uuid, boolean),
  public.board_feed_v2(text, text, boolean, timestamptz, uuid, int)
  from public, anon;
grant execute on function public.post_recommend_set(uuid, boolean),
  public.comment_recommend_set(uuid, boolean),
  public.board_feed_v2(text, text, boolean, timestamptz, uuid, int)
  to authenticated;

commit;
