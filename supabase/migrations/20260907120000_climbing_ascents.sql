-- 암벽화는 완등 기록에서 계산한다. 자기신고 L등급, 출석, 영상 수는 사용하지 않는다.
-- 최초 버전은 본인이 입력한 기록이다. 암장 색을 V등급으로 임의 환산하지 않으며
-- V등급 미상은 전체 완등 수에만 포함한다. 색상/승급 값을 직접 저장하는 API는 없다.
create table climbing_ascents (
  id uuid primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  gym text not null check (char_length(trim(gym)) between 1 and 100),
  problem text not null check (char_length(trim(problem)) between 1 and 120),
  v_grade integer check (v_grade between -1 and 17),
  created_at timestamptz not null default now()
);

-- 같은 암장/문제 구분을 대소문자·공백만 바꿔도 중복 완등으로 세지 않는다.
-- 문제 구분은 세팅·벽 위치·번호 등을 조합한 본인의 식별자이며, 공인 문제 DB가 아니다.
create unique index climbing_ascents_problem_idx on climbing_ascents (
  user_id, lower(regexp_replace(gym, '[[:space:]]+', '', 'g')),
  lower(regexp_replace(problem, '[[:space:]]+', '', 'g'))
);
create index climbing_ascents_list_idx on climbing_ascents(user_id, created_at desc, id desc);
alter table climbing_ascents enable row level security;
revoke all on climbing_ascents from anon, authenticated;

create function climbing_ascent_save(p_id uuid, p_gym text, p_problem text, p_v_grade integer default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner_id uuid;
begin
  if me is null then return json_build_object('error','no_auth'); end if;
  if not exists(select 1 from profiles where id = me) then
    return json_build_object('error','no_profile'); end if;
  if p_id is null or coalesce(char_length(trim(p_gym)),0) not between 1 and 100
    or coalesce(char_length(trim(p_problem)),0) not between 1 and 120
    or regexp_replace(p_gym, '[[:space:]]+', '', 'g') = ''
    or regexp_replace(p_problem, '[[:space:]]+', '', 'g') = ''
    or (p_v_grade is not null and p_v_grade not between -1 and 17) then
    return json_build_object('error','bad_input'); end if;
  -- 재시도는 같은 ID를 쓴다. 타인이 같은 ID를 보내도 소유자를 덮어쓰지 않는다.
  insert into climbing_ascents(id, user_id, gym, problem, v_grade)
    values(p_id, me, trim(p_gym), trim(p_problem), p_v_grade)
    on conflict(id) do update set gym = excluded.gym, problem = excluded.problem,
      v_grade = excluded.v_grade where climbing_ascents.user_id = me
    returning user_id into owner_id;
  if owner_id is null then return json_build_object('error','not_mine'); end if;
  return json_build_object('ok',true,'id',p_id);
exception when unique_violation then
  return json_build_object('error','duplicate');
end; $$;

create function climbing_ascent_delete(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  delete from climbing_ascents where id = p_id and user_id = auth.uid();
  -- 삭제 재시도는 성공으로 응답하며 타인의 기록 존재 여부를 노출하지 않는다.
  return json_build_object('ok',true);
end; $$;

create function climbing_ascent_list(p_before timestamptz default null, p_before_id uuid default null,
  p_limit integer default 20)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
    select id, gym, problem, v_grade, created_at from climbing_ascents
    where user_id = auth.uid() and (p_before is null or
      (created_at, id) < (p_before, coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by created_at desc, id desc limit greatest(1, least(coalesce(p_limit,20),100))
  ) r;
$$;

-- 목록 페이지 크기와 무관하게 본인의 모든 완등을 집계한다.
create function climbing_progress()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('total',coalesce(sum(n),0),
    'grade_counts',coalesce(json_object_agg(grade,n),'{}'::json)) from (
      select coalesce(v_grade::text,'unknown') grade, count(*) n
      from climbing_ascents where user_id = auth.uid() group by v_grade
    ) r;
$$;

revoke all on function climbing_ascent_save(uuid,text,text,integer), climbing_ascent_delete(uuid),
  climbing_ascent_list(timestamptz,uuid,integer), climbing_progress() from public, anon;
grant execute on function climbing_ascent_save(uuid,text,text,integer), climbing_ascent_delete(uuid),
  climbing_ascent_list(timestamptz,uuid,integer), climbing_progress() to authenticated;
