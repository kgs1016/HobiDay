-- 상대의 암벽화 성취: 단계와 누적 완등 수만 공개한다.
-- 원본 문제명·암장·개별 V등급·날짜의 권한은 기존 본인 전용 그대로 둔다.
-- 사람 목록은 공개 프로필/차단 규칙을 따르고, 모임 프로필은 기존
-- session_member의 열람 판정을 재사용한다. 목록당 한 번의 배치 조회다.
create or replace function public_climbing_achievements(p_users uuid[], p_session uuid default null)
returns table(user_id uuid, stage text, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if coalesce(cardinality(p_users),0) > 100 then
    raise exception 'at most 100 profiles per request' using errcode = '22023';
  end if;

  return query
  with visible as (
    select p.id from profiles p
    where p.id = any(coalesce(p_users, '{}'::uuid[]))
      and not blocked_with(p.id)
      and case
        when p.id = auth.uid() or p.is_public then true
        when p_session is not null then
          coalesce(session_member(p_session, p.id)->>'id' = p.id::text, false)
        else false
      end
  ), counts as (
    select p.id, count(a.id) as n,
      count(*) filter (where a.v_grade >= 1) as v1,
      count(*) filter (where a.v_grade >= 2) as v2,
      count(*) filter (where a.v_grade >= 3) as v3,
      count(*) filter (where a.v_grade >= 4) as v4,
      count(*) filter (where a.v_grade >= 6) as v6,
      count(*) filter (where a.v_grade >= 8) as v8
    from visible p left join climbing_ascents a on a.user_id = p.id
    group by p.id
  )
  select c.id,
    case when c.v8 >= 15 then 'black'
         when c.v6 >= 12 then 'purple'
         when c.v4 >= 10 then 'blue'
         when c.v3 >= 8 then 'green'
         when c.v2 >= 5 then 'orange'
         when c.v1 >= 3 then 'yellow'
         else 'white' end,
    c.n
  from counts c;
end;
$$;

revoke all on function public_climbing_achievements(uuid[],uuid) from public, anon;
grant execute on function public_climbing_achievements(uuid[],uuid) to authenticated;
