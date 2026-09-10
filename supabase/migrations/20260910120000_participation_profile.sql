-- Browse freely; require only nickname, gender, career and selected shoe when creating or joining.
-- Photos, age and self-reported skill remain optional. Existing content is retained.
begin;

create function public.my_participation_profile_ready() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid()
      and length(btrim(nickname)) > 0 and gender in ('m','f') and career between 1 and 6
      and exists(select 1 from public.climbing_shoe_starts where user_id = profiles.id)
  )
$$;
revoke all on function public.my_participation_profile_ready() from public, anon;
grant execute on function public.my_participation_profile_ready() to authenticated;

create function public.require_participation_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Trusted service maintenance has no user identity. Table/RPC permissions still
  -- deny anonymous writes; security-definer RPCs retain the caller's auth.uid().
  if auth.uid() is not null and not public.my_participation_profile_ready() then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.require_participation_profile() from public, anon, authenticated;

create trigger participation_session_create before insert on public.sessions
for each row execute function public.require_participation_profile();
create trigger participation_signup_create before insert on public.signups
for each row execute function public.require_participation_profile();
-- session_join can reuse a cancelled signup. Cancellation/withdrawal stays available.
create trigger participation_signup_rejoin before update of status on public.signups
for each row when (new.status = 'waiting' and old.status is distinct from new.status)
execute function public.require_participation_profile();
create trigger participation_request_create before insert on public.requests
for each row execute function public.require_participation_profile();
create trigger participation_post_create before insert on public.posts
for each row execute function public.require_participation_profile();
create trigger participation_post_edit before update of title, body on public.posts
for each row when (new.title is distinct from old.title or new.body is distinct from old.body)
execute function public.require_participation_profile();
create trigger participation_comment_create before insert on public.post_comments
for each row execute function public.require_participation_profile();
create trigger participation_comment_edit before update of body on public.post_comments
for each row when (new.body is distinct from old.body)
execute function public.require_participation_profile();

-- Check NEW values so completing and publishing in the same save succeeds.
update public.profiles set is_public = false
where is_public and (not coalesce(length(btrim(nickname)) > 0 and gender in ('m','f') and career between 1 and 6, false)
  or not exists(select 1 from public.climbing_shoe_starts where user_id = profiles.id));
alter table public.profiles add constraint profiles_public_needs_basic_info
check (not is_public or coalesce(length(btrim(nickname)) > 0 and gender in ('m','f') and career between 1 and 6, false));

-- A separate trigger checks the selected shoe without a cross-table CHECK.
create function public.require_public_profile_shoe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_public and not exists(select 1 from public.climbing_shoe_starts where user_id = new.id) then
    raise exception 'profile_incomplete' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.require_public_profile_shoe() from public, anon, authenticated;
create trigger participation_profile_publish before insert or update of is_public on public.profiles
for each row execute function public.require_public_profile_shoe();

-- Block media upload before publishing, but leave profile-photo uploads and
-- removal of unattached media available for completion and cleanup.
drop policy if exists "community media insert" on storage.objects;
create policy "community media insert" on storage.objects for insert to authenticated
with check (bucket_id = 'community-videos' and (storage.foldername(name))[1] = auth.uid()::text
  and public.my_participation_profile_ready());
commit;
