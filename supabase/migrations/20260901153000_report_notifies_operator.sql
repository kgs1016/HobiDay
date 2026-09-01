-- ═══════════════════════════════════════════════════════════════
--  신고가 들어오면 운영자 폰이 울리게
-- ═══════════════════════════════════════════════════════════════
-- 신고는 reports 에만 쌓이고 접수 사실을 알 길이 없었다. 애플 심사 1.2 에
-- "24시간 내 조치" 로 답해둔 앱이, 정작 접수를 운영자의 확인 루틴에만
-- 기대고 있었다 — 확인을 잊는 날이 곧 약속이 깨지는 날이다.
--
-- notifications 는 발송 대기열이다 (20260829140000). pushed_at 없이 넣으면
-- 1분 크론이 폰으로 보낸다. 그래서 신고 접수 때 운영자 알림함에 한 줄 넣는
-- 것으로 끝난다 — 클라이언트 개입도, 관계 검사(can_notify)도 타지 않는다.
-- (신고자와 운영자는 아무 관계가 아니라서 앱 경유 푸시로는 못 간다.)
--
-- 운영자 명단은 app_admins 에 둔다 (app_testers 와 같은 꼴).
--
-- ── 운영 SQL (대시보드 SQL Editor, 한 번) ───────────────────────
--
--   insert into app_admins (user_id, note)
--   values ((select id from profiles where nickname = '<내 닉네임>'), '운영자')
--   on conflict do nothing;

create table if not exists app_admins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  note       text,
  created_at timestamptz default now()
);

alter table app_admins enable row level security;
-- 정책 없음 = 직접 접근 차단. 서버 함수만 읽는다.

-- ⚠️ report_user 를 다시 정의한다 — 20260825320000 의 본문(차단은
--    block_user 경유)을 그대로 들고 오고, 접수 알림만 얹었다.

create or replace function report_user(
  p_target  uuid,
  p_reason  text,
  p_detail  text default null,
  p_context text default 'profile',
  p_ref     uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me_id uuid := auth.uid(); rid uuid; t_name text; a uuid;
begin
  if me_id is null then return json_build_object('error','no_auth'); end if;
  if p_target = me_id then return json_build_object('error','self'); end if;
  if not exists (select 1 from profiles where id = p_target) then
    return json_build_object('error','not_found');
  end if;

  insert into reports (reporter_id, target_id, reason, detail, context, ref_id)
  values (me_id, p_target, p_reason, nullif(trim(p_detail), ''),
          coalesce(p_context, 'profile'), p_ref)
  on conflict do nothing   -- 이미 처리 대기 중인 신고가 있으면 그대로 둔다
  returning id into rid;

  -- 새로 접수된 경우에만 운영자를 부른다 (같은 대상 재신고는 조용히).
  -- 푸시에는 사유·맥락·대상만 싣는다 — 신고자를 폰 화면에 띄울 이유가 없다.
  if rid is not null then
    select nickname into t_name from profiles where id = p_target;
    for a in select user_id from app_admins loop
      perform notify_add(
        a,
        '🚨 새 신고',
        '사유: '
          || case p_reason
               when 'abuse'      then '욕설·괴롭힘'
               when 'sexual'     then '성적 불쾌감'
               when 'fake'       then '사진·정보 불일치'
               when 'commercial' then '광고·영업'
               when 'noshow'     then '노쇼'
               else '기타' end
          || ' · '
          || case coalesce(p_context, 'profile')
               when 'chat' then '채팅' when 'session' then '모임'
               else '프로필' end
          || ' · 대상: ' || coalesce(t_name, '(알 수 없음)'),
        null);
    end loop;
  end if;

  /* 차단 행을 직접 넣지 않는다. block_user 가 방을 정리하고 모임에서
     갈라놓는 일까지 맡으므로, 신고와 차단이 같은 길을 타야 한다. */
  return block_user(p_target);
end; $$;

revoke execute on function report_user(uuid,text,text,text,uuid) from public, anon;
grant  execute on function report_user(uuid,text,text,text,uuid) to authenticated;
