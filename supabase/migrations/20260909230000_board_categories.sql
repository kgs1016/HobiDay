-- 게시판 분류: 기존 글은 자유게시판으로 보존, 영상은 기존 저장·조회 경로 유지.
begin;

alter table public.posts add column category text not null default 'board'
  check (category in ('board', 'gear'));
create index posts_category_feed_idx on public.posts (category, created_at desc, id desc)
  where deleted_at is null and video_path is null;

-- 같은 시각에 올라온 글도 id를 커서로 사용해 다음 장에서 누락하지 않는다.
create or replace function public.post_list_by_category(
  p_category text default 'board', p_before timestamptz default null,
  p_before_id uuid default null, p_limit int default 30
) returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select p.id, p.category, p.title,
           left(regexp_replace(p.body, E'\\s+', ' ', 'g'), 140) as preview,
           p.author_id, pr.nickname, pr.photo, p.created_at,
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

-- 업데이트 전 설치 앱에는 계속 자유게시판만 내려준다.
create or replace function public.post_list(p_before timestamptz default null, p_limit int default 30)
returns json language sql stable security definer set search_path = public as $$
  select public.post_list_by_category('board', p_before, null, p_limit);
$$;

-- 기존 인증·프로필·도배 방지 규칙을 한 경로에서 유지한다.
create or replace function public.post_create_in_category(p_title text, p_body text, p_category text default 'board')
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if auth.uid() is null then return json_build_object('error', 'no_auth'); end if;
  if p_category is null or p_category not in ('board', 'gear') then
    return json_build_object('error', 'invalid_category');
  end if;
  result := public.post_create(p_title, p_body);
  if result->>'ok' = 'true' then
    update posts set category = p_category
      where id = (result->>'id')::uuid and author_id = auth.uid();
  end if;
  return result;
end;
$$;

create or replace function post_detail(p_post uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'body', p.body, 'category', p.category,
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
    from posts p
    left join profiles pr on pr.id = p.author_id
   where p.id = p_post and p.deleted_at is null
     and (p.author_id is null or not blocked_with(p.author_id));
$$;

revoke all on function public.post_list_by_category(text,timestamptz,uuid,int),
  public.post_create_in_category(text,text,text) from public, anon;
grant execute on function public.post_list_by_category(text,timestamptz,uuid,int),
  public.post_create_in_category(text,text,text) to authenticated;

-- 직접 쓰기는 열지 않는다. 기존 RLS와 작성·수정·삭제 RPC를 유지한다.
revoke all on table public.posts, public.post_comments from anon, authenticated;

commit;
