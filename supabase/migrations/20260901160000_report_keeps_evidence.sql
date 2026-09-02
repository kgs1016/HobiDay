-- ═══════════════════════════════════════════════════════════════
--  신고 증거는 접수 순간에 떠 둔다 — 나중에 지워져도 남게
-- ═══════════════════════════════════════════════════════════════
-- 신고를 확인하러 갔을 때 볼 것이 없을 수 있다.
--
--   · 1:1 방은 둘 다 나가면 대화가 완전히 지워진다 (유저에게 약속된 동작)
--   · 탈퇴는 cascade 로 매칭·메시지를 데려간다 — 신고당한 쪽에게는
--     탈퇴가 증거인멸 버튼이 된다
--   · 프로필(사진·정보 불일치 신고의 증거)은 즉시 고치거나 지울 수 있다
--
-- 삭제 경로마다 "신고된 방은 예외" 를 심는 대신, 접수 순간에 복사해 둔다.
-- "나가면 완전히 지워져요" 는 그대로 지키고, 보존은 신고 건에 한해
-- 별도 테이블에서 한다. 약관 5조에 보존 문구를 같이 넣었다 (web).
--
--   · 대상 프로필 스냅샷 — 전 신고 공통. survey 는 뺀다 (판단에 불필요)
--   · 채팅·모임 신고면 그 방의 최근 대화 100줄 (보낸 사람 닉네임 포함 —
--     닉네임도 바뀌거나 사라질 수 있는 값이라 같이 뜬다)
--
-- 접수 때 한 번 뜨고 끝이라 이후 무엇이 지워져도 영향이 없다.
-- 기각한 신고의 증거를 지우고 싶으면 (대시보드에서, 필요할 때):
--   delete from report_evidence e using reports r
--    where r.id = e.report_id and r.status = 'dismissed';

create table if not exists report_evidence (
  report_id      uuid primary key references reports(id) on delete cascade,
  target_profile jsonb,   -- 신고 시점의 대상 프로필 (survey 제외)
  messages       jsonb,   -- 신고된 방의 최근 대화 (오래된 것부터, 최대 100줄)
  captured_at    timestamptz default now()
);

alter table report_evidence enable row level security;
-- 정책 없음 = 직접 접근 차단. 운영자는 대시보드로 본다.

-- ⚠️ report_user 를 다시 정의한다 — 20260901153000 의 본문(운영자 알림)을
--    그대로 들고 오고 증거 스냅샷만 얹었다.

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

  if rid is not null then
    select nickname into t_name from profiles where id = p_target;

    -- 증거 스냅샷 — 같은 트랜잭션이라 접수와 함께 뜨거나 함께 안 뜬다
    insert into report_evidence (report_id, target_profile, messages)
    values (
      rid,
      (select to_jsonb(p) - 'survey' from profiles p where id = p_target),
      case
        when p_ref is null then null
        when coalesce(p_context, 'profile') = 'chat' then
          (select jsonb_agg(row_to_json(m)::jsonb order by m.created_at)
             from (select x.sender_id, pr.nickname, x.kind, x.body, x.created_at
                     from messages x
                     left join profiles pr on pr.id = x.sender_id
                    where x.match_id = p_ref
                    order by x.created_at desc
                    limit 100) m)
        when coalesce(p_context, 'profile') = 'session' then
          (select jsonb_agg(row_to_json(m)::jsonb order by m.created_at)
             from (select x.sender_id, pr.nickname, x.kind, x.body, x.created_at
                     from messages x
                     left join profiles pr on pr.id = x.sender_id
                    where x.session_id = p_ref
                    order by x.created_at desc
                    limit 100) m)
        else null
      end
    );

    -- 새로 접수된 경우에만 운영자를 부른다 (같은 대상 재신고는 조용히).
    -- 푸시에는 사유·맥락·대상만 싣는다 — 신고자를 폰 화면에 띄울 이유가 없다.
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
