-- Preserve official notice attribution independently of a deleted operator login.
-- Only the two known operating-team notices receive the fallback. No account is recreated.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
alter table public.posts
  add column editorial_author_name text,
  add column editorial_author_photo text,
  add constraint posts_editorial_author_pair check (
    (editorial_author_name is null and editorial_author_photo is null) or
    (editorial_author_name = '운영팀' and editorial_author_photo is not null
      and category = 'board' and video_path is null)
  );
-- Direct table writes remain unavailable to clients; creation/edit RPCs never accept these fields.
update public.posts
set editorial_author_name='운영팀',
    editorial_author_photo='5a0ad6a0-b07e-4cf8-973c-a14133668558/hobiday-logo-526d5675292f.png'
where id in ('be301249-1702-4ff8-8956-998078cb443c','3bda1726-ae43-4289-be9a-ea7460334aa9')
  and (author_id is null or author_id='5a0ad6a0-b07e-4cf8-973c-a14133668558')
  and category='board' and video_path is null and deleted_at is null;
create or replace function public.post_detail(p_post uuid)
returns json language sql stable security definer set search_path=public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'category', p.category,
    'topic', p.topic, 'pinned_rank', p.pinned_rank,
    'video_path', p.video_path, 'thumbnail_path', p.thumbnail_path,
    'liked', exists(select 1 from post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'like_count', (select count(*) from post_likes l where l.post_id = p.id and not blocked_with(l.user_id)),
    'author_id', p.author_id, 'nickname', coalesce(pr.nickname, p.editorial_author_name), 'photo', coalesce(pr.photo, p.editorial_author_photo),
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
    from posts p left join profiles pr on pr.id = p.author_id
   where p.id = p_post and p.deleted_at is null
     and (p.author_id is null or not blocked_with(p.author_id));
$$;

create or replace function public.board_feed(
  p_topic text default null, p_query text default null,
  p_before timestamptz default null, p_before_id uuid default null, p_limit int default 30
) returns json language sql stable security definer set search_path=public as $$
  select json_build_object(
    'pinned', coalesce((
      select json_agg(row_to_json(n) order by n.pinned_rank) from (
        select p.id, p.title, p.pinned_rank
          from posts p
         where auth.uid() is not null and p.category='board' and p.pinned_rank is not null
           and p.deleted_at is null and p.video_path is null
           and (p.author_id is null or not blocked_with(p.author_id))
         order by p.pinned_rank limit 2
      ) n
    ), '[]'::json),
    'items', coalesce((
      select json_agg(row_to_json(t) order by t.created_at desc, t.id desc) from (
        select p.id, p.category, p.topic, p.title,
               left(regexp_replace(p.body, E'\\s+', ' ', 'g'),140) as preview,
               p.author_id, coalesce(pr.nickname, p.editorial_author_name) as nickname, coalesce(pr.photo, p.editorial_author_photo) as photo, p.created_at,
               p.author_id=auth.uid() as mine,
               (select count(*) from post_comments c where c.post_id=p.id and c.deleted_at is null
                 and (c.author_id is null or not blocked_with(c.author_id)))::int as comment_count
          from (
            select p.* from posts p
             where auth.uid() is not null and p.category='board' and p.pinned_rank is null
               and p.deleted_at is null and p.video_path is null
               and (p_topic is null or p.topic=p_topic)
               and (p.author_id is null or not blocked_with(p.author_id))
               and (p_before is null or p.created_at<p_before
                 or (p.created_at=p_before and p.id<p_before_id))
               and strpos(lower(p.title || E'\n' || p.body), lower(left(btrim(coalesce(p_query,'')),80)))>0
             order by p.created_at desc, p.id desc
             limit greatest(1,least(coalesce(p_limit,30),100))
          ) p left join profiles pr on pr.id=p.author_id
      ) t
    ), '[]'::json)
  );
$$;

create or replace function public.post_list_by_category(
  p_category text default 'board', p_before timestamptz default null,
  p_before_id uuid default null, p_limit int default 30
) returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select p.id, p.category, p.title,
           left(regexp_replace(p.body, E'\\s+', ' ', 'g'), 140) as preview,
           p.author_id, coalesce(pr.nickname, p.editorial_author_name) as nickname, coalesce(pr.photo, p.editorial_author_photo) as photo, p.created_at,
           p.author_id = auth.uid() as mine,
           (select count(*) from post_comments c
             where c.post_id = p.id and c.deleted_at is null
               and (c.author_id is null or not blocked_with(c.author_id)))::int as comment_count
      from posts p left join profiles pr on pr.id = p.author_id
     where auth.uid() is not null
       and p.category = p_category and p_category in ('board', 'gear')
       and p.deleted_at is null and p.video_path is null
       and (p_before is null or p.created_at < p_before
         or (p.created_at = p_before and p.id < p_before_id))
       and (p.author_id is null or not blocked_with(p.author_id))
     order by p.created_at desc, p.id desc
     limit greatest(1, least(coalesce(p_limit, 30), 100))
  ) t;
$$;
commit;
