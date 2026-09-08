/* 모임에서 함께 탈 수준을 직접 선택한다. 저장된 1~5 ID는 유지하되,
   암장 색·V등급으로 환산하지 않는다. 기록 기반 암벽화 성취와 별개다. */

export type LevelId = 1 | 2 | 3 | 4 | 5;

export interface Level {
  id: LevelId;
  name: string;
  description: string;
}

export const LEVELS: Level[] = [
  { id: 1, name: "입문", description: "기본 동작과 안전 수칙을 배우는 단계" },
  { id: 2, name: "초급", description: "쉬운 문제를 스스로 완등하는 단계" },
  { id: 3, name: "중급", description: "다양한 동작과 벽의 문제를 풀어가는 단계" },
  { id: 4, name: "중상급", description: "어려운 동작을 연결해 완등하는 단계" },
  { id: 5, name: "상급", description: "고난도 문제를 분석하고 완등하는 단계" },
];

export const level = (id: LevelId) => LEVELS[id - 1];

/** 화면에는 수준 이름만 쓴다. 숫자 ID는 저장·필터 비교에만 사용한다. */
export function levelRangeShort(min: LevelId, max: LevelId): string {
  if (min === 1 && max === 5) return "수준 무관";
  if (min === max) return level(min).name;
  return `${level(min).name}–${level(max).name}`;
}

export function levelRangeLabel(min: LevelId, max: LevelId): string {
  return `참가 수준 · ${levelRangeShort(min, max)}`;
}

/* ── 구력 ──
   함께 등반할 사람의 경험을 알아보는 별도 정보다.
   등반 수준이나 암벽화 성취 계산에는 사용하지 않는다. */

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
