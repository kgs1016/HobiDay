-- 마이그레이션 적용 뒤 실행. 모든 테스트 데이터와 변경은 끝에서 롤백한다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

insert into auth.users(id) values
 ('e62d20b3-df31-4fa3-801d-425ccabb0001'), ('e62d20b3-df31-4fa3-801d-425ccabb0002');
insert into profiles(id,nickname,gender,age,level,is_public) values
 ('e62d20b3-df31-4fa3-801d-425ccabb0001','video-test-author','m',25,1,false),
 ('e62d20b3-df31-4fa3-801d-425ccabb0002','video-test-reader','f',25,1,false);
insert into storage.objects(bucket_id,name,metadata) values
 ('community-videos','e62d20b3-df31-4fa3-801d-425ccabb0001/e62d20b3-df31-4fa3-801d-425ccabb0010/video.mp4','{"mimetype":"video/mp4","size":100}'),
 ('community-videos','e62d20b3-df31-4fa3-801d-425ccabb0001/e62d20b3-df31-4fa3-801d-425ccabb0010/thumbnail.jpg','{"mimetype":"image/jpeg","size":100}');

set local role authenticated;
select set_config('request.jwt.claim.sub','e62d20b3-df31-4fa3-801d-425ccabb0001',true);
do $$
declare r json; pid uuid := 'e62d20b3-df31-4fa3-801d-425ccabb0010';
  v text := 'e62d20b3-df31-4fa3-801d-425ccabb0001/e62d20b3-df31-4fa3-801d-425ccabb0010/video.mp4';
  t text := 'e62d20b3-df31-4fa3-801d-425ccabb0001/e62d20b3-df31-4fa3-801d-425ccabb0010/thumbnail.jpg';
begin
  r := video_post_create(pid,'마지막 발 피드백',v,t);
  assert (r->>'ok')::boolean, 'create';
  assert video_post_create(pid,'마지막 발 피드백',v,t)->>'id' = pid::text, 'idempotent publish';
  assert post_detail(pid)->>'video_path' = v, 'detail includes video';
  assert exists(select 1 from json_array_elements(video_post_list()) x where x->>'id' = pid::text), 'video in feed';
  assert not exists(select 1 from json_array_elements(post_list()) x where x->>'id' = pid::text), 'video excluded from board';
  assert not community_media_unattached(v), 'published video cannot be removed';
  assert not has_function_privilege('anon','video_post_create(uuid,text,text,text)','execute'), 'anonymous create denied';
  assert not has_function_privilege('anon','video_post_list(timestamptz,uuid,integer)','execute'), 'anonymous list denied';
  assert not has_function_privilege('anon','video_like_set(uuid,boolean)','execute'), 'anonymous like denied';
end $$;

select set_config('request.jwt.claim.sub','e62d20b3-df31-4fa3-801d-425ccabb0002',true);
do $$
declare r json; pid uuid := 'e62d20b3-df31-4fa3-801d-425ccabb0010'; v text;
begin
  select post_detail(pid)->>'video_path' into v;
  assert community_media_readable(v), 'reader media access';
  assert exists(select 1 from storage.objects where bucket_id = 'community-videos' and name = v), 'storage RLS read';
  assert not community_media_unattached(v), 'other user cannot delete media';
  r := video_post_create('e62d20b3-df31-4fa3-801d-425ccabb0020','stolen',v,replace(v,'video.mp4','thumbnail.jpg'));
  assert r->>'error' = 'bad_media', 'foreign upload rejected';
  r := video_like_set(pid,true);
  assert (r->>'like_count')::int = 1, 'like added';
  r := video_like_set(pid,true);
  assert (r->>'like_count')::int = 1, 'like idempotent';
  r := video_like_set(pid,false);
  assert (r->>'like_count')::int = 0, 'like removed';
  r := comment_create(pid,'오른발을 먼저 옮겨보세요');
  assert (r->>'ok')::boolean, 'comment';
  assert json_array_length(post_detail(pid)->'comments') = 1, 'comment visible';
  assert post_delete(pid)->>'error' = 'not_mine', 'foreign delete denied';
  r := report_user('e62d20b3-df31-4fa3-801d-425ccabb0001','abuse',null,'post',pid);
  assert (r->>'ok')::boolean, 'report and block';
  assert post_detail(pid) is null, 'blocked detail hidden';
  assert not community_media_readable(v), 'blocked media denied';
  assert not exists(select 1 from storage.objects where bucket_id = 'community-videos' and name = v), 'blocked storage hidden';
  assert not exists(select 1 from json_array_elements(video_post_list()) x where x->>'id' = pid::text), 'blocked feed hidden';
  assert video_like_set(pid,true)->>'error' = 'not_found', 'blocked like denied';
  assert comment_create(pid,'blocked')->>'error' = 'blocked', 'blocked comment denied';
end $$;

reset role;
do $$ begin
  assert exists(select 1 from report_evidence e join reports r on r.id = e.report_id
    where r.ref_id = 'e62d20b3-df31-4fa3-801d-425ccabb0010' and e.media->>'video_path' is not null), 'video evidence retained';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','e62d20b3-df31-4fa3-801d-425ccabb0001',true);
do $$ begin
  assert (post_delete('e62d20b3-df31-4fa3-801d-425ccabb0010')->>'ok')::boolean, 'owner soft delete';
  assert post_detail('e62d20b3-df31-4fa3-801d-425ccabb0010') is null, 'deleted detail hidden';
  assert not community_media_readable('e62d20b3-df31-4fa3-801d-425ccabb0001/e62d20b3-df31-4fa3-801d-425ccabb0010/video.mp4'), 'deleted media hidden';
end $$;
rollback;
