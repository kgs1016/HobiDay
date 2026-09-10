begin;
insert into community_articles(kind,external_id,title,published_at,hidden) values
 ('news','date-test-before','before','2020-01-01 14:59:59+00',false),
 ('news','date-test-start','start','2020-01-01 15:00:00+00',false),
 ('news','date-test-end','end','2020-01-02 14:59:59+00',false),
 ('news','date-test-next','next','2020-01-02 15:00:00+00',false),
 ('news','date-test-hidden','hidden','2020-01-02 00:00:00+00',true),
 ('competition','date-test-competition','competition','2020-01-02 00:00:00+00',false);
insert into community_articles(kind,external_id,title,published_at)
 select 'news','date-test-new-'||n,'recent',now() from generate_series(1,70) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','aa000000-0000-4000-8000-000000000001',true);
do $$ declare page json; next_page json; begin
 assert not has_function_privilege('anon','community_news_feed(date,timestamptz,uuid,integer)','execute');
 page:=community_news_feed('2020-01-02');
 assert json_array_length(page)=2, 'KST day boundary, hidden and competition filters';
 assert page->0->>'title'='end' and page->1->>'title'='start', 'date filtering happens before limit';
 page:=community_news_feed('2020-01-02',null,null,1);
 next_page:=community_news_feed('2020-01-02',(page->0->>'published_at')::timestamptz,(page->0->>'id')::uuid,1);
 assert next_page->0->>'title'='start';
 assert json_array_length(community_news_feed('2019-01-02'))=0;
 page:=community_news_feed(null,null,null,1);
 next_page:=community_news_feed(null,(page->0->>'published_at')::timestamptz,(page->0->>'id')::uuid,1);
 assert page->0->>'id'<>next_page->0->>'id', 'equal timestamps page by UUID';
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin assert json_array_length(community_news_feed())=0; end $$;
reset role;
rollback;
