-- 9색·최근 3개월 정책. 구버전 설치 앱의 7색 RPC는 그대로 유지한다.
-- created_at은 입력 시점이므로 완등 날짜로 대체하지 않는다.
create function climbing_progress_for_v2(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with period as (
    select (now() at time zone 'Asia/Seoul')::date as until
  ), counts as (
    select coalesce(a.v_grade::text,'unknown') grade,
      sum(a.quantity) n,
      sum(a.quantity) filter(where b.completed_on between (p.until - interval '3 months')::date and p.until) recent_n,
      sum(a.quantity) filter(where b.completed_on is null) undated_n
    from climbing_ascents a
    left join climbing_ascent_batches b on b.id=a.batch_id and b.user_id=a.user_id
    cross join period p where a.user_id=p_user group by a.v_grade
  ) select jsonb_build_object(
    'total', coalesce(sum(n),0),
    'recent_total', coalesce(sum(recent_n),0),
    'undated_total', coalesce(sum(undated_n),0),
    'grade_counts', coalesce(jsonb_object_agg(grade,recent_n) filter(where recent_n is not null),'{}'::jsonb),
    'period_start', (select (until - interval '3 months')::date from period),
    'period_end', (select until from period)
  ) from counts;
$$;

-- 암장 난이도 환산표와 별개인 하비데이 성취 기준이다.
create function climbing_shoe_stage_v2(p_counts jsonb)
returns text language sql immutable set search_path = public as $$
  select id from (values
    (0,'white',null::integer,0), (1,'green',2,5), (2,'blue',3,10),
    (3,'red',4,15), (4,'pink',5,20), (5,'purple',6,25),
    (6,'gray',7,30), (7,'brown',8,35), (8,'black',9,40)
  ) as stages(position,id,min_v,required)
  where min_v is null or coalesce((
    select sum(value::bigint) from jsonb_each_text(p_counts)
    where case when key ~ '^(-1|[0-9]|1[0-7])$' then key::integer >= min_v else false end
  ),0) >= required order by position desc limit 1;
$$;

create function climbing_progress_v2()
returns jsonb language sql stable security definer set search_path = public as $$
  select climbing_progress_for_v2(auth.uid());
$$;

create function public_climbing_achievements_v2(p_users uuid[],p_session uuid default null)
returns table(user_id uuid,stage text,total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if coalesce(cardinality(p_users),0)>100 then
    raise exception 'at most 100 profiles per request' using errcode='22023';
  end if;
  return query with visible as materialized (
    select p.id from profiles p
    where p.id=any(coalesce(p_users,'{}'::uuid[])) and profile_visible(p.id,p_session)
  ), summaries as materialized (
    select p.id,climbing_progress_for_v2(p.id) progress from visible p
  ) select s.id,climbing_shoe_stage_v2(s.progress->'grade_counts'),(s.progress->>'total')::bigint
    from summaries s;
end; $$;

revoke all on function climbing_progress_for_v2(uuid),climbing_shoe_stage_v2(jsonb)
  from public,anon,authenticated;
revoke all on function climbing_progress_v2(),public_climbing_achievements_v2(uuid[],uuid) from public,anon;
grant execute on function climbing_progress_v2(),public_climbing_achievements_v2(uuid[],uuid) to authenticated;
