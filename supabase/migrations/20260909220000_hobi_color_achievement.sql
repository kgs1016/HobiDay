-- 하비데이 상대 색상 난이도 v1. 공식 V환산이 아니며 운영용 초기 정책이다.
-- 색상의 암장 내 순위를 H1~H11로 정규화한다. 같은 H는 암장 간 실력 동등성을 보증하지 않는다.
-- 이 버전 카탈로그는 불변. 개정은 새 정책/RPC 버전으로 명시한다.
create table hobi_difficulty_brands_v1 (
 id text primary key, aliases text[] not null, prefixes text[] not null, colors text[] not null,
 check(cardinality(colors) between 2 and 11)
);
alter table hobi_difficulty_brands_v1 enable row level security;
revoke all on hobi_difficulty_brands_v1 from public,anon,authenticated;
insert into hobi_difficulty_brands_v1
select * from jsonb_to_recordset(
$hobi_brands$
[
  {
    "id": "theclimb",
    "aliases": [
      "theclimb",
      "더클라임",
      "더클라임클라이밍",
      "더클",
      "더클라임문래",
      "더클라임강남",
      "더클라임신림",
      "더클라임일산"
    ],
    "prefixes": [
      "더클라임클라이밍",
      "더클라임",
      "더클",
      "theclimb"
    ],
    "colors": [
      "흰색",
      "노랑",
      "주황",
      "초록",
      "파랑",
      "빨강",
      "핑크",
      "보라",
      "회색",
      "갈색",
      "검정"
    ]
  },
  {
    "id": "metrorock",
    "aliases": [
      "metrorock",
      "메트로락클라이밍",
      "메트로락",
      "메트로락클라이밍센터"
    ],
    "prefixes": [],
    "colors": [
      "빨강",
      "노랑",
      "초록",
      "파랑",
      "보라",
      "검정"
    ]
  },
  {
    "id": "seoul-forest",
    "aliases": [
      "seoul-forest",
      "서울숲클라이밍",
      "서울숲",
      "서울숲클라이밍영등포점",
      "영등숲",
      "서울숲클라이밍구로점",
      "구로숲",
      "서울숲클라이밍잠실점",
      "잠실숲",
      "서울숲클라이밍종로점",
      "종로숲"
    ],
    "prefixes": [
      "서울숲클라이밍",
      "서울숲"
    ],
    "colors": [
      "핑크",
      "빨강",
      "주황",
      "노랑",
      "초록",
      "파랑",
      "남색",
      "보라",
      "갈색",
      "검정"
    ]
  },
  {
    "id": "peakers",
    "aliases": [
      "peakers",
      "피커스",
      "피커스클라이밍",
      "피커스클라이밍구로점",
      "피커스구로점",
      "피커스구로",
      "피커스클라이밍구로",
      "피커스클라이밍종로점",
      "피커스종로점",
      "피커스종로"
    ],
    "prefixes": [
      "피커스클라이밍",
      "피커스"
    ],
    "colors": [
      "빨강",
      "주황",
      "노랑",
      "초록",
      "파랑",
      "남색",
      "보라",
      "회색",
      "검정"
    ]
  },
  {
    "id": "climbing-park",
    "aliases": [
      "climbing-park",
      "클라이밍파크",
      "클팍",
      "클라이밍파크종로점",
      "클팍종로",
      "클라이밍파크강남점",
      "클팍강남"
    ],
    "prefixes": [
      "클라이밍파크",
      "클팍"
    ],
    "colors": [
      "노랑",
      "핑크",
      "파랑",
      "빨강",
      "보라",
      "갈색",
      "회색",
      "검정",
      "흰색"
    ]
  },
  {
    "id": "allez",
    "aliases": [
      "allez",
      "알레클라이밍",
      "알레",
      "알레클라임",
      "알레클라이밍혜화",
      "알레클라임영등포점",
      "알레클라이밍영등포점",
      "알레영등포",
      "알레클라이밍강동",
      "알레클라이밍강동점",
      "알레강동"
    ],
    "prefixes": [
      "알레클라이밍",
      "알레클라임",
      "알레"
    ],
    "colors": [
      "흰색",
      "노랑",
      "연두",
      "초록",
      "파랑",
      "빨강",
      "회색",
      "갈색",
      "핑크"
    ]
  },
  {
    "id": "ssw",
    "aliases": [
      "ssw",
      "손상원클라이밍짐",
      "손상원",
      "손상원클라이밍짐을지로점",
      "손상원을지로"
    ],
    "prefixes": [
      "손상원클라이밍짐",
      "손상원"
    ],
    "colors": [
      "흰색",
      "노랑",
      "초록",
      "파랑",
      "빨강",
      "검정",
      "회색",
      "갈색",
      "핑크"
    ]
  },
  {
    "id": "koala",
    "aliases": [
      "koala",
      "코알라클라이밍",
      "코알라",
      "코알라클라이밍상암",
      "코알라클라이밍킨텍스점",
      "코알라클라이밍킨텍스",
      "코알라킨텍스"
    ],
    "prefixes": [
      "코알라클라이밍",
      "코알라"
    ],
    "colors": [
      "핑크",
      "노랑",
      "초록",
      "파랑",
      "주황",
      "빨강",
      "보라",
      "검정",
      "흰색"
    ]
  },
  {
    "id": "catch-stone",
    "aliases": [
      "catch-stone",
      "캐치스톤",
      "캐치스톤클라이밍짐",
      "캐치스톤클라이밍",
      "캐치스톤클라이밍부천시청점",
      "캐치스톤부천시청점",
      "캐치스톤부천시청",
      "캐치스톤2호점"
    ],
    "prefixes": [
      "캐치스톤클라이밍짐",
      "캐치스톤클라이밍",
      "캐치스톤"
    ],
    "colors": [
      "빨강",
      "주황",
      "노랑",
      "초록",
      "파랑",
      "남색",
      "보라",
      "회색",
      "검정",
      "핑크"
    ]
  },
  {
    "id": "sinchon-damjang",
    "aliases": [
      "sinchon-damjang",
      "신촌담장",
      "신촌담장클라이밍"
    ],
    "prefixes": [],
    "colors": [
      "빨강",
      "주황",
      "노랑",
      "초록",
      "파랑",
      "남색",
      "보라",
      "흰색",
      "검정"
    ]
  }
]
$hobi_brands$::jsonb) as b(id text,aliases text[],prefixes text[],colors text[]);

create function hobi_color_level_v1(p_gym text,p_color text)
returns integer language sql stable set search_path=public as $$
 select 1 + ((c.position::integer-1)*10/(cardinality(b.colors)-1))
 from hobi_difficulty_brands_v1 b
 cross join unnest(b.colors) with ordinality c(color,position)
 cross join (select lower(regexp_replace(p_gym,'[[:space:]]+','','g')) name) normalized
 where c.color=trim(p_color) and (normalized.name=any(b.aliases) or exists(
   select 1 from unnest(b.prefixes) prefix where left(normalized.name,length(prefix))=prefix
     and substr(normalized.name,length(prefix)+1) ~ '^[가-힣a-z0-9]+점$'
 )) limit 1;
$$;
create function hobi_v_level_v1(p_v integer)
returns integer language sql immutable as $$
 select case when p_v between -1 and 0 then 1 when p_v=1 then 2
   when p_v between 2 and 17 then least(11,p_v+2) end;
$$;
create function hobi_entry_level_v1(p_gym text,p_color text,p_v integer,p_manual integer)
returns integer language sql stable set search_path=public as $$
 select coalesce(hobi_color_level_v1(p_gym,p_color),
   case when p_manual between 1 and 11 then p_manual end,hobi_v_level_v1(p_v));
$$;
create function hobi_points_v1(p_counts jsonb)
returns bigint language sql immutable as $$
 select coalesce(sum(c.value::bigint*w.points),0) from jsonb_each_text(p_counts) c
 join (values (1,1),(2,2),(3,3),(4,5),(5,8),(6,12),(7,18),(8,26),(9,36),(10,50),(11,70)) w(level,points)
 on c.key=w.level::text;
$$;

alter table climbing_ascents add column manual_difficulty integer check(manual_difficulty between 1 and 11);
create function climbing_ascent_batch_save_v2(p_id uuid,p_gym text,p_completed_on date,
 p_brand_id text,p_items jsonb,p_legacy_id uuid default null)
returns json language plpgsql security definer set search_path=public as $$
declare item jsonb; result json;
begin
 if auth.uid() is null then return json_build_object('error','no_auth'); end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
   return json_build_object('error','bad_input'); end if;
 for item in select value from jsonb_array_elements(p_items) loop
   if item->'manual_difficulty' is not null and item->'manual_difficulty'<>'null'::jsonb then
     if jsonb_typeof(item->'manual_difficulty')<>'number' or (item->>'manual_difficulty')!~ '^([1-9]|10|11)$'
       or hobi_color_level_v1(p_gym,item->>'color') is not null then return json_build_object('error','bad_input'); end if;
   end if;
 end loop;
 result := climbing_ascent_batch_save(p_id,p_gym,p_completed_on,p_brand_id,p_items,p_legacy_id);
 if result->>'ok'='true' then
   update climbing_ascents a set manual_difficulty=(i.value->>'manual_difficulty')::integer
   from jsonb_array_elements(p_items) with ordinality i(value,position)
   where a.batch_id=p_id and a.user_id=auth.uid() and a.position=i.position;
 end if;
 return result;
end; $$;

create function climbing_ascent_history_v2(p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 20)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(r)), '[]'::json) from (
    select * from (
      select b.id, 'batch'::text kind, b.gym, b.completed_on, b.brand_id, b.created_at, b.legacy_problem,
        (select json_agg(json_build_object('color',a.color,'quantity',a.quantity,'v_grade',a.v_grade,'grade_mapping_id',a.grade_mapping_id,'manual_difficulty',a.manual_difficulty) order by a.position)
         from climbing_ascents a where a.batch_id=b.id) items
      from climbing_ascent_batches b where b.user_id=auth.uid()
      union all
      select a.id, 'legacy', a.gym, null::date, null::text, a.created_at, a.problem,
        json_build_array(json_build_object('color',null,'quantity',1,'v_grade',a.v_grade,'grade_mapping_id',a.grade_mapping_id,'manual_difficulty',a.manual_difficulty))
      from climbing_ascents a where a.user_id=auth.uid() and a.batch_id is null
    ) h where p_before is null or (h.created_at,h.id) <
      (p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by h.created_at desc,h.id desc limit greatest(1,least(coalesce(p_limit,20),100))
  ) r;
$$;


create function climbing_progress_for_v3(p_user uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 with counts as (
   select coalesce(hobi_entry_level_v1(a.gym,a.color,a.v_grade,a.manual_difficulty)::text,'unknown') level,
     sum(a.quantity) n
   from climbing_ascents a join climbing_ascent_batches b on b.id=a.batch_id and b.user_id=a.user_id
   where a.user_id=p_user and b.completed_on between
     ((now() at time zone 'Asia/Seoul')::date-interval '3 months')::date and (now() at time zone 'Asia/Seoul')::date
   group by 1
 ), distribution as (select coalesce(jsonb_object_agg(level,n),'{}'::jsonb) counts from counts)
 select climbing_progress_for_v2(p_user)||jsonb_build_object('difficulty_counts',counts,'points',hobi_points_v1(counts),'policy','color-v1') from distribution;
$$;
create function climbing_shoe_stage_v3(p_counts jsonb)
returns text language sql immutable set search_path=public as $$
 select id from (values
  (0,'white',null::integer,0,0), (1,'green',4,5,50), (2,'blue',5,10,160),
  (3,'red',6,15,360), (4,'pink',7,20,720), (5,'purple',8,25,1300),
  (6,'gray',9,30,2200), (7,'brown',10,35,3500), (8,'black',11,40,5500)
 ) stages(position,id,min_level,required,points)
 where (min_level is null or coalesce((select sum(c.value::bigint)
   from jsonb_each_text(p_counts) c join generate_series(1,11) l(level) on c.key=l.level::text
   where l.level>=min_level),0)>=required)
   and hobi_points_v1(p_counts)>=points order by position desc limit 1;
$$;
create function climbing_progress_v3()
returns jsonb language sql stable security definer set search_path=public as $$
 select climbing_progress_for_v3(auth.uid());
$$;
create function public_climbing_achievements_v3(p_users uuid[],p_session uuid default null)
returns table(user_id uuid,stage text,total bigint)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then return; end if;
 if coalesce(cardinality(p_users),0)>100 then raise exception 'at most 100 profiles per request' using errcode='22023'; end if;
 return query with visible as materialized (
   select p.id from profiles p where p.id=any(coalesce(p_users,'{}'::uuid[])) and profile_visible(p.id,p_session)
 ), summaries as materialized (select p.id,climbing_progress_for_v3(p.id) progress from visible p)
 select s.id,climbing_shoe_stage_v3(s.progress->'difficulty_counts'),(s.progress->>'total')::bigint from summaries s;
end; $$;
revoke all on function hobi_color_level_v1(text,text),hobi_v_level_v1(integer),hobi_entry_level_v1(text,text,integer,integer),
 hobi_points_v1(jsonb),climbing_progress_for_v3(uuid),climbing_shoe_stage_v3(jsonb) from public,anon,authenticated;
revoke all on function climbing_progress_v3(),public_climbing_achievements_v3(uuid[],uuid),
 climbing_ascent_batch_save_v2(uuid,text,date,text,jsonb,uuid),climbing_ascent_history_v2(timestamptz,uuid,integer) from public,anon;
grant execute on function climbing_progress_v3(),public_climbing_achievements_v3(uuid[],uuid),
 climbing_ascent_batch_save_v2(uuid,text,date,text,jsonb,uuid),climbing_ascent_history_v2(timestamptz,uuid,integer) to authenticated;
