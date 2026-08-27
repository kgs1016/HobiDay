/* 모임의 성비 규칙.
   capacity 라는 숫자의 뜻이 여기에 달려 있어서 한곳에 모아뒀다.

     balanced  성별당 인원 — 1 이면 1:1(2명), 2 면 2:2(4명)
     any       총 인원 — 2 · 3 · 4명. 성별은 안 따진다

   나머지 흐름(신청 → 호스트 승인 → 2명부터 채팅방 → 환불 규정)은
   두 모드가 똑같다. */

export type GenderMode = "balanced" | "any";

/* 라벨이 "성비" 라서 칩은 그 뒤에 붙는 값만 말하면 된다 —
   "성비 맞춤" · "성비 상관없음". 설명을 따로 달지 않아도 읽힌다. */
export const GENDER_MODES: { id: GenderMode; label: string }[] = [
  { id: "balanced", label: "맞춤" },
  { id: "any", label: "상관없음" },
];

/** 모드별 정원 선택지. 뜻이 다르므로 숫자도 다르다 */
export const CAPACITY_CHOICES: Record<GenderMode, number[]> = {
  balanced: [1, 2],
  any: [2, 3, 4],
};

/* 아래 함수들의 mode 기본값이 balanced 인 건 컬럼이 생기기 전의 행 때문이다.
   그런 행은 전부 성비 모임이었다. */

/** 다 차면 몇 명인가 */
export function totalSeats(capacity: number, mode: GenderMode = "balanced") {
  return mode === "any" ? capacity : capacity * 2;
}

/** 카드·목록에 붙는 짧은 표기 — "2:2" 또는 "4명" */
export function capacityLabel(capacity: number, mode: GenderMode = "balanced") {
  return mode === "any" ? `${capacity}명` : `${capacity}:${capacity}`;
}

/** 조사까지 붙인 표기 — "2:2로" · "3명으로".
    받침이 달라서 "로/으로" 가 갈린다. 문장에 넣을 땐 이걸 쓴다. */
export function capacityRo(capacity: number, mode: GenderMode = "balanced") {
  return mode === "any" ? `${capacity}명으로` : `${capacity}:${capacity}로`;
}

/** 정원 칩 — 성비 모드는 총원을 같이 알려줘야 헷갈리지 않는다 */
export function capacityChipLabel(capacity: number, mode: GenderMode) {
  return mode === "any" ? `${capacity}명` : `${capacity}:${capacity} (${capacity * 2}명)`;
}
