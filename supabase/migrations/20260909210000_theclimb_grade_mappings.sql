-- 더클라임: 2024 일산 및 2025 사당 방문기의 안내판에서 일치하는 하위 6색.
-- 2025-07-11은 방문기 발행일이며 현재 전 지점에 대한 재검증일이 아니다.
-- 핑크 추가 이후 상위 구간의 V범위를 확인하지 못해 핑크~검정은 등록하지 않는다.
-- 기존 환산 버전/기록은 변경하지 않는다.
insert into climbing_grade_mappings
select * from jsonb_to_recordset(
$grade_mappings$
[
  {
    "id": "theclimb-20250711-white",
    "brand_id": "theclimb",
    "color": "흰색",
    "v_min": -1,
    "v_max": -1,
    "source_url": "https://unsasasi.tistory.com/1",
    "source_label": "더클라임 사당점 방문기 · 현장 안내판 사진",
    "published_on": "2025-07-11",
    "checked_on": "2026-09-09"
  },
  {
    "id": "theclimb-20250711-yellow",
    "brand_id": "theclimb",
    "color": "노랑",
    "v_min": 0,
    "v_max": 0,
    "source_url": "https://unsasasi.tistory.com/1",
    "source_label": "더클라임 사당점 방문기 · 현장 안내판 사진",
    "published_on": "2025-07-11",
    "checked_on": "2026-09-09"
  },
  {
    "id": "theclimb-20250711-orange",
    "brand_id": "theclimb",
    "color": "주황",
    "v_min": 1,
    "v_max": 2,
    "source_url": "https://unsasasi.tistory.com/1",
    "source_label": "더클라임 사당점 방문기 · 현장 안내판 사진",
    "published_on": "2025-07-11",
    "checked_on": "2026-09-09"
  },
  {
    "id": "theclimb-20250711-green",
    "brand_id": "theclimb",
    "color": "초록",
    "v_min": 2,
    "v_max": 3,
    "source_url": "https://unsasasi.tistory.com/1",
    "source_label": "더클라임 사당점 방문기 · 현장 안내판 사진",
    "published_on": "2025-07-11",
    "checked_on": "2026-09-09"
  },
  {
    "id": "theclimb-20250711-blue",
    "brand_id": "theclimb",
    "color": "파랑",
    "v_min": 3,
    "v_max": 4,
    "source_url": "https://unsasasi.tistory.com/1",
    "source_label": "더클라임 사당점 방문기 · 현장 안내판 사진",
    "published_on": "2025-07-11",
    "checked_on": "2026-09-09"
  },
  {
    "id": "theclimb-20250711-red",
    "brand_id": "theclimb",
    "color": "빨강",
    "v_min": 4,
    "v_max": 5,
    "source_url": "https://unsasasi.tistory.com/1",
    "source_label": "더클라임 사당점 방문기 · 현장 안내판 사진",
    "published_on": "2025-07-11",
    "checked_on": "2026-09-09"
  }
]
$grade_mappings$::jsonb) as m(id text,brand_id text,color text,v_min integer,v_max integer,
 source_url text,source_label text,published_on date,checked_on date);

-- web/src/lib/gymGrades.ts의 동일한 브랜드 별칭/지점명 규칙만 허용한다.
create or replace function climbing_grade_brand(p_gym text)
returns text language sql immutable set search_path=public as $$
  select case
    when gym in ('metrorock','메트로락','메트로락클라이밍','메트로락클라이밍센터') then 'metrorock'
    when gym in ('theclimb','더클라임','더클라임클라이밍','더클',
      '더클라임문래','더클라임강남','더클라임신림','더클라임일산')
      or gym ~ '^(더클라임클라이밍|더클라임|더클|theclimb)[가-힣a-z0-9]+점$' then 'theclimb'
  end from (select lower(regexp_replace(p_gym,'[[:space:]]+','','g')) as gym) normalized;
$$;
revoke all on function climbing_grade_brand(text) from public,anon,authenticated;
