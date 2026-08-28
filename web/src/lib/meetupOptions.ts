/* 모임을 열 때와 찾을 때가 같은 선택지를 쓴다.
   한쪽에만 있는 값이 생기면 "만들 수는 있는데 찾을 수는 없는 모임" 이
   된다 — 그래서 두 화면이 이 파일 하나를 본다. */

/** 목데이터·폴백 전용 암장 목록.
 *  production 의 source of truth 는 Supabase gyms 테이블(gym master)이다 —
 *  화면은 fetchGyms() 로 마스터를 받고, Supabase 가 없거나(mock)
 *  마스터가 아직 없을 때(마이그레이션 전 DB)만 이 목록으로 동작한다. */
export const MOCK_GYMS = [
  "더클라임 B홍대점",
  "더클라임 연남점",
  "더클라임 강남점",
  "홍대클라이밍센터",
  "써미트클라이밍센터",
];

export const AGE_FROM: readonly (readonly [string, number])[] = [
  ["20대 초반부터", 20],
  ["20대 중반부터", 24],
  ["20대 후반부터", 27],
  ["30대 초반부터", 30],
  ["30대 중반부터", 34],
];

export const AGE_TO: readonly (readonly [string, number])[] = [
  ["20대 후반까지", 29],
  ["30대 초반까지", 33],
  ["30대 중반까지", 36],
  ["30대 후반까지", 39],
];

/** 26 → "20대 중반". 필터 버튼에 고른 범위를 적을 때 쓴다 */
export function ageBandLabel(n: number) {
  const decade = Math.floor(n / 10) * 10;
  const pos = n % 10 <= 3 ? "초반" : n % 10 <= 6 ? "중반" : "후반";
  return `${decade}대 ${pos}`;
}
