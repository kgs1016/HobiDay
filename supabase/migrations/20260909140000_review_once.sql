-- ═══════════════════════════════════════════════════════════════
--  리뷰는 한 번만 · 받아도 알리지 않는다 · 사진은 로그인하면 누구나
-- ═══════════════════════════════════════════════════════════════
-- 20260909120000 바로 뒤의 손질 (2026-09 결정).
--
--   · 한 사람에게 리뷰를 남기면 끝이다. 고쳐 쓰거나 지우지 못하고, 그
--     사람은 리뷰 작성 목록에서 빠진다. 남길 사람이 다 빠진 모임은 목록
--     에서 통째로 빠진다.
--   · 리뷰를 받았다고 알리지 않는다. 프로필에서 보면 된다.
--   · 프로필 사진은 로그인한 사람이면 누구나 본다. 소개팅 앱이던 시절
--     "관계가 있는 사이만" 으로 좁혀둔 정책인데, 이제 프로필 자체가
--     profile_visible 로 열리고 리뷰 카드에 글쓴이 얼굴이 뜨는 자리까지
--     생겨서 사진만 따로 막을 이유가 없다. 차단한 사람은 프로필·리뷰
--     어디에서도 안 보이니 사진이 열려 있어도 닿을 길이 없다.

-- ───────────────────────────────────────────────────────────────
--  1. 쓰기 — 한 번만, 알림 없이
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260909120000 의 review_submit 본문을 옮겨 적고 세 군데를 바꿨다:
-- 이미 있으면 'done', 빈 리뷰는 'empty', 알림 줄 삭제.

create or replace function review_submit(
  p_session uuid, p_target uuid, p_liked boolean, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); s sessions; body_ text;
begin
  if me_id is null then return json_build_object('error','auth'); end if;
  if p_target = me_id then return json_build_object('error','self'); end if;

  select * into s from sessions where id = p_session;
  if not found or not review_window_open(s) then
    return json_build_object('error','closed');
  end if;
  if not attended(p_session, me_id) or not attended(p_session, p_target) then
    return json_build_object('error','not_member');
  end if;
  if blocked_with(p_target) then return json_build_object('error','blocked'); end if;
  if not exists (select 1 from profiles where id = p_target) then
    return json_build_object('error','left');
  end if;
  if exists (select 1 from reviews
              where session_id = p_session and author_id = me_id and target_id = p_target) then
    return json_build_object('error','done');
  end if;

  body_ := nullif(left(trim(coalesce(p_body,'')), 300), '');
  if not coalesce(p_liked,false) and body_ is null then
    return json_build_object('error','empty');
  end if;

  insert into reviews (session_id, author_id, target_id, liked, body)
  values (p_session, me_id, p_target, coalesce(p_liked,false), body_);

  return json_build_object('ok', true);
end $$;

revoke execute on function review_submit(uuid,uuid,boolean,text) from public, anon;
grant  execute on function review_submit(uuid,uuid,boolean,text) to authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 작성 목록 — 이미 남긴 사람은 빠진다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ review_session_json · my_review_sessions 본문을 옮겨 적었다.
-- people 에서 내가 이미 남긴 사람을 빼고, 남길 사람이 없는 모임은 목록에서 뺀다.

create or replace function review_session_json(s sessions)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id',        s.id,
    'gym',       s.gym,
    'starts_at', s.starts_at,
    'ends_at',   s.ends_at,
    'until',     s.ends_at + interval '7 days',
    'open',      review_window_open(s),
    'people',    coalesce((
      select json_agg(row_to_json(m) order by m.is_host desc, m.nickname) from (
        select p.id, p.nickname, p.photo,
               (p.id = s.host_id) as is_host
          from signups g
          join profiles p on p.id = g.user_id
         where g.session_id = s.id
           and g.status = 'confirmed'
           and p.id <> auth.uid()
           and not blocked_with(p.id)
           and not exists (select 1 from reviews r
                            where r.session_id = s.id
                              and r.author_id = auth.uid()
                              and r.target_id = p.id)
      ) m), '[]'::json));
$$;

revoke execute on function review_session_json(sessions) from public, anon, authenticated;

create or replace function my_review_sessions()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(review_session_json(s) order by s.ends_at desc), '[]'::json)
    from sessions s
   where auth.uid() is not null
     and review_window_open(s)
     and attended(s.id, auth.uid())
     -- 아직 리뷰를 안 남긴 사람이 하나라도 있어야 목록에 뜬다
     and exists (select 1 from signups g
                  where g.session_id = s.id and g.status = 'confirmed'
                    and g.user_id <> auth.uid()
                    and not blocked_with(g.user_id)
                    and not exists (select 1 from reviews r
                                     where r.session_id = s.id
                                       and r.author_id = auth.uid()
                                       and r.target_id = g.user_id));
$$;

revoke execute on function my_review_sessions() from public, anon;
grant  execute on function my_review_sessions() to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3. 사진은 로그인하면 누구나
-- ───────────────────────────────────────────────────────────────
-- 20260830130000 의 여섯 갈래짜리 정책을 한 줄로 갈아끼운다.
-- 쓰기(insert/update/delete) 정책은 건드리지 않는다 — 본인 폴더만 그대로.

drop policy if exists "profile photos: read public" on storage.objects;
create policy "profile photos: read public" on storage.objects
  for select to authenticated
  using (bucket_id = 'profile-photos');
