begin;
insert into auth.users(id) values ('b0900000-0000-4000-8000-000000000001'),('b0900000-0000-4000-8000-000000000002');
insert into profiles(id,nickname,gender,age,is_public) values
 ('b0900000-0000-4000-8000-000000000001','topic-owner','m',25,false),
 ('b0900000-0000-4000-8000-000000000002','topic-other','f',25,false);
insert into posts(id,author_id,title,body,topic,pinned_rank,created_at) values
 ('b0900000-0000-4000-8000-000000000011','b0900000-0000-4000-8000-000000000002','오래된 공지','guide','daily',1,'2026-01-01'),
 ('b0900000-0000-4000-8000-000000000012','b0900000-0000-4000-8000-000000000002','의견 공지','feedback','daily',2,'2026-01-02'),
 ('b0900000-0000-4000-8000-000000000013','b0900000-0000-4000-8000-000000000001','일상','완등','daily',null,'2026-09-01'),
 ('b0900000-0000-4000-8000-000000000014','b0900000-0000-4000-8000-000000000001','질문 A',repeat('긴 본문 ',60)||'ABC% 내용 끝','question',null,'2026-09-01'),
 ('b0900000-0000-4000-8000-000000000015','b0900000-0000-4000-8000-000000000001','질문 B','찾기','question',null,'2026-09-01');
insert into posts(id,author_id,title,body,category) values
 ('b0900000-0000-4000-8000-000000000016','b0900000-0000-4000-8000-000000000001','장비','gear','gear');
insert into posts(id,author_id,title,body,video_path,thumbnail_path) values
 ('b0900000-0000-4000-8000-000000000017','b0900000-0000-4000-8000-000000000001','영상','video','v/video.mp4','v/thumb.jpg');
insert into posts(id,author_id,title,body,deleted_at) values
 ('b0900000-0000-4000-8000-000000000018','b0900000-0000-4000-8000-000000000001','삭제','deleted',now());
update posts set created_at=now()-interval '1 day'
 where id in ('b0900000-0000-4000-8000-000000000016','b0900000-0000-4000-8000-000000000017','b0900000-0000-4000-8000-000000000018');

set local role authenticated;
select set_config('request.jwt.claim.sub','b0900000-0000-4000-8000-000000000001',true);
do $$
declare r json; next_page json; id uuid;
begin
  assert not has_table_privilege('authenticated','posts','UPDATE'), 'members cannot self-pin';
  assert not has_function_privilege('anon','board_feed(text,text,timestamptz,uuid,integer)','execute');
  r:=board_feed();
  assert json_array_length(r->'pinned')=2;
  assert r->'pinned'->0->>'id'='b0900000-0000-4000-8000-000000000011', 'pin order ignores age';
  assert json_array_length(r->'items')=3, 'pins, gear, videos and deleted posts excluded';
  assert json_array_length(board_feed('question')->'items')=2;
  assert json_array_length(board_feed('gym')->'pinned')=2, 'empty filter keeps pins';
  assert json_array_length(board_feed(null,'missing')->'pinned')=2, 'search keeps pins';
  r:=board_feed(null,'abc%');
  assert json_array_length(r->'items')=1, 'search uses full body, ignores case and treats wildcards literally';
  assert r->'items'->0->>'id'='b0900000-0000-4000-8000-000000000014';
  assert json_array_length(board_feed(null,'%')->'items')=1;
  assert json_array_length(board_feed('daily','abc%')->'items')=0, 'topic and search combine';
  r:=board_feed('question',null,null,null,1);
  assert r->'items'->0->>'id'='b0900000-0000-4000-8000-000000000015';
  next_page:=board_feed('question',null,(r->'items'->0->>'created_at')::timestamptz,(r->'items'->0->>'id')::uuid,1);
  assert next_page->'items'->0->>'id'='b0900000-0000-4000-8000-000000000014', 'same timestamp cursor preserves every post';
  assert post_create_with_topic('제목','내용','board','unknown')->>'error'='invalid_topic';
  r:=post_create_with_topic('후기','암장 후기','board','gym');
  assert r->>'ok'='true';
  id:=(r->>'id')::uuid;
  assert post_detail(id)->>'topic'='gym';
  assert post_detail(id)->>'pinned_rank' is null;
  assert post_create_with_topic('도배','내용','board','daily')->>'error'='too_fast';
  assert post_update_with_topic(id,'후기 수정','내용','lost')->>'ok'='true';
  assert post_detail(id)->>'topic'='lost';
  assert post_update(id,'구버전 수정','내용')->>'ok'='true';
  assert post_detail(id)->>'topic'='lost', 'legacy edits preserve topic';
  assert post_update_with_topic('b0900000-0000-4000-8000-000000000011','침입','내용','gym')->>'error'='not_mine';
  assert post_detail('b0900000-0000-4000-8000-000000000011')->>'pinned_rank'='1';
  assert post_update_with_topic('b0900000-0000-4000-8000-000000000016','장비 수정','내용','question')->>'ok'='true';
  assert post_detail('b0900000-0000-4000-8000-000000000016')->>'category'='gear';
end $$;
reset role;
insert into blocks(blocker_id,blocked_id) values ('b0900000-0000-4000-8000-000000000001','b0900000-0000-4000-8000-000000000002');
set local role authenticated;
do $$ begin
  assert json_array_length(board_feed()->'pinned')=0, 'pins honor blocks';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert json_array_length(board_feed()->'pinned')=0;
  assert json_array_length(board_feed()->'items')=0;
end $$;
reset role;
rollback;
