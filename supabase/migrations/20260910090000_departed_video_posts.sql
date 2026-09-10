-- 탈퇴한 작성자의 영상은 공개하지 않는다. auth.users 삭제 → profiles 삭제 →
-- posts.author_id SET NULL 경로와 관리자 직접 프로필 삭제를 모두 처리한다.
-- 기존 게시물 삭제와 동일한 soft delete로 목록/상세/댓글/좋아요/Storage 접근을
-- 차단한다. 비공개 신고 증거와 이미 발급된 서명 URL의 만료 정책은 유지한다.
begin;

create or replace function public.hide_departed_video_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.video_path is not null and new.author_id is null then
    new.deleted_at := coalesce(new.deleted_at, now());
  end if;
  return new;
end;
$$;
revoke all on function public.hide_departed_video_post() from public, anon, authenticated;

drop trigger if exists posts_hide_departed_video on public.posts;
create trigger posts_hide_departed_video
before insert or update on public.posts
for each row execute function public.hide_departed_video_post();

-- 이미 탈퇴했지만 남아 있는 영상도 정리한다. 일반 게시글 정책은 변경하지 않는다.
update public.posts set deleted_at = now()
where author_id is null and video_path is not null and deleted_at is null;

alter table public.posts drop constraint if exists posts_departed_video_hidden;
alter table public.posts add constraint posts_departed_video_hidden
check (video_path is null or author_id is not null or deleted_at is not null);

commit;
