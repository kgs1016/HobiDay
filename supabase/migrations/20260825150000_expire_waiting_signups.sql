-- ═══════════════════════════════════════════════════════════════
--  모임이 시작되면 승인 안 된 신청은 자동 반환
-- ═══════════════════════════════════════════════════════════════
-- 모임 신청은 10크레딧을 미리 낸다. 돌려받는 길은 셋이었다.
--
--   호스트가 거절     session_reject  → 반환
--   호스트가 모임 삭제 session_delete  → 전원 반환
--   본인이 취소       session_cancel  → 대기 중이면 반환
--
-- 빠진 경우가 하나 있다: 호스트가 아무것도 안 하고 모임이 그냥 시작됐다.
-- 신청자는 계속 '승인 대기' 로 남고 10크레딧은 아무도 안 돌려준다.
-- 본인이 취소를 눌러야만 받는데, 그럴 이유를 알 방법이 없다.
--
-- 시작한 모임의 대기 신청은 더 이상 승인될 수 없다 (session_approve 는
-- 여전히 되지만 들어가 봐야 이미 시작한 모임이다). 거절과 같은 처리를
-- 한다 — 'cut' 으로 바꾸고 신청비를 돌려준다.
--
-- 취소된 모임도 같이 훑는다. session_delete 가 이미 반환하지만,
-- session_fee_refund 가 중복 반환을 막아주므로 안전망으로 둔다.

create or replace function signups_expire()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select g.session_id, g.user_id
      from signups g
      join sessions s on s.id = g.session_id
     where g.status = 'waiting'
       and (s.starts_at <= now() or s.status = 'cancelled')
  loop
    perform session_fee_refund(r.session_id, r.user_id);
    update signups set status = 'cut'
     where session_id = r.session_id and user_id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke execute on function signups_expire() from public, anon, authenticated;

-- 10분마다. 관심 만료(하루 한 번)보다 촘촘한 이유: 이건 "7일 뒤" 가
-- 아니라 "방금 시작했다" 라, 신청자가 곧바로 신청함을 열어본다.
-- jobname 이 같으면 갱신이라 몇 번 돌려도 안전하다.
create extension if not exists pg_cron;
select cron.schedule('signups-expire', '*/10 * * * *',
                     'select public.signups_expire()');

-- 크론이 돌기 전에 화면을 열 수도 있다. 목록에서는 시작한 모임의
-- 'waiting' 을 'cut' 으로 보여준다 — 실제 반환은 크론이 하고,
-- 여기서는 "승인 대기" 라고 잘못 말하지 않는 것이 목적이다.
--
-- ⚠️ 아래는 20260821110000 의 본문을 그대로 들고 온 뒤 status 한 줄만
--    바꿨다. create or replace 는 통째로 갈아치운다.

create or replace function my_signups()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity, s.status as session_status,
           -- 시작한 모임의 대기 신청은 이미 끝난 것이다 (크론이 곧 반환한다)
           case when g.status = 'waiting' and s.starts_at <= now()
                then 'cut' else g.status end as my_status,
           h.nickname as host_nickname, h.photo as host_photo
      from signups g
      join sessions s on s.id = g.session_id
      left join profiles h on h.id = s.host_id
     where g.user_id = auth.uid()
       and g.status <> 'cancelled'
       and s.host_id <> auth.uid()
       and s.starts_at > now() - interval '7 days'
       and (s.host_id is null or not blocked_with(s.host_id))
  ) t;
$$;
revoke execute on function my_signups() from public, anon;
grant execute on function my_signups() to authenticated;
