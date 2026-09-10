-- 로그인과 앱 이용에 프로필 작성을 요구하지 않는다.
-- 미입력 나이/성별을 추정하지 않고, 사진은 앱 번들의 기본 아바타로 표시한다.
begin;

alter table public.profiles alter column gender drop not null;
alter table public.profiles alter column age drop not null;
alter table public.signups alter column gender drop not null;
alter table public.profiles drop constraint if exists profiles_public_needs_photo;

-- 미선택 → 첫 선택은 허용한다. 이미 직접 선택한 성별의 기존 정책은 유지한다.
create or replace function public.profiles_gender_is_fixed()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.gender is not null and new.gender is distinct from old.gender then
    raise exception '성별은 바꿀 수 없어요' using errcode='check_violation';
  end if;
  return new;
end $$;

create or replace function public.profiles_default_avatar()
returns trigger language plpgsql set search_path=public as $$
begin
  if nullif(trim(new.photo),'') is null or new.photo in (
    '/images/avatars/member-man.svg', '/images/avatars/member-woman.svg', '/images/avatars/member-neutral.svg'
  ) then
    new.photo := case new.gender
      when 'm' then '/images/avatars/member-man.svg'
      when 'f' then '/images/avatars/member-woman.svg'
      else '/images/avatars/member-neutral.svg' end;
  end if;
  return new;
end $$;
revoke all on function public.profiles_default_avatar() from public,anon,authenticated;
create trigger profiles_default_avatar before insert or update of photo,gender on public.profiles
for each row execute function public.profiles_default_avatar();

-- 기존 사진/공개 여부를 보존하고 사진 없는 계정에만 기본 아바타를 적용한다.
update public.profiles set photo=null where nullif(trim(photo),'') is null;

create or replace function public.create_optional_member_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,nickname,gender,age,level,is_public)
    values(new.id,'클라이머-' || left(new.id::text,8),null,null,null,false)
    on conflict(id) do nothing;
  return new;
end $$;
revoke all on function public.create_optional_member_profile() from public,anon,authenticated;
create trigger auth_user_optional_profile after insert on auth.users
for each row execute function public.create_optional_member_profile();

-- 이전 가입자도 별도 입력 없이 기존 FK 기반 모임/게시글/영상 기능을 이용한다.
insert into public.profiles(id,nickname,gender,age,level,is_public)
select u.id,'클라이머-' || left(u.id::text,8),null,null,null,false
from auth.users u where not exists(select 1 from public.profiles p where p.id=u.id)
on conflict(id) do nothing;

-- 프로필만 삭제된 계정의 복구. 타인 ID/인적 정보/공개 여부는 인자로 받지 않는다.
create or replace function public.ensure_my_profile()
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); result jsonb;
begin
  if me is null or not exists(select 1 from auth.users where id=me) then return null; end if;
  insert into public.profiles(id,nickname,gender,age,level,is_public)
    values(me,'클라이머-' || left(me::text,8),null,null,null,false)
    on conflict(id) do nothing;
  select to_jsonb(p) into result from public.profiles p where id=me;
  return result;
end $$;
revoke all on function public.ensure_my_profile() from public,anon;
grant execute on function public.ensure_my_profile() to authenticated;

commit;
