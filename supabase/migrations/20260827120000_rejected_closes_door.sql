-- ═══════════════════════════════════════════════════════════════
--  거절된 신청은 문이 닫힌다 · 받은 신청함도 24시간
-- ═══════════════════════════════════════════════════════════════
-- ① session_detail 이 "취소한 신청이 아니면" 을 관계자 조건으로 썼다.
--    거절(cut)도 그 그물에 걸려서, 거절당한 사람이 그 모임의 상세를
--    언제든 열 수 있었다. 시작했든 끝났든 상관없이.
--
--    관계자는 아직 자리가 걸려 있는 사람이다 — 대기 중이거나 확정된
--    사람. 거절된 뒤에는 남들과 같은 문으로만 들어온다(살아 있고 아직
--    시작 안 한 모임). 다시 신청하고 싶으면 그 길이 열려 있다.
--
-- ② 받은 신청함만 3시간이 남아 있었다. 보낸 신청은 24시간으로 옮겼는데
--    여기를 빠뜨렸다. 같은 화면의 두 탭이 다른 시계를 봤다.

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
                       and g.status in ('waiting','confirmed'))
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

revoke execute on function session_detail(uuid) from public, anon;
grant  execute on function session_detail(uuid) to authenticated;


create or replace function my_hosted_requests()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at), '[]'::json) from (
    select s.id as session_id, s.gym, s.starts_at, s.capacity,
           g.created_at,
           p.id as user_id, p.nickname, p.age, p.gender, p.level, p.career,
           p.height, p.home_gym, p.area, p.mbti, p.intro, p.photo,
           (select count(*) from signups x
             where x.session_id = s.id and x.gender = p.gender
               and x.status = 'confirmed') as same_gender_confirmed
      from signups g
      join sessions s on s.id = g.session_id
      join profiles p on p.id = g.user_id
     where s.host_id = auth.uid()
       and g.status = 'waiting'
       and s.status in ('open','confirmed')
       and s.starts_at > now() - interval '24 hours'
       and not blocked_with(p.id)
  ) t;
$$;

revoke execute on function my_hosted_requests() from public, anon;
grant  execute on function my_hosted_requests() to authenticated;
