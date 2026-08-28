-- ═══════════════════════════════════════════════════════════════
--  모임 상세를 목록에서 떼어낸다
-- ═══════════════════════════════════════════════════════════════
-- 모임 상세 화면은 자기 데이터를 스스로 못 가져온다. session_list()
-- 전체를 받아서 그 안에서 id 로 찾아 쓴다. 그래서 목록이 감추는 모든
-- 모임은 상세도 못 연다 —
--
--   시작한 모임        대기 중인 신청자가 '참가 취소'(환불) 를 못 누른다
--   승인 0명인 모임     호스트가 '모임 삭제'(전원 환불) 를 못 누른다
--   지난 모임          매칭 기록에서 눌러도 볼 데가 없다
--
-- session_detail() 을 따로 둔다. 그러면 목록은 "지금 신청할 수 있는
-- 모임" 만 담으면 되고, 상세는 관계자에게 언제까지나 열려 있다.
--
--   session_list    시작 전 + 살아 있는 모임. 예외 없음
--   session_detail  관계자면 시각·상태 무관. 남이면 목록과 같은 조건
--
-- 신청 자체는 20260825120000 에서 이미 막았다 (session_join → 'started').
-- 상세가 열린다고 신청이 되는 건 아니다.
--
-- ⚠️ session_list 는 20260825120000 의 본문을 그대로 들고 온 뒤 where
--    한 덩어리만 바꿨다. create or replace 는 통째로 갈아치운다.

create or replace function session_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
           s.level_min, s.level_max, s.age_min, s.age_max,
           s.intensity, s.after_meal, s.note, s.status,
           s.host_id,
           h.nickname as host_nickname,
           h.photo    as host_photo,
           h.age      as host_age,
           h.area     as host_area,
           h.level    as host_level,
           (s.host_id = auth.uid()) as i_am_host,
           s.early_confirm_at,
           exists (select 1 from session_confirm_acks a
                    where a.session_id = s.id and a.user_id = auth.uid()) as my_ack,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed') as m_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed') as f_confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
     where s.status in ('open','confirmed')
       -- 시작하면 목록에서 뺀다. 예외 없다 — 관계자도 여기서는 안 본다.
       -- 대신 session_detail() 로 언제든 열 수 있다.
       and s.starts_at > now()
       -- 내 모임은 항상 — 안 보이면 삭제·관리(환불)를 못 한다.
       -- 남의 모임은 차단 관계가 있으면 감춘다.
       and (s.host_id = auth.uid()
         or ((s.host_id is null or not blocked_with(s.host_id))
             and not exists (
               select 1 from signups g
                where g.session_id = s.id and g.status = 'confirmed'
                  and blocked_with(g.user_id))))
  ) t;
$$;

create or replace function session_detail(p_session uuid)
returns json language sql stable security definer set search_path = public as $$
  select row_to_json(t) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
           s.level_min, s.level_max, s.age_min, s.age_max,
           s.intensity, s.after_meal, s.note, s.status,
           s.host_id,
           h.nickname as host_nickname,
           h.photo    as host_photo,
           h.age      as host_age,
           h.area     as host_area,
           h.level    as host_level,
           (s.host_id = auth.uid()) as i_am_host,
           s.early_confirm_at,
           exists (select 1 from session_confirm_acks a
                    where a.session_id = s.id and a.user_id = auth.uid()) as my_ack,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'm' and g.status = 'confirmed') as m_confirmed,
           (select count(*) from signups g
             where g.session_id = s.id and g.gender = 'f' and g.status = 'confirmed') as f_confirmed,
           (select g.status from signups g
             where g.session_id = s.id and g.user_id = auth.uid()) as my_status
      from sessions s
      left join profiles h on h.id = s.host_id
     where s.id = p_session
       -- 관계자(호스트·신청자)는 시각·상태와 무관하게 언제든 연다.
       -- 취소된 모임도 연다 — "취소됐어요" 를 보여줘야 하고, 환불 내역을
       -- 확인할 데가 여기뿐이다.
       -- 남은 시작 전이고 살아 있는 모임만.
       and (s.host_id = auth.uid()
         or exists (select 1 from signups g
                     where g.session_id = s.id and g.user_id = auth.uid()
                       and g.status <> 'cancelled')
         or (s.status in ('open','confirmed') and s.starts_at > now()))
       -- 차단 관계는 그대로 가린다 (내 모임은 예외 — 관리해야 하니까)
       and (s.host_id = auth.uid()
         or ((s.host_id is null or not blocked_with(s.host_id))
             and not exists (
               select 1 from signups g
                where g.session_id = s.id and g.status = 'confirmed'
                  and blocked_with(g.user_id))))
    limit 1
  ) t;
$$;

revoke execute on function session_list()            from public, anon;
revoke execute on function session_detail(uuid)      from public, anon;
grant execute on function session_list(), session_detail(uuid) to authenticated;
