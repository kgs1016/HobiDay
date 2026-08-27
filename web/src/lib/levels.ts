/* 레벨 체계 L1~L5 — PRODUCT.md 기준 (더클라임 색 + V등급, 도달 기간 미표기) */

export type LevelId = 1 | 2 | 3 | 4 | 5;

export interface Level {
  id: LevelId;
  name: string;
  colors: string;
  vgrade: string;
}

export const LEVELS: Level[] = [
  { id: 1, name: "입문", colors: "흰·노랑", vgrade: "Vb~V0-" },
  { id: 2, name: "초급", colors: "주황·초록", vgrade: "V0~V0+" },
  { id: 3, name: "중급", colors: "파랑", vgrade: "V1~V2" },
  { id: 4, name: "중상급", colors: "빨강·핑크", vgrade: "V3~V5" },
  { id: 5, name: "상급", colors: "보라 이상", vgrade: "V6+" },
];

export const level = (id: LevelId) => LEVELS[id - 1];

/** 목록 카드용 짧은 표기 — "L2 초급–L3 중급" / "L3 중급".
    색·V등급까지 다 붙이면 카드가 문장이 된다. 상세에서만 전체를 보여준다. */
export function levelRangeShort(min: LevelId, max: LevelId): string {
  if (min === max) return `L${min} ${level(min).name}`;
  return `L${min} ${level(min).name}–L${max} ${level(max).name}`;
}

/** "L2 초급 ~ L3 중급 (주황·초록·파랑)" */
export function levelRangeLabel(min: LevelId, max: LevelId): string {
  const colors = LEVELS.slice(min - 1, max)
    .map((l) => l.colors)
    .join("·");
  if (min === max) return `L${min} ${level(min).name} (${level(min).colors})`;
  return `L${min} ${level(min).name} ~ L${max} ${level(max).name} (${colors})`;
}

/* ── 구력 ──
   레벨만으로는 "6개월 만에 파랑"과 "3년 걸려 파랑"이 구분되지 않는다.
   실력이 같아도 대화 맥락과 태도가 달라서 별도로 받는다. */

export type CareerId = 1 | 2 | 3 | 4 | 5 | 6;

export const CAREERS: { id: CareerId; label: string }[] = [
  { id: 1, label: "3개월 미만" },
  { id: 2, label: "3~6개월" },
  { id: 3, label: "6개월~1년" },
  { id: 4, label: "1~2년" },
  { id: 5, label: "2~3년" },
  { id: 6, label: "3년 이상" },
];

export const career = (id: CareerId) => CAREERS[id - 1];

/** 값이 없을 수 있어(기존 프로필) 라벨만 안전하게 뽑는다 */
export function careerLabel(id?: CareerId | null): string | null {
  return id ? (CAREERS[id - 1]?.label ?? null) : null;
}
