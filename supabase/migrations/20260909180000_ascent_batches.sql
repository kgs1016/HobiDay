-- 날짜·암장별로 여러 색상의 완등 개수를 한 번에 기록한다.
-- 기존 문제 기록은 quantity=1로 유지. 색상은 V등급으로 자동 환산하지 않는다.
create table climbing_ascent_batches (
  id uuid primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  gym text not null check (char_length(trim(gym)) between 1 and 100),
  completed_on date not null,
  brand_id text check (char_length(brand_id) between 1 and 40),
  legacy_problem text,
  created_at timestamptz not null default now()
);
create index climbing_ascent_batches_list_idx on climbing_ascent_batches(user_id, created_at desc, id desc);
alter table climbing_ascent_batches enable row level security;
revoke all on climbing_ascent_batches from public, anon, authenticated;

alter table climbing_ascents
  alter column problem drop not null,
  add column batch_id uuid references climbing_ascent_batches(id) on delete cascade,
  add column color text check (char_length(trim(color)) between 1 and 20),
  add column quantity integer not null default 1 check (quantity between 1 and 99),
  add column position integer not null default 0,
  add constraint climbing_ascent_shape check (
    (batch_id is null and problem is not null and color is null and quantity = 1)
    or (batch_id is not null and problem is null and color is not null)
  );
create unique index climbing_ascent_batch_color_idx on climbing_ascents(batch_id, color) where batch_id is not null;

create function climbing_ascent_batch_save(p_id uuid, p_gym text, p_completed_on date,
  p_brand_id text, p_items jsonb, p_legacy_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner_id uuid; legacy_owner uuid; old_problem text;
  item jsonb; pos integer := 0; total_count integer := 0; seen_colors text[] := '{}'; c text; n integer; v integer;
begin
  if me is null then return json_build_object('error','no_auth'); end if;
  if not exists(select 1 from profiles where id = me) then return json_build_object('error','no_profile'); end if;
  if p_id is null or coalesce(char_length(trim(p_gym)),0) not between 1 and 100
    or regexp_replace(p_gym,'[[:space:]]+','','g') = ''
    or p_completed_on is null or p_completed_on < date '1900-01-01'
    or p_completed_on > (now() at time zone 'Asia/Seoul')::date
    or (p_brand_id is not null and char_length(trim(p_brand_id)) not between 1 and 40)
    or jsonb_typeof(p_items) is distinct from 'array' then
    return json_build_object('error','bad_input'); end if;
  if jsonb_array_length(p_items) not between 1 and 20 then return json_build_object('error','bad_input'); end if;
  -- 전체 입력을 검증한 뒤 쓰기 시작한다. 숫자 문자열·소수·중복 색상은 거절한다.
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item->'color') is distinct from 'string'
      or coalesce(char_length(trim(item->>'color')),0) not between 1 and 20
      or regexp_replace(item->>'color','[[:space:]]+','','g') = ''
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity') !~ '^[1-9][0-9]?$' then return json_build_object('error','bad_input'); end if;
    if item->'v_grade' is not null and item->'v_grade' <> 'null'::jsonb and
      (jsonb_typeof(item->'v_grade') <> 'number' or (item->>'v_grade') !~ '^(-1|[0-9]|1[0-7])$') then
      return json_build_object('error','bad_input'); end if;
    c := lower(regexp_replace(item->>'color','[[:space:]]+','','g'));
    if c = any(seen_colors) then return json_build_object('error','bad_input'); end if;
    seen_colors := array_append(seen_colors,c);
    total_count := total_count + (item->>'quantity')::integer;
  end loop;
  if total_count > 500 then return json_build_object('error','bad_input'); end if;
  -- 신규 저장·편집·재시도를 같은 ID로 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select user_id into owner_id from climbing_ascent_batches where id = p_id;
  if owner_id is not null and owner_id <> me then return json_build_object('error','not_mine'); end if;
  if p_legacy_id is null and exists(select 1 from climbing_ascents where id=p_id) then
    return json_build_object('error','bad_input'); end if;
  if p_legacy_id is not null then
    if p_legacy_id <> p_id then return json_build_object('error','bad_input'); end if;
    select user_id, problem into legacy_owner, old_problem from climbing_ascents
      where id = p_legacy_id and batch_id is null for update;
    if legacy_owner is not null and legacy_owner <> me then return json_build_object('error','not_mine'); end if;
    if legacy_owner is null and owner_id is null then return json_build_object('error','not_found'); end if;
  end if;
  insert into climbing_ascent_batches(id,user_id,gym,completed_on,brand_id,legacy_problem)
    values(p_id,me,trim(p_gym),p_completed_on,trim(p_brand_id),old_problem)
    on conflict(id) do update set gym=excluded.gym, completed_on=excluded.completed_on,
      brand_id=excluded.brand_id, legacy_problem=coalesce(climbing_ascent_batches.legacy_problem,excluded.legacy_problem);
  delete from climbing_ascents where batch_id = p_id;
  for item in select value from jsonb_array_elements(p_items) loop
    pos := pos + 1; n := (item->>'quantity')::integer; v := (item->>'v_grade')::integer;
    insert into climbing_ascents(id,user_id,gym,problem,v_grade,batch_id,color,quantity,position)
      values(gen_random_uuid(),me,trim(p_gym),null,v,p_id,trim(item->>'color'),n,pos);
  end loop;
  if p_legacy_id is not null then delete from climbing_ascents where id=p_legacy_id and user_id=me and batch_id is null; end if;
  return json_build_object('ok',true,'id',p_id);
end; $$;

create function climbing_ascent_batch_delete(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  delete from climbing_ascent_batches where id=p_id and user_id=auth.uid();
  return json_build_object('ok',true);
end; $$;

create function climbing_ascent_history(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
    select * from (
      select b.id, 'batch'::text kind, b.gym, b.completed_on, b.brand_id, b.created_at, b.legacy_problem,
        (select json_agg(json_build_object('color',a.color,'quantity',a.quantity,'v_grade',a.v_grade) order by a.position)
         from climbing_ascents a where a.batch_id=b.id) items
      from climbing_ascent_batches b where b.user_id=auth.uid()
      union all
      select a.id, 'legacy', a.gym, null::date, null::text, a.created_at, a.problem,
        json_build_array(json_build_object('color',null,'quantity',1,'v_grade',a.v_grade))
      from climbing_ascents a where a.user_id=auth.uid() and a.batch_id is null
    ) h where p_before is null or (h.created_at,h.id) <
      (p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by h.created_at desc,h.id desc limit greatest(1,least(coalesce(p_limit,20),100))
  ) r;
$$;

-- 구버전 앱은 개별 기록만 편집·삭제한다. 새 묶음의 일부를 잘못 수정하지 않는다.
create or replace function climbing_ascent_save(p_id uuid,p_gym text,p_problem text,p_v_grade integer default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner_id uuid;
begin
  if me is null then return json_build_object('error','no_auth'); end if;
  if not exists(select 1 from profiles where id=me) then return json_build_object('error','no_profile'); end if;
  if p_id is null or coalesce(char_length(trim(p_gym)),0) not between 1 and 100
    or coalesce(char_length(trim(p_problem)),0) not between 1 and 120
    or regexp_replace(p_gym,'[[:space:]]+','','g')='' or regexp_replace(p_problem,'[[:space:]]+','','g')=''
    or (p_v_grade is not null and p_v_grade not between -1 and 17) then return json_build_object('error','bad_input'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  if exists(select 1 from climbing_ascent_batches where id=p_id) then return json_build_object('error','bad_input'); end if;
  insert into climbing_ascents(id,user_id,gym,problem,v_grade) values(p_id,me,trim(p_gym),trim(p_problem),p_v_grade)
    on conflict(id) do update set gym=excluded.gym,problem=excluded.problem,v_grade=excluded.v_grade
      where climbing_ascents.user_id=me and climbing_ascents.batch_id is null returning user_id into owner_id;
  if owner_id is null then return json_build_object('error','not_mine'); end if;
  return json_build_object('ok',true,'id',p_id);
exception when unique_violation then return json_build_object('error','duplicate');
end; $$;
create or replace function climbing_ascent_delete(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return json_build_object('error','no_auth'); end if;
  delete from climbing_ascents where id=p_id and user_id=auth.uid() and batch_id is null;
  return json_build_object('ok',true);
end; $$;
create or replace function climbing_ascent_list(p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 20)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
    select id,gym,problem,v_grade,created_at from climbing_ascents where user_id=auth.uid() and batch_id is null
      and (p_before is null or (created_at,id) < (p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),100))
  ) r;
$$;

create or replace function climbing_progress()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('total',coalesce(sum(n),0),'grade_counts',coalesce(json_object_agg(grade,n),'{}'::json)) from (
    select coalesce(v_grade::text,'unknown') grade,sum(quantity) n
    from climbing_ascents where user_id=auth.uid() group by v_grade
  ) r;
$$;

create or replace function public_climbing_achievements(p_users uuid[],p_session uuid default null)
returns table(user_id uuid,stage text,total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if coalesce(cardinality(p_users),0)>100 then raise exception 'at most 100 profiles per request' using errcode='22023'; end if;
  return query with visible as (
    select p.id from profiles p where p.id=any(coalesce(p_users,'{}'::uuid[])) and profile_visible(p.id,p_session)
  ), counts as (
    select p.id,coalesce(sum(a.quantity),0) n,
      sum(a.quantity) filter(where a.v_grade>=1) v1, sum(a.quantity) filter(where a.v_grade>=2) v2,
      sum(a.quantity) filter(where a.v_grade>=3) v3, sum(a.quantity) filter(where a.v_grade>=4) v4,
      sum(a.quantity) filter(where a.v_grade>=6) v6, sum(a.quantity) filter(where a.v_grade>=8) v8
    from visible p left join climbing_ascents a on a.user_id=p.id group by p.id
  ) select c.id,case when c.v8>=15 then 'black' when c.v6>=12 then 'purple'
    when c.v4>=10 then 'blue' when c.v3>=8 then 'green' when c.v2>=5 then 'orange'
    when c.v1>=3 then 'yellow' else 'white' end,c.n from counts c;
end; $$;

revoke all on function climbing_ascent_batch_save(uuid,text,date,text,jsonb,uuid),
  climbing_ascent_batch_delete(uuid),climbing_ascent_history(timestamptz,uuid,integer) from public,anon;
grant execute on function climbing_ascent_batch_save(uuid,text,date,text,jsonb,uuid),
  climbing_ascent_batch_delete(uuid),climbing_ascent_history(timestamptz,uuid,integer) to authenticated;
