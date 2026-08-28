-- ═══════════════════════════════════════════════════════════════
--  모임 강도(가볍게 / 빡세게) 를 걷어낸다
-- ═══════════════════════════════════════════════════════════════
-- 모임을 열 때 고르고, 카드·모임 정보·매칭 기록에 배지로 붙던 값이다.
-- 쓰지 않기로 했으니 흔적을 남기지 않는다 — 화면에서만 지우면 컬럼과
-- 함수 반환값이 남아서, 다음에 이 코드를 보는 사람이 "이건 왜 안 쓰지"
-- 를 되묻게 된다.
--
-- ⚠️ session_create 의 인자가 하나 줄어든다. 시그니처가 바뀌므로 예전
--    함수를 지우고 새로 만든다. 앱 배포와 이 SQL 사이에 틈이 생기면
--    그동안 "모임 만들기" 만 실패한다 (나머지 화면은 멀쩡하다).
--    둘을 붙여서 하면 된다.

drop function if exists session_create(text,timestamptz,timestamptz,int,int,int,int,int,text,boolean,text);

create or replace function session_create(
  p_gym text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_capacity int, p_level_min int, p_level_max int,
  p_age_min int, p_age_max int,
  p_after_meal boolean, p_note text)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; sid uuid;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  -- 지난 시각과 임박을 나눈다. 고쳐야 할 게 다르다 — 지난 건 잘못 고른
  -- 것이고, 임박은 제대로 골랐는데 규칙에 걸린 것이다.
  if p_starts_at < now() then
    return json_build_object('error','past');
  end if;
  -- 신청 · 호스트 승인 · 이동까지 최소한의 시간은 남겨둬야 한다
  if p_starts_at < now() + interval '30 minutes' then
    return json_build_object('error','too_soon');
  end if;
  -- 너무 먼 미래도 막는다 — 실수(연도 오타)로 2036년 모임이 생기는 것 방지
  if p_starts_at > now() + interval '90 days' then
    return json_build_object('error','too_far');
  end if;

  insert into sessions (host_id, gym, starts_at, ends_at, capacity,
                        level_min, level_max, age_min, age_max,
                        after_meal, note)
  values (me.id, p_gym, p_starts_at, p_ends_at, p_capacity,
          p_level_min, p_level_max, p_age_min, p_age_max,
          p_after_meal, nullif(trim(p_note), ''))
  returning id into sid;

  insert into signups (session_id, user_id, gender, status)
  values (sid, me.id, me.gender, 'confirmed');

  return json_build_object('id', sid);
end; $$;

revoke execute on function session_create(text,timestamptz,timestamptz,int,int,int,int,int,boolean,text) from public, anon;
grant  execute on function session_create(text,timestamptz,timestamptz,int,int,int,int,int,boolean,text) to authenticated;


create or replace function session_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
           s.level_min, s.level_max, s.age_min, s.age_max,
           s.after_meal, s.note, s.status,
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

revoke execute on function session_list() from public, anon;
grant  execute on function session_list() to authenticated;


create or replace function session_detail(p_session uuid)
returns json language sql stable security definer set search_path = public as $$
  select row_to_json(t) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
           s.level_min, s.level_max, s.age_min, s.age_max,
           s.after_meal, s.note, s.status,
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


create or replace function my_match_history()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at desc), '[]'::json) from (
    select s.id, s.gym, s.starts_at, s.ends_at, s.capacity,
           (s.host_id = auth.uid()) as i_am_host,
           (select count(*) from signups g2
             where g2.session_id = s.id and g2.status = 'confirmed') as members,
           coalesce((
             select json_agg(row_to_json(m) order by m.nickname) from (
               select p.id, p.nickname, p.gender, p.level, p.photo,
                      (p.id = s.host_id) as is_host
                 from signups g3
                 join profiles p on p.id = g3.user_id
                where g3.session_id = s.id
                  and g3.status = 'confirmed'
                  and p.id <> auth.uid()          -- 나는 명단에서 뺀다
                  and not blocked_with(p.id)
             ) m), '[]'::json) as people
      from sessions s
      join signups g on g.session_id = s.id and g.user_id = auth.uid()
     where g.status = 'confirmed'
       and s.status in ('confirmed','done')
       and s.ends_at < now()
     order by s.starts_at desc
     limit 200
  ) t;
$$;

revoke execute on function my_match_history() from public, anon;
grant  execute on function my_match_history() to authenticated;


create or replace function session_room(p_session uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare me profiles; s sessions; n int; mine boolean;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  select * into s from sessions where id = p_session;
  if not found then return json_build_object('error','not_found'); end if;

  select exists (
    select 1 from signups
     where session_id = p_session and user_id = me.id and status = 'confirmed'
  ) into mine;
  if not mine then return json_build_object('error','not_confirmed'); end if;

  -- 성비 기준 확정 인원. 0 이면 아직 상대가 없다.
  select least(
    (select count(*) from signups
      where session_id = p_session and gender = 'm' and status = 'confirmed'),
    (select count(*) from signups
      where session_id = p_session and gender = 'f' and status = 'confirmed')
  )::int into n;

  return json_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'gym', s.gym, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
      'capacity', s.capacity, 'after_meal', s.after_meal,
      'note', s.note),
    'me', jsonb_build_object('id', me.id, 'gender', me.gender, 'level', me.level),
    'matched', n,
    -- 확정된 참가자는 서로 프로필을 본다. 모임 목록은 여전히 블라인드다.
    'people', coalesce((
      select json_agg(row_to_json(t) order by t.gender, t.nickname) from (
        select p.id, p.nickname, p.age, p.gender, p.level, p.career, p.height,
               p.home_gym, p.area, p.mbti, p.intro, p.photo,
               (p.id = me.id) as is_me
          from signups g join profiles p on p.id = g.user_id
         where g.session_id = p_session and g.status = 'confirmed'
      ) t), '[]'::json),
    'videos', coalesce((
      select json_agg(row_to_json(v) order by v.created_at desc) from (
        select id, video_url, created_at
          from session_videos
         where session_id = p_session and user_id = me.id
      ) v), '[]'::json),
    -- 모임 시작 시각이 지나면 최종선택을 연다
    'selection_open', now() >= s.starts_at
  );
end; $$;

revoke execute on function session_room(uuid) from public, anon;
grant  execute on function session_room(uuid) to authenticated;


-- 함수가 더는 읽지 않으니 이제 컬럼을 뗀다
alter table sessions drop constraint if exists sessions_intensity_check;
alter table sessions drop column if exists intensity;
