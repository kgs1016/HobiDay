/* 모임 정원.

   capacity 는 **최대 정원**이다 — 채워야 하는 수가 아니라 거기까지만
   받는다는 뜻이다. 둘만 모여도 모임은 열리고, 열린 뒤에도 최대 정원까지
   계속 받는다 (2026-09 결정).

   뜻이 두 번 바뀐 자리라 한곳에 모아둔다.
     ~2026-08  성비 모드에 따라 갈렸다 (반반이면 성별당 인원)
     2026-09   총 인원으로 통일
     2026-09   "채워야 하는 수" 에서 "최대" 로 */

/** 모임을 열 때 고를 수 있는 최대 정원. 혼자는 모임이 아니라서 2부터 */
export const CAPACITY_CHOICES = [2, 3, 4, 5, 6];

export const CAPACITY_MIN = 2;
export const CAPACITY_MAX = 6;

/** 모임이 열리는 최소 인원. 호스트를 포함해 둘이면 그 순간 확정이다 */
export const CONFIRM_AT = 2;

/** 다 차면 몇 명인가 */
export function totalSeats(capacity: number) {
  return capacity;
}

/** 정원 표기 — "최대 4명". 채워야 하는 수로 읽히지 않게 "최대" 를 붙인다 */
export function capacityLabel(capacity: number) {
  return `최대 ${capacity}명`;
}

/** 사람 수 그 자체 — "4명". 현황·참가 인원처럼 정원이 아닌 곳에 쓴다 */
export function headcountLabel(n: number) {
  return `${n}명`;
}
