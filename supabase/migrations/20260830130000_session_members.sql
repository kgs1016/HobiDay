-- ═══════════════════════════════════════════════════════════════
--  참여자 공개 — 모임 상세에 호스트만이 아니라 참가자도 보여준다
-- ═══════════════════════════════════════════════════════════════
-- 지금까지 모임 상세는 "남 확정 · 여 모집중" 같은 익명 칸만 그렸고,
-- 얼굴과 이름은 호스트 하나뿐이었다 (20260816103000_session_host).
-- 그때의 근거는 "모임을 여는 행위 자체가 공개" 였는데, 신청하는 쪽도
-- 사실상 같다 — 누가 있는지 모르는 채로 10크레딧을 걸라는 게 더 이상하다.
--
-- 공개 범위를 정하면서 지킨 것 셋:
--
--  1. 확정된 사람만 보여준다. 승인 대기 중인 신청자까지 넣으면, 어제
--     있던 이름이 오늘 없는 것으로 "호스트가 거절했다" 가 드러난다.
--     거절은 당사자끼리의 일이다. 대기 인원은 지금처럼 빈 칸으로 남는다.
--
--  2. 모임을 볼 수 있는 사람에게만 보여준다 — 잣대는 session_detail 을
--     그대로 빌려 쓴다. 여기서 조건을 새로 쓰면 언젠가 두 곳이 어긋나고,
--     어긋나는 쪽은 늘 "가려야 할 걸 보여주는" 쪽이다.
--     (차단 관계가 있으면 session_detail 이 모임을 통째로 가리므로,
--      명단에서 특정인만 소리 없이 빠지는 일은 생기지 않는다.)
--
--  3. 프로필의 일부만 내려준다. security definer 라 RLS 를 지나지
--     않으므로 내려줄 칸을 아래에서 직접 고른다 — 이메일·설문 같은 건
--     절대 넣지 않는다. 호스트에게 열어준 칸과 같은 칸이다.
--
-- 사람 찾기 공개 여부(is_public)와 무관하게 보인다. 호스트와 같은
-- 기준이다 — 사람 찾기에 나를 올릴지와, 내가 들어간 모임 안에서 누구와
-- 가는지는 다른 이야기다.

-- ───────────────────────────────────────────────────────────────
--  1. 명단
-- ───────────────────────────────────────────────────────────────
-- 호스트가 맨 앞, 그 뒤는 확정된 순서. 화면이 정렬을 다시 고민하지
-- 않도록 여기서 세워서 내려준다.

create or replace function session_members(p_session uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(
           json_agg(row_to_json(t) order by t.is_host desc, t.joined_at),
           '[]'::json)
    from (
      -- 호스트. 탈퇴하면 host_id 가 null 이 되고 이 줄이 통째로 빠진다
      select h.id, h.nickname, h.photo, h.gender, h.age, h.area, h.level,
             true as is_host, s.created_at as joined_at
        from sessions s
        join profiles h on h.id = s.host_id
       where s.id = p_session
      union all
      -- 확정된 참가자. 탈퇴하면 signups 행이 함께 지워진다 (on delete cascade)
      select p.id, p.nickname, p.photo, p.gender, p.age, p.area, p.level,
             false, g.created_at
        from signups g
        join profiles p on p.id = g.user_id
        join sessions s on s.id = g.session_id
       where g.session_id = p_session
         and g.status = 'confirmed'
         -- 호스트가 자기 모임에 신청하는 경로는 없지만, 생기더라도 두 번 안 뜬다
         and p.id is distinct from s.host_id
    ) t
   -- 모임을 볼 수 없으면 명단도 없다 (빈 배열로 나간다).
   -- 로그인 확인은 grant 로도 막히지만 함수가 스스로 지키게 둔다 —
   -- 나중에 누군가 anon 에 execute 를 열면 조용히 전부 새어 나간다.
   where auth.uid() is not null
     and session_detail(p_session) is not null;
$$;

-- ───────────────────────────────────────────────────────────────
--  2. 참여자 한 사람의 프로필
-- ───────────────────────────────────────────────────────────────
-- session_host 를 사람 단위로 넓힌 것이다. session_host 는 그대로 둔다 —
-- 이미 폰에 깔린 앱이 그걸 부르고 있다.
--
-- 프로필 id 로 아무나 조회하게 열지 않는다. "이 모임의 참여자" 로만 닿을
-- 수 있게 세션을 통해서만 받는다. 볼 수 있는 모임의 범위는 session_host
-- 와 같다 — 끝나고 일주일은 열어둔다. 다녀온 모임에서 만난 사람을 나중에
-- 다시 찾아볼 수 있어야 한다.

create or replace function session_member(p_session uuid, p_user uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare s sessions; p profiles;
begin
  if auth.uid() is null then return json_build_object('error','auth'); end if;

  /* 내가 확정으로 참가했던 모임이면 시간 제한이 없다. 매칭 기록은
     지난 모임을 언제까지고 보여주는 화면이라, 거기서 같이 간 사람을
     눌렀는데 "찾을 수 없어요" 가 뜨면 그 화면이 반쪽이 된다.
     구경만 하는 사람에게는 지금까지대로 일주일이다. */
  select * into s from sessions where id = p_session
     and (status in ('open','confirmed','done')
          and (starts_at > now() - interval '7 days'
               or exists (select 1 from signups g
                           where g.session_id = p_session
                             and g.user_id = auth.uid()
                             and g.status = 'confirmed')));
  if not found then return json_build_object('error','not_found'); end if;

  -- 이 모임의 호스트이거나 확정 참가자여야 한다
  if p_user is distinct from s.host_id
     and not exists (select 1 from signups g
                      where g.session_id = p_session
                        and g.user_id = p_user
                        and g.status = 'confirmed')
  then return json_build_object('error','not_found'); end if;

  -- 차단한 사이면 열지 않는다. 내가 호스트여도 마찬가지다 — 모임을
  -- 관리하는 것과 그 사람 프로필을 들여다보는 것은 다른 일이다.
  if blocked_with(p_user) then return json_build_object('error','not_found'); end if;

  select * into p from profiles where id = p_user;
  if not found then return json_build_object('error','left'); end if;

  return json_build_object(
    'id',       p.id,
    'nickname', p.nickname,
    'gender',   p.gender,
    'age',      p.age,
    'area',     p.area,
    'level',    p.level,
    'career',   p.career,
    'height',   p.height,
    'home_gym', p.home_gym,
    'mbti',     p.mbti,
    'intro',    p.intro,
    'photo',    p.photo,
    'is_host',  (p.id = s.host_id),
    -- 이 사람이 지금까지 연 모임 수 — 처음 여는 사람인지 판단이 된다
    'hosted',   (select count(*) from sessions t where t.host_id = p.id));
end $$;

-- ───────────────────────────────────────────────────────────────
--  3. 참여자 사진 읽기
-- ───────────────────────────────────────────────────────────────
-- 사진 버킷은 비공개라 서명 URL 을 만들 때 select 권한을 본다. 지금
-- 정책으로는 "사람 찾기에 안 올린 참가자" 의 얼굴이 제3자에게 안 뜬다 —
-- 명단에 이름만 있고 동그라미가 비는 사람이 생긴다. 호스트에게 열어준
-- 것과 같은 예외를 참가자에게도 준다.
--
-- 정책은 create 가 통째로 갈아치우므로 기존 분기를 그대로 옮겨 적고
-- 맨 아래 한 갈래만 더한다 (20260816223000_host_approval 의 것이 원본).

drop policy if exists "profile photos: read public" on storage.objects;
create policy "profile photos: read public" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from profiles
         where profiles.id::text = (storage.foldername(name))[1]
           and profiles.is_public
      )
      or exists (
        select 1 from sessions s
         where s.host_id::text = (storage.foldername(name))[1]
           and s.status in ('open','confirmed')
           and s.starts_at > now() - interval '3 hours'
      )
      or exists (
        select 1
          from signups them
          join signups me on me.session_id = them.session_id
         where them.user_id::text = (storage.foldername(name))[1]
           and them.status = 'confirmed'
           and me.user_id = auth.uid()
           and me.status = 'confirmed'
      )
      or exists (
        select 1 from signups g join sessions s on s.id = g.session_id
         where g.user_id::text = (storage.foldername(name))[1]
           and s.host_id = auth.uid()
      )
      -- ↓ 여기부터 새로 더한 갈래
      -- 열려 있는 모임의 확정 참가자 — 명단에 얼굴이 뜬다
      or exists (
        select 1 from signups g join sessions s on s.id = g.session_id
         where g.user_id::text = (storage.foldername(name))[1]
           and g.status = 'confirmed'
           and s.status in ('open','confirmed')
           and s.starts_at > now() - interval '3 hours'
      )
    )
  );

-- ───────────────────────────────────────────────────────────────
--  4. 권한
-- ───────────────────────────────────────────────────────────────

revoke execute on function session_members(uuid)      from public, anon;
revoke execute on function session_member(uuid, uuid) from public, anon;
grant  execute on function session_members(uuid), session_member(uuid, uuid)
  to authenticated;
