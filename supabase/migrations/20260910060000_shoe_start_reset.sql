-- 시작 색을 잘못 고른 회원은 적용 기간 안에 한 번 다시 고를 수 있다.
-- 실제 완등 기록은 건드리지 않고 선택일과 3개월 적용 기간만 새로 시작한다.
alter table climbing_shoe_starts add column reset_used_at timestamptz;

create or replace function climbing_progress_for_v5(p_user uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  with base as materialized (select climbing_progress_for_v4(p_user) progress),
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

create function climbing_shoe_start_reset(p_stage text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare saved climbing_shoe_starts;
begin
  if auth.uid() is null then return jsonb_build_object('error','no_auth'); end if;
  if not exists(select 1 from profiles where id=auth.uid()) then return jsonb_build_object('error','no_profile'); end if;
  if p_stage is null or p_stage <> all(array['white','green','blue','red','pink','purple','gray','brown','black']) then
    return jsonb_build_object('error','bad_stage'); end if;

  select * into saved from climbing_shoe_starts where user_id=auth.uid() for update;
  if saved.user_id is null then return jsonb_build_object('error','not_set'); end if;
  if saved.reset_used_at is not null then
    -- 응답 유실 뒤 같은 선택으로 재시도해도 기간을 연장하지 않는다.
    if saved.stage = p_stage then
      return jsonb_build_object('ok',true,'progress',climbing_progress_for_v5(auth.uid()));
    end if;
    return jsonb_build_object('error','reset_used');
  end if;
  if saved.expires_on <= (now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('error','expired'); end if;
  if saved.stage = p_stage then return jsonb_build_object('error','same_stage'); end if;

  update climbing_shoe_starts set stage=p_stage,selected_at=now(),
    expires_on=((now() at time zone 'Asia/Seoul')::date+interval '3 months')::date,
    reset_used_at=now()
  where user_id=auth.uid();
  return jsonb_build_object('ok',true,'progress',climbing_progress_for_v5(auth.uid()));
end;
$$;

revoke all on function climbing_shoe_start_reset(text) from public,anon;
grant execute on function climbing_shoe_start_reset(text) to authenticated;
