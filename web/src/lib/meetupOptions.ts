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

/* 나이 눈금 하나로 "부터" 와 "까지" 를 모두 만든다.
   예전에는 두 목록을 따로 적어놔서 시작 칸은 20대 초반부터인데 끝 칸은
   20대 후반부터였다 — 같은 사다리인데 칸이 달랐다. */
export const AGE_BANDS: readonly { label: string; from: number; to: number }[] = [
  { label: "20대 초반", from: 20, to: 23 },
  { label: "20대 중반", from: 24, to: 26 },
  { label: "20대 후반", from: 27, to: 29 },
  { label: "30대 초반", from: 30, to: 33 },
  { label: "30대 중반", from: 34, to: 36 },
  { label: "30대 후반", from: 37, to: 39 },
  { label: "40대 초반", from: 40, to: 43 },
  { label: "40대 중반", from: 44, to: 46 },
  { label: "40대 후반", from: 47, to: 49 },
];

/** 시작 칸 — 눈금 전부 */
export const AGE_FROM: readonly (readonly [string, number])[] = AGE_BANDS.map(
  (b) => [`${b.label}부터`, b.from] as const
);

/** 끝 칸 — 고른 시작보다 이른 칸은 뺀다.
 *  "20대 후반부터 ~ 20대 초반까지" 같은 뒤집힌 범위를 애초에 못 만든다. */
export function ageToOptions(from: number): readonly (readonly [string, number])[] {
  return AGE_BANDS.filter((b) => b.to >= from).map(
    (b) => [`${b.label}까지`, b.to] as const
  );
}

/** 시작을 뒤로 옮겼을 때 끝이 그보다 앞이면 끌어올린다 */
export function clampAgeTo(from: number, to: number) {
  const first = ageToOptions(from)[0][1];
  return to >= first ? to : first;
}

/** 26 → "20대 중반". 카드와 필터 버튼이 같은 말을 쓰게 하는 자리다 */
export function ageBandLabel(n: number) {
  const decade = Math.floor(n / 10) * 10;
  const pos = n % 10 <= 3 ? "초반" : n % 10 <= 6 ? "중반" : "후반";
  return `${decade}대 ${pos}`;
}

/** "20대 후반~30대 초반" · 같은 칸이면 하나만.
 *  좁은 카드와 넓은 시트가 붙임표만 다르게 쓴다. */
export function ageRangeLabel(min: number, max: number, sep = "~") {
  const a = ageBandLabel(min);
  const b = ageBandLabel(max);
  return a === b ? a : `${a}${sep}${b}`;
}
