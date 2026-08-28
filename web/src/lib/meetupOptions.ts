/* 모임을 열 때와 찾을 때가 같은 선택지를 쓴다.
   한쪽에만 있는 값이 생기면 "만들 수는 있는데 찾을 수는 없는 모임" 이
   된다 — 그래서 두 화면이 이 파일 하나를 본다. */

/** 빠른 선택용. 여기 없는 짐은 만들 때 직접 입력한다 (서울·경기 전체 대상) */
export const GYMS = [
  "더클라임 B홍대",
  "더클라임 연남",
  "더월클라이밍 연남",
  "홍대클라이밍",
  "써미트클라이밍",
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
