-- ═══════════════════════════════════════════════════════════════
--  Gym Master — 서울/경기 실사용 볼더링 암장 마스터 테이블
-- ═══════════════════════════════════════════════════════════════
-- 지금까지 모임의 장소는 sessions.gym 자유입력 문자열이었다. 같은 암장이
-- "더클라임 연남" / "더클라임 연남점" 으로 갈라지고, 필터도 하드코딩 5개
-- 목록(meetupOptions.GYMS)이 전부였다.
--
-- 여기서는 테이블과 sessions.gym_id 연결만 만든다.
--   · seed(200곳)  → 20260828121000_gym_seed.sql
--   · backfill/RPC → 20260828122000_gym_backfill_rpcs.sql
--
-- 원본은 hobiday_actual_use_bouldering_gyms_FINAL_2026-08-28.xlsx 의
-- Claude_Code_Import 시트 하나다. 성인 일반·남녀 공용·운영 중·볼더링
-- 가능한 곳만 담겨 있고, 어린이/여성 전용·공공 강좌형·리드 전용·폐업은
-- 이 테이블에 넣지 않는다 (제외_참고 시트는 import 대상이 아니다).
--
-- sessions.gym 문자열은 지우지 않는다 — 과거 모임과 옛 앱이 그걸 읽는다.
-- gym_id 는 nullable 로 시작하고, NOT NULL 강제는 이 단계에서 하지 않는다.

create table if not exists gyms (
  id            uuid primary key default gen_random_uuid(),
  -- Excel 원본의 행 식별자. seed 를 몇 번을 다시 돌려도 이 키로 upsert 되어
  -- 중복이 생기지 않는다.
  import_key    text not null unique,
  name          text not null,
  brand         text,
  branch_name   text,
  region        text not null,          -- 서울 · 경기
  city_district text not null,          -- 마포구 · 수원시 …
  subdistrict   text,
  address       text not null,
  climbing_type text,                   -- 볼더링 · 볼더링+리드 …
  aliases       text[],                 -- 옛 상호·통칭 (backfill 매칭에도 쓴다)
  is_active     boolean not null default true,
  verified_at   date,
  source_url    text,
  -- 대표사진 — 사진수집_큐 작업이 끝나면 채운다. 지금은 전부 null 이고,
  -- 화면은 null 이면 placeholder 를 그린다. 외부 이미지를 hotlink 하지 않는다.
  thumbnail_url     text,
  photo_source      text,
  photo_permission  text,
  photo_verified_at timestamptz,
  created_at    timestamptz default now()
);

alter table gyms enable row level security;

-- 암장 정보는 개인정보가 아니지만 "가입 후 이용" 원칙은 같다 (sessions 와 동일)
drop policy if exists "gyms: readable" on gyms;
create policy "gyms: readable" on gyms
  for select to authenticated using (true);
-- 쓰기는 seed 마이그레이션과 운영자만 — 클라이언트 write 경로는 없다

-- 검색은 이름·별칭·지역으로 한다. 200곳 규모라 이 이상은 필요 없다.
create index if not exists gyms_name_idx            on gyms (name);
create index if not exists gyms_region_district_idx on gyms (region, city_district);
create index if not exists gyms_aliases_gin_idx     on gyms using gin (aliases);

-- ── sessions 연결 ──────────────────────────────────────────────
-- 암장이 마스터에서 빠져도(폐업 등) 과거 모임 기록은 남아야 하므로
-- on delete set null. gym 문자열이 여전히 있어 표시는 깨지지 않는다.
alter table sessions
  add column if not exists gym_id uuid references gyms(id) on delete set null;

create index if not exists sessions_gym_id_idx on sessions (gym_id);

-- ── 목록 RPC ───────────────────────────────────────────────────
-- 모임 만들기의 암장 선택과 모임 찾기의 짐 필터가 같이 쓴다.
-- 운영 중인 곳만, 지역 → 구/시 → 이름 순으로.
create or replace function gym_list()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
    select g.id, g.name, g.brand, g.branch_name,
           g.region, g.city_district, g.subdistrict,
           g.address, g.climbing_type, g.aliases, g.thumbnail_url
      from gyms g
     where g.is_active
     order by g.region, g.city_district, g.name
  ) t;
$$;

revoke execute on function gym_list() from public, anon;
grant  execute on function gym_list() to authenticated;
