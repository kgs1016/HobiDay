-- 자유게시판 주제·검색·고정 안내. 기존 앱의 작성/수정/조회 RPC는 유지한다.
begin;

alter table public.posts
  add column topic text not null default 'daily' check (topic in ('daily','question','gym','lost')),
  add column pinned_rank smallint check (pinned_rank between 1 and 2),
  add constraint posts_pin_board_only check (pinned_rank is null or (category='board' and video_path is null));

create unique index posts_active_pin_idx on public.posts(pinned_rank)
  where pinned_rank is not null and deleted_at is null;
create index posts_topic_feed_idx on public.posts(topic, created_at desc, id desc)
  where category='board' and deleted_at is null and video_path is null and pinned_rank is null;

-- 운영에서 확인한 두 글만 지정한다. 내용·작성일·댓글·공개 범위는 바꾸지 않는다.
update public.posts set pinned_rank = case id
  when 'be301249-1702-4ff8-8956-998078cb443c'::uuid then 1 else 2 end
where id in ('be301249-1702-4ff8-8956-998078cb443c','3bda1726-ae43-4289-be9a-ea7460334aa9')
  and author_id='5a0ad6a0-b07e-4cf8-973c-a14133668558'
  and category='board' and video_path is null and deleted_at is null;

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
               p.author_id, pr.nickname, pr.photo, p.created_at,
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

create or replace function public.post_create_with_topic(
  p_title text, p_body text, p_category text default 'board', p_topic text default 'daily'
) returns json language plpgsql security definer set search_path=public as $$
declare result json;
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  if p_topic is null or p_topic not in ('daily','question','gym','lost') then
    return json_build_object('error','invalid_topic');
  end if;
  result := post_create_in_category(p_title,p_body,p_category);
  if result->>'ok'='true' then
    update posts set topic=case when category='board' then p_topic else 'daily' end
      where id=(result->>'id')::uuid and author_id=auth.uid();
  end if;
  return result;
end $$;

create or replace function public.post_update_with_topic(
  p_post uuid, p_title text, p_body text, p_topic text default 'daily'
) returns json language plpgsql security definer set search_path=public as $$
declare result json;
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  if p_topic is null or p_topic not in ('daily','question','gym','lost') then
    return json_build_object('error','invalid_topic');
  end if;
  result := post_update(p_post,p_title,p_body);
  if result->>'ok'='true' then
    update posts set topic=case when category='board' then p_topic else 'daily' end
      where id=p_post and author_id=auth.uid() and deleted_at is null;
  end if;
  return result;
end $$;

create or replace function public.post_detail(p_post uuid)
returns json language sql stable security definer set search_path=public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'category', p.category,
    'topic', p.topic, 'pinned_rank', p.pinned_rank,
    'video_path', p.video_path, 'thumbnail_path', p.thumbnail_path,
    'liked', exists(select 1 from post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'like_count', (select count(*) from post_likes l where l.post_id = p.id and not blocked_with(l.user_id)),
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
    from posts p left join profiles pr on pr.id = p.author_id
   where p.id = p_post and p.deleted_at is null
     and (p.author_id is null or not blocked_with(p.author_id));
$$;

revoke all on function public.board_feed(text,text,timestamptz,uuid,int),
  public.post_create_with_topic(text,text,text,text), public.post_update_with_topic(uuid,text,text,text)
  from public, anon;
grant execute on function public.board_feed(text,text,timestamptz,uuid,int),
  public.post_create_with_topic(text,text,text,text), public.post_update_with_topic(uuid,text,text,text)
  to authenticated;
-- 고정 순서는 작성·수정 RPC로 받지 않고 운영 SQL에서만 설정한다.
revoke all on table public.posts from anon, authenticated;
commit;
