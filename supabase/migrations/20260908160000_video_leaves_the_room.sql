-- ═══════════════════════════════════════════════════════════════
--  영상은 커뮤니티로 간다 — 모임 진행 화면과 영상 크레딧을 없앤다
-- ═══════════════════════════════════════════════════════════════
-- 등반 영상을 올리는 자리가 두 곳이었다.
--
--   모임 진행 화면(/room)  나만 보는 영상 · 모임당 1회 +2크레딧
--   커뮤니티 영상 피드백    남에게 보여주고 답을 받는다
--
-- 영상을 올리는 이유는 피드백을 받으려는 것이지 크레딧을 받으려는 게
-- 아니다. 커뮤니티가 그 일을 하고 있으므로 모임 쪽 영상은 존재 이유가
-- 없어졌다 (2026-09 결정). 크레딧 적립도 같이 없앤다 — 남겨두면
-- "아무도 안 보는 영상을 올려서 돈을 버는" 경로만 남는다.
--
-- 진행 화면 자체도 지운다. 남아 있던 세 덩어리 중
--   워밍업 가이드    안내 문구였고, 앱은 설명하지 않기로 했다
--   함께하는 사람    모임 상세의 참가 현황이 이미 같은 걸 보여준다
--   영상 인증        이 마이그레이션이 없앤다
-- 셋 다 사라지면 화면에 남는 게 없다.
--
-- 저장소(mission-videos 버킷)의 파일은 건드리지 않는다. 여기서 지우면
-- 되돌릴 수 없고, 대시보드에서 언제든 비울 수 있다. 앱에서는 이
-- 마이그레이션 이후로 닿지 않는다.

-- ───────────────────────────────────────────────────────────────
--  1. 크레딧 — 영상 적립을 뺀다
-- ───────────────────────────────────────────────────────────────
-- ⚠️ 20260902120000 의 본문에서 session_video 줄만 지웠다.
--    옛 원장에는 session_video 적립 행이 그대로 남는다 (역사는 지우지
--    않는다). 화면은 CREDIT_LABELS 로 계속 이름을 붙여 보여준다.

create or replace function credit_rule(p_reason text) returns int
  language sql immutable as $$
  select case p_reason
    when 'early_bird'       then 50   -- 사전 가입 (가입 보너스 위에 얹는다)
    when 'profile_complete' then 30   -- 가입 보너스
    when 'request_extra'    then -10  -- 채팅 신청 1회
    when 'request_refund'   then 10   -- 채팅 신청 반환 (거절·만료)
    when 'session_join'     then 0    -- 모임 신청 무료 (2026-09-02)
    when 'session_refund'   then 0    -- 반환액은 원장 집계가 정한다
    when 'mission_video'    then 0
    when 'mission_done'     then 0
    else 0
  end $$;

revoke execute on function credit_rule(text) from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────
--  2. 내 영상 = 내가 커뮤니티에 올린 영상
-- ───────────────────────────────────────────────────────────────
-- 내 정보의 "내 영상" 은 모임에 올린 영상을 세고 있었다. 그 개념이
-- 사라졌으니 같은 이름이 커뮤니티 영상을 가리키게 한다.
--
-- video_post_list 를 그대로 두고 새 이름으로 만든다. 인자를 더해
-- 하나로 합치면 오버로드가 생기고, 폰에 이미 깔린 앱이 어느 쪽을
-- 부를지 모호해진다.
--
-- 차단은 반대로 본다. 목록에서는 "내가 차단한 사람의 영상" 을 감췄지만
-- 여기 나오는 건 전부 내 영상이라 감출 게 없다. 좋아요·댓글 수는
-- 목록과 같은 잣대로 센다 — 차단한 사람이 남긴 것은 빼고 센다.

create or replace function my_video_posts(
  p_before timestamptz default null, p_before_id uuid default null,
  p_limit int default 12)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select p.id, p.title, left(p.body,140) as preview, p.author_id, pr.nickname, pr.photo,
      p.created_at, true as mine, p.thumbnail_path,
      (select count(*) from post_comments c where c.post_id = p.id and c.deleted_at is null
        and (c.author_id is null or not blocked_with(c.author_id)))::int as comment_count,
      (select count(*) from post_likes l where l.post_id = p.id and not blocked_with(l.user_id))::int as like_count
    from posts p left join profiles pr on pr.id = p.author_id
    where p.video_path is not null and p.deleted_at is null
      and p.author_id = auth.uid()
      and (p_before is null or p.created_at < p_before
        or (p.created_at = p_before and p.id < p_before_id))
    order by p.created_at desc, p.id desc limit greatest(1,least(coalesce(p_limit,12),30))
  ) t;
$$;

-- 내 정보의 숫자 한 칸. 목록을 다 받아서 세면 30개에서 잘린다.
create or replace function my_video_count()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from posts
   where video_path is not null and deleted_at is null
     and author_id = auth.uid();
$$;

revoke execute on function my_video_posts(timestamptz,uuid,int), my_video_count()
  from public, anon;
grant  execute on function my_video_posts(timestamptz,uuid,int), my_video_count()
  to authenticated;

-- ───────────────────────────────────────────────────────────────
--  3. 모임 진행 화면과 모임 영상을 지운다
-- ───────────────────────────────────────────────────────────────
-- session_room 은 진행 화면 하나만 쓰던 함수다. 화면이 없어지면 부르는
-- 곳이 없다. 채팅방의 신고 대상 고르기는 session_members 로 옮겼다 —
-- 어차피 이름만 쓰던 자리라 진행 화면만큼 넓게 볼 이유가 없었다.

drop function if exists session_room(uuid);
drop function if exists session_video_add(uuid, text);
drop function if exists session_video_delete(uuid);
drop function if exists my_videos();

-- 표는 마지막에 지운다 — 위 함수들이 참조하고 있었다.
drop table if exists session_videos;

-- 최종선택(selection_submit·my_matches)은 그대로 둔다. 화면에서는
-- 2026-08 에 이미 빠졌고 이번 변경과는 다른 이야기다.
