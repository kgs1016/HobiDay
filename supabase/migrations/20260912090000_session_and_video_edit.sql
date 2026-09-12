-- Host-only meetup editing and owner-only video revisions. Existing API responses remain compatible.
begin;

alter table public.sessions add column edit_version integer not null default 0;

create function public.session_edit_detail(p_session uuid) returns json
language sql stable security definer set search_path=public as $$
  select row_to_json(t) from (
    select s.id, s.gym, s.gym_id, s.starts_at, s.ends_at, s.capacity,
      s.level_min, s.level_max, s.age_min, s.age_max, s.note, s.status, s.edit_version,
      (select count(*) from signups g where g.session_id=s.id and g.status='confirmed') as confirmed
    from sessions s where s.id=p_session and s.host_id=auth.uid()
  ) t;
$$;

create function public.session_update(
  p_session uuid, p_version integer, p_gym text, p_gym_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_capacity integer,
  p_level_min integer, p_level_max integer, p_age_min integer, p_age_max integer, p_note text
) returns json language plpgsql security definer set search_path=public as $$
declare s sessions; gym_name text; members integer; recipient uuid; clean_note text:=nullif(btrim(p_note),'');
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  select * into s from sessions where id=p_session for update;
  if not found or s.host_id is distinct from auth.uid() then return json_build_object('error','not_host'); end if;
  if s.status not in ('open','confirmed') or s.starts_at<=now() then return json_build_object('error','closed'); end if;
  if not my_participation_profile_ready() then return json_build_object('error','profile_incomplete'); end if;
  if p_gym_id is not null then
    select name into gym_name from gyms where id=p_gym_id and (is_active or id=s.gym_id);
    if not found then return json_build_object('error','bad_gym'); end if;
  else gym_name:=btrim(p_gym);
  end if;
  if coalesce(char_length(gym_name),0) not between 1 and 150 then return json_build_object('error','bad_gym'); end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then return json_build_object('error','bad_time'); end if;
  if p_starts_at<=now() then return json_build_object('error','past'); end if;
  if p_starts_at is distinct from s.starts_at and p_starts_at<now()+interval '30 minutes' then return json_build_object('error','too_soon'); end if;
  if p_starts_at>now()+interval '90 days' then return json_build_object('error','too_far'); end if;
  if p_capacity is null or (p_capacity not between 2 and 6 and p_capacity<>s.capacity) then return json_build_object('error','bad_capacity'); end if;
  select count(*) into members from signups where session_id=s.id and status='confirmed';
  if p_capacity<members then return json_build_object('error','below_members'); end if;
  if p_level_min is null or p_level_max is null or p_level_min<1 or p_level_max>5 or p_level_min>p_level_max then return json_build_object('error','bad_level'); end if;
  if p_age_min is null or p_age_max is null or p_age_min<19 or p_age_max>60 or p_age_min>p_age_max then return json_build_object('error','bad_age'); end if;
  if char_length(clean_note)>1000 then return json_build_object('error','long_note'); end if;
  -- Response loss: retrying the already saved form neither sends duplicate notices nor changes state.
  if row(s.gym,s.gym_id,s.starts_at,s.ends_at,s.capacity,s.level_min,s.level_max,s.age_min,s.age_max,s.note)
    is not distinct from row(gym_name,p_gym_id,p_starts_at,p_ends_at,p_capacity,p_level_min,p_level_max,p_age_min,p_age_max,clean_note)
  then return json_build_object('ok',true,'id',s.id); end if;
  if p_version is distinct from s.edit_version then return json_build_object('error','conflict'); end if;
  update sessions set gym=gym_name,gym_id=p_gym_id,starts_at=p_starts_at,ends_at=p_ends_at,
    capacity=p_capacity,level_min=p_level_min,level_max=p_level_max,age_min=p_age_min,age_max=p_age_max,
    note=clean_note,edit_version=edit_version+1 where id=s.id;
  -- Keep existing approvals/chat membership. Waiting and confirmed members see the updated details.
  for recipient in select user_id from signups where session_id=s.id and status in ('waiting','confirmed') and user_id<>auth.uid() loop
    perform notify_add(recipient,'모임 정보가 변경됐어요',gym_name||' 모임의 장소·일정·참가 조건을 확인해주세요.','/session?id='||s.id);
  end loop;
  return json_build_object('ok',true,'id',s.id);
end;
$$;

-- Previously published media stays immutable and private, including after a replacement.
-- This also preserves URLs referenced by existing moderation evidence.
create table public.post_video_revisions (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null, video_path text not null, thumbnail_path text not null,
  saved_at timestamptz not null default now()
);
create index post_video_revisions_video_idx on public.post_video_revisions(video_path);
create index post_video_revisions_thumbnail_idx on public.post_video_revisions(thumbnail_path);
alter table public.post_video_revisions enable row level security;
revoke all on public.post_video_revisions from public,anon,authenticated;

create or replace function public.community_media_readable(p_path text) returns boolean
language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and (
    exists(select 1 from app_admins where user_id=auth.uid())
    or exists(select 1 from posts p where (p.video_path=p_path or p.thumbnail_path=p_path)
      and p.deleted_at is null and (p.author_id is null or not blocked_with(p.author_id)))
    or (split_part(p_path,'/',1)=auth.uid()::text
      and not exists(select 1 from posts where video_path=p_path or thumbnail_path=p_path)
      and not exists(select 1 from post_video_revisions where video_path=p_path or thumbnail_path=p_path))
  );
$$;
create or replace function public.community_media_unattached(p_path text) returns boolean
language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and split_part(p_path,'/',1)=auth.uid()::text
    and not exists(select 1 from posts where video_path=p_path or thumbnail_path=p_path)
    and not exists(select 1 from post_video_revisions where video_path=p_path or thumbnail_path=p_path);
$$;

create function public.video_post_update(
  p_post uuid, p_expected_updated_at timestamptz, p_body text, p_video text, p_thumbnail text
) returns json language plpgsql security definer set search_path=public as $$
declare p posts; b text:=btrim(p_body); prefix text;
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  select * into p from posts where id=p_post for update;
  if not found or p.author_id is distinct from auth.uid() or p.video_path is null or p.deleted_at is not null then
    return json_build_object('error','not_mine'); end if;
  if not my_participation_profile_ready() then return json_build_object('error','profile_incomplete'); end if;
  if coalesce(char_length(b),0) not between 1 and 3000 then return json_build_object('error','empty'); end if;
  if p_video is null or p_thumbnail is null then return json_build_object('error','bad_media'); end if;
  if row(p.body,p.video_path,p.thumbnail_path) is not distinct from row(b,p_video,p_thumbnail) then
    return json_build_object('ok',true,'id',p.id); end if;
  if p.updated_at is distinct from p_expected_updated_at then return json_build_object('error','conflict'); end if;
  prefix:='^'||auth.uid()::text||'/'||p.id::text||'/revisions/[0-9a-f-]{36}/';
  if p_video<>p.video_path then
    if p_thumbnail=p.thumbnail_path or p_video !~ (prefix||'video\.(mp4|mov|webm)$') then return json_build_object('error','bad_media'); end if;
    if not exists(select 1 from storage.objects where bucket_id='community-videos' and name=p_video
      and metadata->>'mimetype' in ('video/mp4','video/quicktime','video/webm')
      and (metadata->>'size')::bigint between 1 and 52428800) then return json_build_object('error','bad_media'); end if;
  end if;
  if p_thumbnail<>p.thumbnail_path then
    if p_thumbnail !~ (prefix||'thumbnail.jpg$') or not exists(select 1 from storage.objects
      where bucket_id='community-videos' and name=p_thumbnail and metadata->>'mimetype'='image/jpeg'
        and (metadata->>'size')::bigint between 1 and 5242880) then return json_build_object('error','bad_media'); end if;
  end if;
  if exists(select 1 from post_video_revisions where
    (p_video<>p.video_path and video_path=p_video) or (p_thumbnail<>p.thumbnail_path and thumbnail_path=p_thumbnail)) then
    return json_build_object('error','bad_media'); end if;
  insert into post_video_revisions(post_id,body,video_path,thumbnail_path) values(p.id,p.body,p.video_path,p.thumbnail_path);
  update posts set body=b,title=left(b,80),video_path=p_video,thumbnail_path=p_thumbnail,updated_at=clock_timestamp() where id=p.id;
  return json_build_object('ok',true,'id',p.id);
end;
$$;

revoke all on function public.session_edit_detail(uuid), public.session_update(uuid,integer,text,uuid,timestamptz,timestamptz,integer,integer,integer,integer,integer,text),
  public.video_post_update(uuid,timestamptz,text,text,text) from public,anon;
grant execute on function public.session_edit_detail(uuid), public.session_update(uuid,integer,text,uuid,timestamptz,timestamptz,integer,integer,integer,integer,integer,text),
  public.video_post_update(uuid,timestamptz,text,text,text) to authenticated;
commit;
