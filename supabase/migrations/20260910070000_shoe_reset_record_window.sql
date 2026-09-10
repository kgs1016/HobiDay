-- 초기화는 완등 내역을 삭제하지 않고 현재 성취 집계의 시작점을 바꾼다.
-- 기록 날짜는 최근 3개월과 초기화 날짜 이후여야 하며,
-- 같은 날 초기화 전에 저장한 묶음도 새 성취에 다시 포함하지 않는다.
create function climbing_progress_since_reset_v1(p_user uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  with period as (
    select (now() at time zone 'Asia/Seoul')::date as until,
      (select reset_used_at from climbing_shoe_starts where user_id=p_user) as reset_at
  ), bounds as (
    select *,greatest((until-interval '3 months')::date,(reset_at at time zone 'Asia/Seoul')::date) as since
    from period
  ), entries as materialized (
    select a.quantity,coalesce(a.v_grade::text,'unknown') as grade,
      coalesce(hobi_entry_level_v2(a.gym,a.color,a.v_grade,a.manual_difficulty)::text,'unknown') as level,
      b.completed_on is null as undated,
      coalesce(b.completed_on between p.since and p.until
        and (p.reset_at is null or b.created_at>=p.reset_at),false) as recent
    from climbing_ascents a
    left join climbing_ascent_batches b on b.id=a.batch_id and b.user_id=a.user_id
    cross join bounds p where a.user_id=p_user
  ), grade_counts as (
    select grade,sum(quantity) as n from entries where recent group by grade
  ), difficulty_counts as (
    select level,sum(quantity) as n from entries where recent group by level
  ), distribution as (
    select coalesce(jsonb_object_agg(level,n),'{}'::jsonb) as counts from difficulty_counts
  ) select jsonb_build_object(
    'total',(select coalesce(sum(quantity),0) from entries),
    'recent_total',(select coalesce(sum(quantity),0) from entries where recent),
    'undated_total',(select coalesce(sum(quantity),0) from entries where undated),
    'grade_counts',(select coalesce(jsonb_object_agg(grade,n),'{}'::jsonb) from grade_counts),
    'difficulty_counts',d.counts,'points',hobi_points_v1(d.counts),'policy','color-v2',
    'period_start',p.since,'period_end',p.until
  ) from distribution d cross join bounds p;
$$;
revoke all on function climbing_progress_since_reset_v1(uuid) from public,anon,authenticated;

create or replace function climbing_progress_for_v5(p_user uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  with base as materialized (select climbing_progress_since_reset_v1(p_user) progress),
  earned as (select progress,climbing_shoe_stage_v3(progress->'difficulty_counts') stage from base)
  select e.progress || jsonb_build_object(
    'starting_shoe',case when s.user_id is null then null else jsonb_build_object('stage',s.stage,'expires_on',s.expires_on) end,
    'can_set_start',s.user_id is null and exists(select 1 from profiles where id=p_user),
    'can_reset_start',s.user_id is not null and s.reset_used_at is null
      and s.expires_on>(now() at time zone 'Asia/Seoul')::date
      and exists(select 1 from profiles where id=p_user),
    'stage',climbing_display_stage_v1(e.stage,s.stage,s.expires_on,(now() at time zone 'Asia/Seoul')::date),
    'stage_source',case when climbing_display_stage_v1(e.stage,s.stage,s.expires_on,(now() at time zone 'Asia/Seoul')::date) <> e.stage
      then 'starting' else 'records' end)
  from earned e left join climbing_shoe_starts s on s.user_id=p_user;
$$;
