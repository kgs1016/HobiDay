-- 라운지 뉴스 상세. 원문 복제 없이 기존 운영 요약과 출처를 앱에서 읽는다.
-- 최근 목록의 개수 제한과 별개로 조회하되 비공개·삭제된 글은 노출하지 않는다.
create or replace function public.community_news_detail(p_article uuid)
returns json
language sql stable security definer set search_path = public as $$
  select row_to_json(article) from (
    select id, kind, title, summary, url, source, image_url, location,
           starts_at, ends_at, published_at
      from public.community_articles
     where id = p_article
       and kind = 'news'
       and not hidden
       and auth.uid() is not null
  ) article;
$$;

revoke execute on function public.community_news_detail(uuid) from public, anon;
grant execute on function public.community_news_detail(uuid) to authenticated;
