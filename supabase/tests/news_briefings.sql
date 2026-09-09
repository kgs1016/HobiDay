begin;
insert into auth.users(id) values ('e9091000-0000-4000-8000-000000000001');
insert into profiles(id,nickname,gender,age,is_public)
values ('e9091000-0000-4000-8000-000000000001','briefing-admin','m',25,false);
insert into app_admins(user_id) values ('e9091000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','e9091000-0000-4000-8000-000000000001',true);
do $$
declare r json; id uuid; body text := repeat('뉴스 본문 ', 200);
begin
  assert not has_function_privilege('anon','community_article_upsert(json)','execute');
  r := community_article_upsert(json_build_object(
    'kind','news','external_id','test:long-briefing','title','긴 뉴스',
    'summary',body,'url','https://example.com/news'));
  assert r->>'ok'='true';
  id := (r->>'id')::uuid;
  assert community_news_detail(id)->>'summary'=body, 'more than 600 characters survive the admin RPC and detail read';
  r := community_article_upsert(json_build_object(
    'kind','news','external_id','test:long-briefing','title','긴 뉴스',
    'summary',body,'hidden',true));
  assert community_news_detail(id) is null, 'hidden news remains inaccessible';
  r := community_article_upsert(json_build_object(
    'kind','news','external_id','test:long-briefing','title','긴 뉴스',
    'summary',repeat('가',2100)));
  assert char_length(community_news_detail(id)->>'summary')=2000, 'admin input remains bounded';
end $$;
select set_config('request.jwt.claim.sub','e9091000-0000-4000-8000-000000000002',true);
do $$ begin
  assert community_article_upsert(json_build_object('title','bad','external_id','bad'))->>'error'='not_admin';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  assert community_article_upsert(json_build_object('title','bad','external_id','bad'))->>'error'='no_auth';
end $$;
reset role;
rollback;
