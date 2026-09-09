-- 사용자 확인 색상 수정 (2026-09-09): 알레 검정·손상원 보라 추가, 캐치스톤 검정→갈색.
-- v1 카탈로그/RPC는 설치된 구 앱을 위해 보존한다. v2는 수정된 순서로 최근 기록을 재계산한다.
-- 기존 기록의 색상·개수·날짜·V값을 수정하지 않는다.
create table hobi_difficulty_brands_v2 (
 id text primary key, aliases text[] not null, prefixes text[] not null, colors text[] not null,
 check(cardinality(colors) between 2 and 11)
);
alter table hobi_difficulty_brands_v2 enable row level security;
revoke all on hobi_difficulty_brands_v2 from public,anon,authenticated;
insert into hobi_difficulty_brands_v2
select * from jsonb_to_recordset(
$hobi_brands$[
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
      "핑크",
      "검정"
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
      "핑크",
      "보라"
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
      "갈색",
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

create function hobi_color_level_v2(p_gym text,p_color text)
returns integer language sql stable set search_path=public as $$
 select 1 + ((c.position::integer-1)*10/(cardinality(b.colors)-1))
 from hobi_difficulty_brands_v2 b
 cross join unnest(b.colors) with ordinality c(color,position)
 cross join (select lower(regexp_replace(p_gym,'[[:space:]]+','','g')) name) normalized
 where c.color=case when b.id='catch-stone' and trim(p_color)='검정' then '갈색' else trim(p_color) end and (normalized.name=any(b.aliases) or exists(
   select 1 from unnest(b.prefixes) prefix where left(normalized.name,length(prefix))=prefix
     and substr(normalized.name,length(prefix)+1) ~ '^[가-힣a-z0-9]+점$'
 )) limit 1;
$$;
create function hobi_entry_level_v2(p_gym text,p_color text,p_v integer,p_manual integer)
returns integer language sql stable set search_path=public as $$
 select coalesce(hobi_color_level_v2(p_gym,p_color),
   case when p_manual between 1 and 11 then p_manual end,hobi_v_level_v1(p_v));
$$;
create function climbing_ascent_batch_save_v3(p_id uuid,p_gym text,p_completed_on date,
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
       or hobi_color_level_v2(p_gym,item->>'color') is not null then return json_build_object('error','bad_input'); end if;
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

create function climbing_progress_for_v4(p_user uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 with counts as (
   select coalesce(hobi_entry_level_v2(a.gym,a.color,a.v_grade,a.manual_difficulty)::text,'unknown') level,
     sum(a.quantity) n
   from climbing_ascents a join climbing_ascent_batches b on b.id=a.batch_id and b.user_id=a.user_id
   where a.user_id=p_user and b.completed_on between
     ((now() at time zone 'Asia/Seoul')::date-interval '3 months')::date and (now() at time zone 'Asia/Seoul')::date
   group by 1
 ), distribution as (select coalesce(jsonb_object_agg(level,n),'{}'::jsonb) counts from counts)
 select climbing_progress_for_v2(p_user)||jsonb_build_object('difficulty_counts',counts,'points',hobi_points_v1(counts),'policy','color-v2') from distribution;
$$;
create function climbing_progress_v4()
returns jsonb language sql stable security definer set search_path=public as $$
 select climbing_progress_for_v4(auth.uid());
$$;
create function public_climbing_achievements_v4(p_users uuid[],p_session uuid default null)
returns table(user_id uuid,stage text,total bigint)
language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then return; end if;
 if coalesce(cardinality(p_users),0)>100 then raise exception 'at most 100 profiles per request' using errcode='22023'; end if;
 return query with visible as materialized (
   select p.id from profiles p where p.id=any(coalesce(p_users,'{}'::uuid[])) and profile_visible(p.id,p_session)
 ), summaries as materialized (select p.id,climbing_progress_for_v4(p.id) progress from visible p)
 select s.id,climbing_shoe_stage_v3(s.progress->'difficulty_counts'),(s.progress->>'total')::bigint from summaries s;
end; $$;
revoke all on function hobi_color_level_v2(text,text),hobi_entry_level_v2(text,text,integer,integer),
 climbing_progress_for_v4(uuid) from public,anon,authenticated;
revoke all on function climbing_progress_v4(),public_climbing_achievements_v4(uuid[],uuid),
 climbing_ascent_batch_save_v3(uuid,text,date,text,jsonb,uuid) from public,anon;
grant execute on function climbing_progress_v4(),public_climbing_achievements_v4(uuid[],uuid),
 climbing_ascent_batch_save_v3(uuid,text,date,text,jsonb,uuid) to authenticated;
