-- Participation, registration and event schedules belong in competition.
-- These three news previews already have visible competition counterparts.
-- Keep news rows for audit/history, but remove them from the news feed.
begin;
lock table public.community_articles in share row exclusive mode;
do $$
begin
  if (
    select count(*) from public.community_articles
    where kind = 'competition' and not hidden and external_id in (
      'curated:competition:cl-youth-6-20260927',
      'curated:competition:busan-geumjeong-37-boulder-20261025',
      'curated:worldclimbing:asia-gunsan-2026'
    )
  ) <> 3 then
    raise exception 'All three competition counterparts must be visible';
  end if;
end $$;
update public.community_articles
set hidden = true, updated_at = now()
where kind = 'news' and not hidden and external_id in (
  'curated:news:cl-youth-6-preview-20260923',
  'curated:news:busan-geumjeong-37-preview-20260923',
  'curated:news:world-climbing-asia-gunsan-preview-20260923'
);
commit;
