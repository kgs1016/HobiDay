/* 모임 정원.
   예전엔 capacity 의 뜻이 성비 모드에 따라 갈렸다 — 반반이면 성별당
   인원, 무관이면 총 인원. 2026-09 에 성비를 없애면서 뜻이 하나로
   줄었다: **언제나 총 인원**이다.

   파일은 남겨둔다. 정원을 말하는 방식(칩 라벨 · 문장 속 표기)이 여러
   화면에 흩어져 있어서, 한곳에 모아두는 값은 그대로 쓸모가 있다. */

/** 모임을 열 때 고를 수 있는 정원. 혼자는 모임이 아니라서 2부터 */
export const CAPACITY_CHOICES = [2, 3, 4, 5, 6, 7, 8];

export const CAPACITY_MIN = 2;
export const CAPACITY_MAX = 8;

/** 다 차면 몇 명인가 — 이제 capacity 그 자체다 */
export function totalSeats(capacity: number) {
  return capacity;
}

/** 카드·목록에 붙는 짧은 표기 — "4명" */
export function capacityLabel(capacity: number) {
  return `${capacity}명`;
}

/** 조사까지 붙인 표기 — "4명으로". 문장에 넣을 땐 이걸 쓴다 */
export function capacityRo(capacity: number) {
  return `${capacity}명으로`;
}
