-- 한국 날짜 기준 뉴스 조회. 날짜를 먼저 제한한 뒤 최신순 커서 페이지를 적용한다.
create function community_news_feed(p_date date default null, p_before timestamptz default null,
 p_before_id uuid default null, p_limit integer default 20)
returns json language sql stable security definer set search_path=public as $$
 select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
  select id,kind,title,summary,url,source,image_url,location,starts_at,ends_at,published_at
  from community_articles
  where auth.uid() is not null and kind='news' and not hidden
    and (p_date is null or (published_at >= (p_date::timestamp at time zone 'Asia/Seoul')
      and published_at < ((p_date+1)::timestamp at time zone 'Asia/Seoul')))
    and (p_before is null or (published_at,id) < (p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by published_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),100))
 ) t;
$$;
revoke all on function community_news_feed(date,timestamptz,uuid,integer) from public,anon;
grant execute on function community_news_feed(date,timestamptz,uuid,integer) to authenticated;
