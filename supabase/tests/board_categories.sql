begin;
set local statement_timeout='30s';
insert into auth.users(id) values
 ('b0a4d000-0000-4000-8000-000000000001'),('b0a4d000-0000-4000-8000-000000000002');
insert into profiles(id,nickname,gender,age,is_public) values
 ('b0a4d000-0000-4000-8000-000000000001','board-owner','m',25,false),
 ('b0a4d000-0000-4000-8000-000000000002','board-reader','f',25,false);
-- 기존 앱의 글은 기본값 board로 보존한다.
insert into posts(id,author_id,title,body,created_at) values
 ('b0a4d000-0000-4000-8000-000000000011','b0a4d000-0000-4000-8000-000000000001','기존 글','기존 내용',now()-interval '1 day');
insert into posts(id,author_id,title,body,category,created_at) values
 ('b0a4d000-0000-4000-8000-000000000012','b0a4d000-0000-4000-8000-000000000001','장비 A','A','gear',now()-interval '1 day'),
 ('b0a4d000-0000-4000-8000-000000000013','b0a4d000-0000-4000-8000-000000000001','장비 B','B','gear',now()-interval '1 day');
insert into posts(id,author_id,title,body,video_path,thumbnail_path,created_at) values
 ('b0a4d000-0000-4000-8000-000000000014','b0a4d000-0000-4000-8000-000000000001','영상','영상 내용','category-test/video.mp4','category-test/thumbnail.jpg',now()-interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub','b0a4d000-0000-4000-8000-000000000001',true);
do $$
declare r json; first_page json; next_page json; id uuid;
begin
  assert not has_table_privilege('authenticated','posts','UPDATE');
  assert not has_function_privilege('anon','post_list_by_category(text,timestamptz,uuid,integer)','execute');
  assert not has_function_privilege('anon','post_create_in_category(text,text,text)','execute');
  assert post_detail('b0a4d000-0000-4000-8000-000000000011')->>'category'='board';
  assert not exists(select 1 from json_array_elements(post_list()) p where p->>'category' <> 'board');
  assert not exists(select 1 from json_array_elements(post_list()) p where p->>'id'='b0a4d000-0000-4000-8000-000000000014');
  first_page:=post_list_by_category('gear',null,null,1);
  assert first_page->0->>'id'='b0a4d000-0000-4000-8000-000000000013';
  next_page:=post_list_by_category('gear',(first_page->0->>'created_at')::timestamptz,(first_page->0->>'id')::uuid,1);
  assert next_page->0->>'id'='b0a4d000-0000-4000-8000-000000000012', 'timestamp tie cursor';
  assert json_array_length(post_list_by_category('unknown'))=0;
  assert post_create_in_category('bad','body','news')->>'error'='invalid_category';
  assert post_create_in_category('bad','body',null)->>'error'='invalid_category';
  assert post_create_in_category('','body','gear')->>'error'='empty';
  r:=post_create_in_category('새 장비 추천','써본 후기','gear');
  assert r->>'ok'='true';
  id:=(r->>'id')::uuid;
  assert post_detail(id)->>'category'='gear';
  assert not exists(select 1 from json_array_elements(post_list()) p where p->>'id'=id::text), 'gear never in legacy list';
  assert post_create_in_category('너무 빠름','내용','board')->>'error'='too_fast', 'rate limit shared across categories';
  assert post_update(id,'수정한 후기','수정')->>'ok'='true';
  assert post_detail(id)->>'category'='gear', 'edit preserves category';
  assert comment_create(id,'댓글')->>'ok'='true';
  assert json_array_length(post_detail(id)->'comments')=1;
  assert post_delete(id)->>'ok'='true';
  assert post_detail(id) is null;
end $$;
select set_config('request.jwt.claim.sub','b0a4d000-0000-4000-8000-000000000002',true);
do $$ begin
  assert post_update('b0a4d000-0000-4000-8000-000000000012','침입','침입')->>'error'='not_mine';
  assert post_delete('b0a4d000-0000-4000-8000-000000000012')->>'error'='not_mine';
  assert post_detail('b0a4d000-0000-4000-8000-000000000014')->>'video_path'='category-test/video.mp4';
end $$;
reset role;
insert into blocks(blocker_id,blocked_id) values
 ('b0a4d000-0000-4000-8000-000000000001','b0a4d000-0000-4000-8000-000000000002');
set local role authenticated;
do $$ begin
  assert not exists(select 1 from json_array_elements(post_list_by_category('board')) p where p->>'author_id'='b0a4d000-0000-4000-8000-000000000001');
  assert json_array_length(post_list_by_category('gear'))=0;
  assert post_detail('b0a4d000-0000-4000-8000-000000000012') is null;
  assert comment_create('b0a4d000-0000-4000-8000-000000000012','차단 댓글')->>'error'='blocked';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert json_array_length(post_list_by_category())=0;
  assert post_create_in_category('제목','내용','gear')->>'error'='no_auth';
end $$;
reset role;
rollback;
