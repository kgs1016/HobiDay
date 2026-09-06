-- 영상 피드백: 영상 1개 + 글 + 좋아요. 댓글·신고·차단은 posts의 기존 경로를 쓴다.
-- 공개 URL 없이 전용 private bucket을 사용한다. 게시 후 파일 교체/삭제는 막아
-- 신고 증거를 보존하고, 게시물 삭제는 기존 soft delete로 처리한다.
alter table posts add column if not exists video_path text;
alter table posts add column if not exists thumbnail_path text;
create unique index if not exists posts_video_path_idx on posts(video_path) where video_path is not null;
create unique index if not exists posts_thumbnail_path_idx on posts(thumbnail_path) where thumbnail_path is not null;
create index if not exists posts_video_feed_idx on posts(created_at desc, id desc)
  where video_path is not null and deleted_at is null;

create table if not exists post_likes (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key(post_id, user_id)
);
alter table post_likes enable row level security;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('community-videos', 'community-videos', false, 52428800,
  array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS에서 posts를 조회하기 위한 security definer. 미게시 파일은 본인만 읽는다.
create or replace function community_media_readable(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from app_admins where user_id = auth.uid())
    or exists (select 1 from posts p where (p.video_path = p_path or p.thumbnail_path = p_path)
      and p.deleted_at is null and (p.author_id is null or not blocked_with(p.author_id)))
    or (split_part(p_path, '/', 1) = auth.uid()::text
      and not exists (select 1 from posts where video_path = p_path or thumbnail_path = p_path))
  );
$$;
create or replace function community_media_unattached(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and split_part(p_path, '/', 1) = auth.uid()::text
    and not exists (select 1 from posts where video_path = p_path or thumbnail_path = p_path);
$$;
revoke all on function community_media_readable(text), community_media_unattached(text) from public, anon;
grant execute on function community_media_readable(text), community_media_unattached(text) to authenticated;

drop policy if exists "community media insert" on storage.objects;
create policy "community media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'community-videos' and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from profiles where id = auth.uid()));
drop policy if exists "community media read" on storage.objects;
create policy "community media read" on storage.objects for select to authenticated
  using (bucket_id = 'community-videos' and community_media_readable(name));
drop policy if exists "community media delete unattached" on storage.objects;
create policy "community media delete unattached" on storage.objects for delete to authenticated
  using (bucket_id = 'community-videos' and community_media_unattached(name));
-- UPDATE 정책은 두지 않는다: 게시한 영상과 썸네일 덮어쓰기 금지.

create or replace function video_post_create(p_id uuid, p_body text, p_video text, p_thumbnail text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); b text := trim(p_body); existing posts;
begin
  if me is null then return json_build_object('error','no_auth'); end if;
  if not exists(select 1 from profiles where id = me) then
    return json_build_object('error','no_profile'); end if;
  -- 같은 게시 요청을 재시도해도 같은 id를 반환한다 (응답 유실 시 중복 방지).
  perform pg_advisory_xact_lock(hashtextextended(me::text, 16));
  select * into existing from posts where id = p_id;
  if found then
    if existing.author_id = me and existing.video_path = p_video and existing.deleted_at is null then
      return json_build_object('ok',true,'id',p_id);
    end if;
    return json_build_object('error','bad_input');
  end if;
  if p_id is null or coalesce(char_length(b),0) not between 1 and 3000 then
    return json_build_object('error','empty'); end if;
  if p_video is null or p_thumbnail is null
    or p_video !~ ('^' || me::text || '/' || p_id::text || '/video\.(mp4|mov|webm)$')
    or p_thumbnail <> me::text || '/' || p_id::text || '/thumbnail.jpg' then
    return json_build_object('error','bad_media'); end if;
  if not exists (select 1 from storage.objects where bucket_id = 'community-videos' and name = p_video
      and metadata->>'mimetype' in ('video/mp4','video/quicktime','video/webm'))
    or not exists(select 1 from storage.objects where bucket_id = 'community-videos' and name = p_thumbnail
      and metadata->>'mimetype' = 'image/jpeg') then
    return json_build_object('error','bad_media'); end if;
  if exists(select 1 from posts where author_id = me and created_at > now() - interval '1 minute') then
    return json_build_object('error','too_fast'); end if;
  insert into posts(id, author_id, title, body, video_path, thumbnail_path)
    values(p_id, me, left(b,80), b, p_video, p_thumbnail);
  return json_build_object('ok',true,'id',p_id);
end; $$;

create or replace function video_post_list(p_before timestamptz default null, p_before_id uuid default null,
  p_limit int default 12) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select p.id, p.title, left(p.body,140) as preview, p.author_id, pr.nickname, pr.photo,
      p.created_at, p.author_id = auth.uid() as mine, p.thumbnail_path,
      (select count(*) from post_comments c where c.post_id = p.id and c.deleted_at is null
        and (c.author_id is null or not blocked_with(c.author_id)))::int as comment_count,
      (select count(*) from post_likes l where l.post_id = p.id and not blocked_with(l.user_id))::int as like_count
    from posts p left join profiles pr on pr.id = p.author_id
    where p.video_path is not null and p.deleted_at is null
      and (p.author_id is null or not blocked_with(p.author_id))
      and (p_before is null or p.created_at < p_before
        or (p.created_at = p_before and p.id < p_before_id))
    order by p.created_at desc, p.id desc limit greatest(1,least(coalesce(p_limit,12),30))
  ) t;
$$;

-- 원하는 상태를 지정하므로 재시도해도 좋아요가 뒤집히지 않는다.
create or replace function video_like_set(p_post uuid, p_liked boolean) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p posts;
begin
  if me is null then return json_build_object('error','no_auth'); end if;
  if not exists(select 1 from profiles where id = me) then
    return json_build_object('error','no_profile'); end if;
  select * into p from posts where id = p_post for update;
  if not found or p.deleted_at is not null or p.video_path is null
    or (p.author_id is not null and blocked_with(p.author_id)) then
    return json_build_object('error','not_found'); end if;
  if p_liked then
    insert into post_likes values(p_post,me) on conflict do nothing;
  else
    delete from post_likes where post_id = p_post and user_id = me;
  end if;
  return json_build_object('ok',true,'liked',coalesce(p_liked,false),'like_count',
    (select count(*) from post_likes where post_id = p_post and not blocked_with(user_id)));
end; $$;

revoke all on function video_post_create(uuid,text,text,text), video_post_list(timestamptz,uuid,int),
  video_like_set(uuid,boolean) from public, anon;
grant execute on function video_post_create(uuid,text,text,text), video_post_list(timestamptz,uuid,int),
  video_like_set(uuid,boolean) to authenticated;

-- 기존 신고 스냅샷에 영상 경로도 보존. 업로드 후 파일 교체/삭제 정책 없음.
alter table report_evidence add column if not exists media jsonb;
create or replace function report_video_evidence() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select jsonb_build_object('video_path',p.video_path,'thumbnail_path',p.thumbnail_path)
    into new.media from reports r join posts p on p.id = case
      when r.context = 'post' then r.ref_id
      when r.context = 'comment' then (select post_id from post_comments where id = r.ref_id)
      end
    where r.id = new.report_id and p.video_path is not null;
  return new;
end; $$;
revoke all on function report_video_evidence() from public, anon, authenticated;
drop trigger if exists report_video_evidence on report_evidence;
create trigger report_video_evidence before insert on report_evidence
  for each row execute function report_video_evidence();

-- 기존 댓글과 차단 필터를 유지한다.
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
     where p.deleted_at is null and p.video_path is null
       and (p_before is null or p.created_at < p_before)
       and (p.author_id is null or not blocked_with(p.author_id))
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 30), 100))
  ) t;
$$;

-- 기존 댓글과 차단 필터를 유지한다.
create or replace function post_detail(p_post uuid)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'title', p.title, 'body', p.body,
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
