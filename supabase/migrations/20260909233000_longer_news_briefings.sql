-- 뉴스 상세에서 여러 문단을 읽을 수 있도록 운영자 입력 한도를 늘린다.
-- 기존 열·목록·상세 RPC를 유지해 구버전 앱과도 호환된다.
create or replace function community_article_upsert(p json)
returns json language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  if not is_app_admin() then return json_build_object('error','not_admin'); end if;
  if coalesce(p->>'external_id','') = '' or coalesce(p->>'title','') = '' then
    return json_build_object('error','bad_input');
  end if;

  insert into community_articles
    (kind, external_id, title, summary, url, source, image_url, location,
     starts_at, ends_at, published_at, hidden)
  values
    (coalesce(p->>'kind','competition'), p->>'external_id', left(p->>'title', 200),
     left(p->>'summary', 2000), p->>'url', p->>'source', p->>'image_url',
     p->>'location', (p->>'starts_at')::date, (p->>'ends_at')::date,
     coalesce((p->>'published_at')::timestamptz, now()),
     coalesce((p->>'hidden')::boolean, false))
  on conflict (external_id) do update set
    kind = excluded.kind, title = excluded.title, summary = excluded.summary,
    url = excluded.url, source = excluded.source, image_url = excluded.image_url,
    location = excluded.location, starts_at = excluded.starts_at,
    ends_at = excluded.ends_at, published_at = excluded.published_at,
    hidden = excluded.hidden, updated_at = now()
  returning id into rid;

  return json_build_object('ok', true, 'id', rid);
end; $$;
revoke execute on function community_article_upsert(json) from public, anon;
grant  execute on function community_article_upsert(json) to authenticated;
