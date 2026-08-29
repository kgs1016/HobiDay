-- ═══════════════════════════════════════════════════════════════
--  옛 암장 이름을 master 로 들인다 — 같은 곳이 두 번 뜨지 않게
-- ═══════════════════════════════════════════════════════════════
-- 짐 필터 목록이 master 전체 + "master 에 없는 이름으로 열린 모임" 이라,
-- 같은 암장이 두 줄로 보였다.
--
--   더클라임 B홍대점   (master)
--   더클라임 B홍대     (예전 하드코딩 목록으로 열린 모임)
--
-- 20260828122000 이 이 넷을 gym_id 로 이어주긴 했지만, 이어준 사실이
-- master 에는 안 남았다. aliases 에 넣어야 master 가 그 이름을 아는
-- 것이 되고, 앞으로 같은 문자열을 만나도 스스로 이어붙인다.
--
-- 여기서 하는 일은 셋이다.
--   ① 옛 이름을 aliases 로 옮긴다
--   ② 그 별칭으로 아직 안 이어진 모임을 잇는다
--   ③ 이어진 모임의 gym 문자열을 canonical name 으로 맞춘다
--
-- ③ 이 필요한 이유: session_list·session_detail 은 coalesce(master, legacy)
-- 로 canonical 을 내려주지만, 채팅 목록·매칭 기록·내가 만든 모임은 아직
-- s.gym 을 그대로 읽는다. 그래서 같은 모임이 목록에서는 "더클라임 B홍대점",
-- 채팅에서는 "더클라임 B홍대" 로 보였다. 이어진 순간 legacy 문자열을
-- 붙들고 있을 이유가 없다 — 가리키는 곳이 같다.

-- ── ① 옛 이름 → aliases ────────────────────────────────────────
-- 이미 들어 있으면 distinct 로 걸러진다 (몇 번을 다시 돌려도 같다).
update gyms g
   set aliases = (
     select array_agg(distinct a order by a)
       from unnest(coalesce(g.aliases, '{}'::text[]) || m.legacy) a
   )
  from (values
    ('GYM-B40823BB80D7', array['더클라임 B홍대']),
    -- '더월클라이밍 연남' 도 같은 곳으로 본다. 더클라임은 더월클라이밍의
    -- 바뀐 상호이고, 이 행은 이미 '더월클라이밍(주)연남점' 을 별칭으로
    -- 갖고 있다. master 에 연남 더월은 따로 없다.
    ('GYM-AB18BE72D536', array['더클라임 연남', '더월클라이밍 연남']),
    ('GYM-74AFFBBDA7B9', array['써미트클라이밍']),
    ('GYM-48356429175C', array['홍대클라이밍'])
  ) m(import_key, legacy)
 where g.import_key = m.import_key;

-- ── ② 별칭으로 다시 backfill ───────────────────────────────────
-- 20260828122000 과 같은 규칙이다 — 후보가 정확히 하나일 때만 잇는다.
-- 비슷하다는 이유로 다른 지점에 붙이는 순간 과거 기록이 거짓말이 된다.
update sessions s
   set gym_id = (select g.id from gyms g
                  where s.gym = any(coalesce(g.aliases, '{}'::text[])))
 where s.gym_id is null
   and (select count(*) from gyms g
         where s.gym = any(coalesce(g.aliases, '{}'::text[]))) = 1;

-- ── ③ 이어진 모임의 이름을 canonical 로 ────────────────────────
update sessions s
   set gym = g.name
  from gyms g
 where s.gym_id = g.id
   and s.gym is distinct from g.name;

-- 남은 것은 지우지도, 실패시키지도 않는다. 사람이 봐야 하는 목록이다.
do $$
declare r record; n int := 0;
begin
  for r in
    select s.gym, count(*) as cnt
      from sessions s where s.gym_id is null
     group by s.gym order by cnt desc
  loop
    raise notice 'gym 수동 검토 필요: "%" (모임 %건)', r.gym, r.cnt;
    n := n + 1;
  end loop;
  if n = 0 then
    raise notice 'gym: 모든 모임이 master 에 연결됐습니다';
  end if;
end $$;
