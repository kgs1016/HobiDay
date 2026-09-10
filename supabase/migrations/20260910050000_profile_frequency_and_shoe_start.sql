-- 방문 빈도는 선택 정보다. 기존 회원의 값은 추정하지 않는다.
alter table profiles add column visit_frequency smallint
  check (visit_frequency between 1 and 4);

-- 기존 상세 프로필의 관계·차단 확인을 그대로 거친 뒤 빈도만 덧붙인다.
create function user_profile_v2(p_user uuid, p_session uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
  with original as materialized (select user_profile(p_user,p_session)::jsonb data)
  select case when data ? 'id' then data || jsonb_build_object('visit_frequency',
    (select p.visit_frequency from profiles p where p.id=(data->>'id')::uuid))
    else data end from original;
$$;
revoke all on function user_profile_v2(uuid,uuid) from public,anon;
grant execute on function user_profile_v2(uuid,uuid) to authenticated;

-- 시작 색은 프로필의 일반 upsert로 수정할 수 없는 별도 기록으로 보관한다.
create table climbing_shoe_starts (
  -- 프로필만 지웠다가 다시 만들어도 시작 선택 기회가 생기지 않는다.
  user_id uuid primary key references auth.users(id) on delete cascade,
  stage text not null check (stage in ('white','green','blue','red','pink','purple','gray','brown','black')),
  selected_at timestamptz not null default now(),
  expires_on date not null
);
alter table climbing_shoe_starts enable row level security;
revoke all on climbing_shoe_starts from public,anon,authenticated;
grant select on climbing_shoe_starts to authenticated;
create policy shoe_start_read_own on climbing_shoe_starts for select to authenticated
  using (user_id=auth.uid());

create function climbing_display_stage_v1(p_earned text,p_start text,p_expires date,p_today date)
returns text language sql immutable set search_path=public as $$
  select case when p_expires > p_today and array_position(colors,p_start) > array_position(colors,p_earned)
    then p_start else p_earned end
  from (select array['white','green','blue','red','pink','purple','gray','brown','black']::text[] colors) s;
$$;

create function climbing_progress_for_v5(p_user uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  with base as materialized (select climbing_progress_for_v4(p_user) progress),
  earned as (select progress,climbing_shoe_stage_v3(progress->'difficulty_counts') stage from base)
  select e.progress || jsonb_build_object(
    'starting_shoe',case when s.user_id is null then null else jsonb_build_object('stage',s.stage,'expires_on',s.expires_on) end,
    'can_set_start',s.user_id is null and exists(select 1 from profiles where id=p_user),
    'stage',climbing_display_stage_v1(e.stage,s.stage,s.expires_on,(now() at time zone 'Asia/Seoul')::date),
    'stage_source',case when climbing_display_stage_v1(e.stage,s.stage,s.expires_on,(now() at time zone 'Asia/Seoul')::date) <> e.stage
      then 'starting' else 'records' end)
  from earned e left join climbing_shoe_starts s on s.user_id=p_user;
$$;
create function climbing_progress_v5()
returns jsonb language sql stable security definer set search_path=public as $$
  select climbing_progress_for_v5(auth.uid());
$$;

create function climbing_shoe_start_set(p_stage text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved climbing_shoe_starts;
begin
  if auth.uid() is null then return jsonb_build_object('error','no_auth'); end if;
  if not exists(select 1 from profiles where id=auth.uid()) then return jsonb_build_object('error','no_profile'); end if;
  if p_stage is null or p_stage <> all(array['white','green','blue','red','pink','purple','gray','brown','black']) then
    return jsonb_build_object('error','bad_stage'); end if;
  insert into climbing_shoe_starts(user_id,stage,expires_on)
    values(auth.uid(),p_stage,((now() at time zone 'Asia/Seoul')::date+interval '3 months')::date)
    on conflict(user_id) do nothing;
  select * into saved from climbing_shoe_starts where user_id=auth.uid();
  if saved.stage <> p_stage then return jsonb_build_object('error','already_set'); end if;
  -- 같은 저장을 재시도해도 기간을 연장하지 않고 같은 결과를 반환한다.
  return jsonb_build_object('ok',true,'progress',climbing_progress_for_v5(auth.uid()));
end;
$$;

create function public_climbing_achievements_v5(p_users uuid[],p_session uuid default null)
returns table(user_id uuid,stage text,total bigint,stage_source text)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then return; end if;
  if coalesce(cardinality(p_users),0)>100 then raise exception 'at most 100 profiles per request' using errcode='22023'; end if;
  return query with visible as materialized (
    select p.id from profiles p where p.id=any(coalesce(p_users,'{}'::uuid[])) and profile_visible(p.id,p_session)
  ), summaries as materialized (select p.id,climbing_progress_for_v5(p.id) progress from visible p)
  select s.id,s.progress->>'stage',(s.progress->>'total')::bigint,s.progress->>'stage_source' from summaries s;
end;
$$;
revoke all on function climbing_display_stage_v1(text,text,date,date),climbing_progress_for_v5(uuid) from public,anon,authenticated;
revoke all on function climbing_progress_v5(),climbing_shoe_start_set(text),public_climbing_achievements_v5(uuid[],uuid) from public,anon;
grant execute on function climbing_progress_v5(),climbing_shoe_start_set(text),public_climbing_achievements_v5(uuid[],uuid) to authenticated;
