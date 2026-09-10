-- 신규 모임과 정원 변경은 호스트 포함 2~6명으로 제한한다.
-- 기존 7~8명 모임은 참가자/기록을 보존하고 상태 변경·탈퇴 처리를 막지 않는다.
begin;

create or replace function public.sessions_limit_new_capacity()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op = 'UPDATE' then
    if new.capacity is not distinct from old.capacity then return new; end if;
  end if;
  if new.capacity is null or new.capacity not between 2 and 6 then
    raise exception '모임 정원은 2~6명입니다' using errcode='check_violation';
  end if;
  return new;
end $$;
revoke all on function public.sessions_limit_new_capacity() from public,anon,authenticated;
create trigger sessions_limit_new_capacity before insert or update of capacity on public.sessions
for each row execute function public.sessions_limit_new_capacity();

create or replace function session_create(
  p_gym text, p_starts_at timestamptz, p_ends_at timestamptz,
  p_capacity int, p_level_min int, p_level_max int,
  p_age_min int, p_age_max int,
  p_after_meal boolean, p_note text,
  -- master 에서 고른 암장. 안 주면 예전처럼 p_gym 자유입력으로 동작한다
  p_gym_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me profiles; sid uuid; mg gyms;
begin
  select * into me from profiles where id = auth.uid();
  if not found then return json_build_object('error','no_profile'); end if;

  -- 정원은 총 인원 하나뿐이다. 혼자는 모임이 아니라서 2부터 시작한다.
  if p_capacity is null or p_capacity not between 2 and 6 then
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

  insert into sessions (host_id, gym, gym_id, starts_at, ends_at, capacity,
                        level_min, level_max, age_min, age_max,
                        after_meal, note)
  values (me.id, coalesce(mg.name, p_gym), p_gym_id,
          p_starts_at, p_ends_at, p_capacity,
          p_level_min, p_level_max, p_age_min, p_age_max,
          p_after_meal, nullif(trim(p_note), ''))
  returning id into sid;

  -- 호스트는 자기 모임의 첫 확정 인원이다 (정원 안에 든다)
  insert into signups (session_id, user_id, gender, status)
  values (sid, me.id, me.gender, 'confirmed');

  return json_build_object('id', sid);
end; $$;

revoke execute on function session_create(
  text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,uuid) from public, anon;
grant execute on function session_create(
  text,timestamptz,timestamptz,int,int,int,int,int,boolean,text,uuid) to authenticated;

commit;
