/** 암장 안내표의 명시적인 V 표기만 등록한다. 기존 버전은 수정하지 않고 새 ID를 발급한다. */
export type GymGradeMapping = {
  id: string; brandId: string; color: string; min: number; max: number | null;
  sourceUrl: string; sourceLabel: string; publishedOn: string | null; checkedOn: string;
};
const metroSource = {
  sourceUrl: "https://spiri7.com/post/479",
  sourceLabel: "메트로락 암장 안내표 · 이용자 재게시",
  publishedOn: null, checkedOn: "2026-09-09",
};
const theclimbSource = {
  sourceUrl: "https://unsasasi.tistory.com/1",
  sourceLabel: "더클라임 사당점 방문기 · 현장 안내판 사진",
  publishedOn: "2025-07-11", checkedOn: "2026-09-09",
};
export const GYM_GRADE_MAPPINGS: readonly GymGradeMapping[] = [
  { id: "metrorock-20260909-red", brandId: "metrorock", color: "빨강", min: 0, max: 0, ...metroSource },
  { id: "metrorock-20260909-yellow", brandId: "metrorock", color: "노랑", min: 1, max: 2, ...metroSource },
  { id: "metrorock-20260909-green", brandId: "metrorock", color: "초록", min: 2, max: 3, ...metroSource },
  { id: "metrorock-20260909-blue", brandId: "metrorock", color: "파랑", min: 3, max: 4, ...metroSource },
  { id: "metrorock-20260909-purple", brandId: "metrorock", color: "보라", min: 4, max: 5, ...metroSource },
  { id: "metrorock-20260909-black", brandId: "metrorock", color: "검정", min: 5, max: null, ...metroSource },
  // 2024 일산 / 2025 사당 안내판이 일치하는 하위 6색. 핑크 추가 이후 상위 구간은 보류한다.
  // 현재 전 지점 적용을 확인한 값이 아니라 날짜가 있는 공개 안내판의 참고 환산이다.
  { id: "theclimb-20250711-white", brandId: "theclimb", color: "흰색", min: -1, max: -1, ...theclimbSource },
  { id: "theclimb-20250711-yellow", brandId: "theclimb", color: "노랑", min: 0, max: 0, ...theclimbSource },
  { id: "theclimb-20250711-orange", brandId: "theclimb", color: "주황", min: 1, max: 2, ...theclimbSource },
  { id: "theclimb-20250711-green", brandId: "theclimb", color: "초록", min: 2, max: 3, ...theclimbSource },
  { id: "theclimb-20250711-blue", brandId: "theclimb", color: "파랑", min: 3, max: 4, ...theclimbSource },
  { id: "theclimb-20250711-red", brandId: "theclimb", color: "빨강", min: 4, max: 5, ...theclimbSource },
];
export function findGradeMapping(brandId: string | undefined, color: string) {
  return GYM_GRADE_MAPPINGS.find(item => item.brandId === brandId && item.color === color);
}
export function gradeMappingById(id: string | null | undefined) {
  return GYM_GRADE_MAPPINGS.find(item => item.id === id);
}
export function gradeMappingLabel(mapping: GymGradeMapping) {
  const lower = mapping.min === -1 ? "VB" : `V${mapping.min}`;
  return mapping.max === null ? `${lower}+` : mapping.max === mapping.min ? lower : `${lower}–V${mapping.max}`;
}
