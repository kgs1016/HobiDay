-- ═══════════════════════════════════════════════════════════════
--  Gym Master 연결 — 기존 모임 backfill + RPC 가 gym_id 를 알게 한다
-- ═══════════════════════════════════════════════════════════════
-- 앞선 두 마이그레이션(테이블 · seed 200곳)의 마무리.
--
--  1) 기존 sessions.gym 문자열을 master 에 연결한다 (gym_id backfill)
--  2) session_create 가 gym_id 를 받는다 (안 주면 예전 그대로 동작)
--  3) session_list / session_detail 이 gym_id 와 대표사진을 내려준다
--
-- sessions.gym 문자열은 계속 남는다. 표시 이름은 master 가 있으면
-- master 의 canonical name, 없으면 legacy 문자열 — 어느 쪽도 빈칸이
-- 되지 않는다.

-- ── 1. backfill ────────────────────────────────────────────────
-- 정확 일치만 연결한다. 비슷한 이름이라는 이유로 다른 지점에 붙이는
-- 순간 과거 모임 기록이 거짓말이 된다 — fuzzy 매칭은 하지 않는다.
--
-- 우선순위:
--   ① gyms.name 과 정확 일치
--   ② gyms.aliases 와 정확 일치
--   ③ 옛 하드코딩 GYMS 상수 ↔ canonical 명시 매핑 (아래 표)
--
-- 후보가 둘 이상이면 연결하지 않고 수동 검토로 남긴다.

-- ① 이름 정확 일치 (후보가 하나일 때만)
update sessions s
   set gym_id = (select g.id from gyms g where g.name = s.gym)
 where s.gym_id is null
   and (select count(*) from gyms g where g.name = s.gym) = 1;

-- ② 별칭 정확 일치 (후보가 하나일 때만)
update sessions s
   set gym_id = (select g.id from gyms g where s.gym = any(coalesce(g.aliases, '{}')))
 where s.gym_id is null
   and (select count(*) from gyms g where s.gym = any(coalesce(g.aliases, '{}'))) = 1;

-- ③ 옛 하드코딩 GYMS 상수 → canonical 명시 매핑.
--    같은 곳이 분명한 표기 차이("~점"/"~센터" 유무)만 사람 손으로 짝지었다.
--    '더월클라이밍 연남' 은 넣지 않는다 — 더클라임 연남점의 옛 상호와
--    비슷하지만 같은 곳이라고 단정할 근거가 없어 수동 검토로 남긴다.
update sessions s
   set gym_id = g.id
  from (values
    ('더클라임 B홍대', 'GYM-B40823BB80D7'),   -- 더클라임 B홍대점
    ('더클라임 연남',  'GYM-AB18BE72D536'),   -- 더클라임 연남점
    ('써미트클라이밍', 'GYM-74AFFBBDA7B9'),   -- 써미트클라이밍센터
    ('홍대클라이밍',   'GYM-48356429175C')    -- 홍대클라이밍센터
  ) m(legacy_name, import_key)
  join gyms g on g.import_key = m.import_key
 where s.gym_id is null
   and s.gym = m.legacy_name;

-- 매핑 안 된 legacy 문자열은 지우지도, 실패시키지도 않는다.
-- 적용 로그에 notice 로 남기고, 언제든 아래 쿼리로 다시 볼 수 있다:
--   select gym, count(*) from sessions where gym_id is null group by 1 order by 2 desc;
do $$
declare r record; n int := 0;
begin
  for r in
    select s.gym, count(*) as cnt
      from sessions s where s.gym_id is null
     group by s.gym order by cnt desc
  loop
    raise notice 'gym backfill 수동 검토 필요: "%" (모임 %건)', r.gym, r.cnt;
    n := n + 1;
  end loop;
  if n = 0 then
    raise notice 'gym backfill: 모든 세션이 master 에 연결됐습니다';
  end if;
end $$;


-- ── 2. session_create — gym_id 를 받는다 ───────────────────────
-- 시그니처가 바뀌므로 옛 것을 지운다 (인자 기본값 덕에 예전 앱의
-- 10·11개 인자 호출도 이 함수 하나로 들어온다).
drop function if exists session_create(text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,text);

create or replace function session_create(
  p_gym text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_capacity int, p_level_min int, p_level_max int,
  p_age_min int, p_age_max int,
  p_after_meal boolean, p_note text,
  p_gender_mode text default 'balanced',
  -- master 에서 고른 암장. 안 주면 예전처럼 p_gym 자유입력으로 동작한다
  -- (마이그레이션 전에 배포된 앱 호환).
  p_gym_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; sid uuid; mg gyms;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  if p_gender_mode not in ('balanced','any') then
    return json_build_object('error','bad_mode');
  end if;
  -- 정원의 뜻이 모드마다 다르니 범위도 따로 본다
  if p_gender_mode = 'balanced' and p_capacity not in (1,2) then
    return json_build_object('error','bad_capacity');
  end if;
  if p_gender_mode = 'any' and p_capacity not between 2 and 4 then
    return json_build_object('error','bad_capacity');
  end if;

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

  -- master 암장을 골랐다면 실재하고 운영 중인지 확인하고,
  -- gym 문자열에는 canonical name 을 담는다. source of truth 는 gym_id 지만
  -- 옛 화면들(my_hosted_sessions·채팅 목록 등)은 아직 문자열을 읽는다.
  if p_gym_id is not null then
    select * into mg from gyms where id = p_gym_id and is_active;
    if not found then return json_build_object('error','bad_gym'); end if;
  end if;

  insert into sessions (host_id, gym, gym_id, starts_at, ends_at, capacity, gender_mode,
                        level_min, level_max, age_min, age_max,
                        after_meal, note)
  values (me.id, coalesce(mg.name, p_gym), p_gym_id,
          p_starts_at, p_ends_at, p_capacity, p_gender_mode,
          p_level_min, p_level_max, p_age_min, p_age_max,
          p_after_meal, nullif(trim(p_note), ''))
  returning id into sid;

  insert into signups (session_id, user_id, gender, status)
  values (sid, me.id, me.gender, 'confirmed');

  return json_build_object('id', sid);
end; $$;

revoke execute on function session_create(text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,text,uuid) from public, anon;
grant  execute on function session_create(text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,text,uuid) to authenticated;


-- ── 3. 목록·상세가 master 를 같이 내려준다 ─────────────────────
-- gym 필드는 coalesce(master name, legacy 문자열) — gym_id 가 없는
-- 과거 모임도 이름이 그대로 나온다. gym_thumb 은 대표사진이 채워지기
-- 전까지 전부 null 이고, 화면은 null 이면 placeholder 를 그린다.

create or replace function session_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t) order by t.starts_at), '[]'::json) from (
    select s.id,
           coalesce(mg.name, s.gym) as gym,
           s.gym_id,
           mg.thumbnail_url as gym_thumb,
           s.starts_at, s.ends_at, s.capacity, s.gender_mode,
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
      left join gyms mg on mg.id = s.gym_id
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
    select s.id,
           coalesce(mg.name, s.gym) as gym,
           s.gym_id,
           mg.thumbnail_url as gym_thumb,
           s.starts_at, s.ends_at, s.capacity, s.gender_mode,
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
      left join gyms mg on mg.id = s.gym_id
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

-- 시그니처가 그대로라 grant 도 그대로 유지되지만, 관례대로 명시한다
revoke execute on function session_list()        from public, anon;
revoke execute on function session_detail(uuid)  from public, anon;
grant  execute on function session_list(), session_detail(uuid) to authenticated;
