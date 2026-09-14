-- Older installed bundles still call these retired read-only endpoints.
-- Return the old empty shapes without restoring credits, missions or proposals.
-- New video posts continue to use my_video_posts; do not expose retired media.
begin;
create or replace function public.my_credits()
returns json language sql stable security invoker set search_path = public as $$
  select '{"balance":0,"history":[],"retired":true}'::json;
$$;
create or replace function public.my_videos()
returns json language sql stable security invoker set search_path = public as $$
  select '[]'::json;
$$;
create or replace function public.my_confirm_proposals()
returns json language sql stable security invoker set search_path = public as $$
  select '[]'::json;
$$;
revoke all on function public.my_credits(), public.my_videos(), public.my_confirm_proposals() from public, anon;
grant execute on function public.my_credits(), public.my_videos(), public.my_confirm_proposals() to authenticated;
comment on function public.my_credits() is 'Deprecated compatibility response only. No balance ledger or rewards.';
comment on function public.my_videos() is 'Deprecated mission-video list. Current posts use my_video_posts.';
comment on function public.my_confirm_proposals() is 'Deprecated confirmation workflow, always empty.';
notify pgrst, 'reload schema';
commit;
