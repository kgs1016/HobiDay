-- 공개된 암장 안내표에서 V 표기가 확인된 색상만 자동 환산한다.
-- 작성일/현장 최신성은 확인되지 않음. 이용자 재게시 원본을 명시한다.
-- 버전 ID와 환산 수치는 불변: 수정할 때 새 ID를 추가해 기존 기록의 뜻을 보존한다.
create table climbing_grade_mappings (
  id text primary key check (char_length(id) between 1 and 80),
  brand_id text not null,
  color text not null,
  v_min integer not null check (v_min between -1 and 17),
  v_max integer check (v_max between -1 and 17 and v_max >= v_min),
  source_url text not null check (source_url like 'https://%'),
  source_label text not null,
  published_on date,
  checked_on date not null
);
alter table climbing_grade_mappings enable row level security;
revoke all on climbing_grade_mappings from public, anon, authenticated;
insert into climbing_grade_mappings
select * from jsonb_to_recordset(
$grade_mappings$
[
  {
    "id": "metrorock-20260909-red",
    "brand_id": "metrorock",
    "color": "빨강",
    "v_min": 0,
    "v_max": 0,
    "source_url": "https://spiri7.com/post/479",
    "source_label": "메트로락 암장 안내표 · 이용자 재게시",
    "published_on": null,
    "checked_on": "2026-09-09"
  },
  {
    "id": "metrorock-20260909-yellow",
    "brand_id": "metrorock",
    "color": "노랑",
    "v_min": 1,
    "v_max": 2,
    "source_url": "https://spiri7.com/post/479",
    "source_label": "메트로락 암장 안내표 · 이용자 재게시",
    "published_on": null,
    "checked_on": "2026-09-09"
  },
  {
    "id": "metrorock-20260909-green",
    "brand_id": "metrorock",
    "color": "초록",
    "v_min": 2,
    "v_max": 3,
    "source_url": "https://spiri7.com/post/479",
    "source_label": "메트로락 암장 안내표 · 이용자 재게시",
    "published_on": null,
    "checked_on": "2026-09-09"
  },
  {
    "id": "metrorock-20260909-blue",
    "brand_id": "metrorock",
    "color": "파랑",
    "v_min": 3,
    "v_max": 4,
    "source_url": "https://spiri7.com/post/479",
    "source_label": "메트로락 암장 안내표 · 이용자 재게시",
    "published_on": null,
    "checked_on": "2026-09-09"
  },
  {
    "id": "metrorock-20260909-purple",
    "brand_id": "metrorock",
    "color": "보라",
    "v_min": 4,
    "v_max": 5,
    "source_url": "https://spiri7.com/post/479",
    "source_label": "메트로락 암장 안내표 · 이용자 재게시",
    "published_on": null,
    "checked_on": "2026-09-09"
  },
  {
    "id": "metrorock-20260909-black",
    "brand_id": "metrorock",
    "color": "검정",
    "v_min": 5,
    "v_max": null,
    "source_url": "https://spiri7.com/post/479",
    "source_label": "메트로락 암장 안내표 · 이용자 재게시",
    "published_on": null,
    "checked_on": "2026-09-09"
  }
]
$grade_mappings$::jsonb) as m(id text,brand_id text,color text,v_min integer,v_max integer,
 source_url text,source_label text,published_on date,checked_on date);

-- 확인하지 않은 지점·다른 암장을 같은 브랜드로 추정하지 않는다.
create function climbing_grade_brand(p_gym text)
returns text language sql immutable set search_path=public as $$
  select case when lower(regexp_replace(p_gym,'[[:space:]]+','','g'))
    in ('metrorock','메트로락','메트로락클라이밍','메트로락클라이밍센터') then 'metrorock' end;
$$;
revoke all on function climbing_grade_brand(text) from public,anon,authenticated;

alter table climbing_ascents add column grade_mapping_id text references climbing_grade_mappings(id);
alter table climbing_ascents add constraint climbing_ascent_mapping_batch
 check (grade_mapping_id is null or batch_id is not null);

create or replace function climbing_ascent_batch_save(p_id uuid, p_gym text, p_completed_on date,
  p_brand_id text, p_items jsonb, p_legacy_id uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); owner_id uuid; legacy_owner uuid; old_problem text;
  item jsonb; mapped_v integer; mapping_id text; pos integer := 0; total_count integer := 0; seen_colors text[] := '{}'; c text; n integer; v integer;
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
    if item->'grade_mapping_id' is not null and item->'grade_mapping_id' <> 'null'::jsonb then
      if jsonb_typeof(item->'grade_mapping_id') is distinct from 'string' then
        return json_build_object('error','bad_mapping'); end if;
      select m.v_min into mapped_v from climbing_grade_mappings m
        where m.id=item->>'grade_mapping_id' and m.brand_id=p_brand_id
          and m.brand_id=climbing_grade_brand(p_gym) and m.color=trim(item->>'color');
      if not found then return json_build_object('error','bad_mapping'); end if;
    end if;
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
    mapping_id := item->>'grade_mapping_id';
    if mapping_id is not null then select v_min into v from climbing_grade_mappings where id=mapping_id; end if;
    insert into climbing_ascents(id,user_id,gym,problem,v_grade,batch_id,color,quantity,position,grade_mapping_id)
      values(gen_random_uuid(),me,trim(p_gym),null,v,p_id,trim(item->>'color'),n,pos,mapping_id);
  end loop;
  if p_legacy_id is not null then delete from climbing_ascents where id=p_legacy_id and user_id=me and batch_id is null; end if;
  return json_build_object('ok',true,'id',p_id);
end; $$;

create or replace function climbing_ascent_history(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
    select * from (
      select b.id, 'batch'::text kind, b.gym, b.completed_on, b.brand_id, b.created_at, b.legacy_problem,
        (select json_agg(json_build_object('color',a.color,'quantity',a.quantity,'v_grade',a.v_grade,'grade_mapping_id',a.grade_mapping_id) order by a.position)
         from climbing_ascents a where a.batch_id=b.id) items
      from climbing_ascent_batches b where b.user_id=auth.uid()
      union all
      select a.id, 'legacy', a.gym, null::date, null::text, a.created_at, a.problem,
        json_build_array(json_build_object('color',null,'quantity',1,'v_grade',a.v_grade,'grade_mapping_id',a.grade_mapping_id))
      from climbing_ascents a where a.user_id=auth.uid() and a.batch_id is null
    ) h where p_before is null or (h.created_at,h.id) <
      (p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by h.created_at desc,h.id desc limit greatest(1,least(coalesce(p_limit,20),100))
  ) r;
$$;
