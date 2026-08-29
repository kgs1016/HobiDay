/* 홈 "모임 찾기" 의 필터.
   거르는 조건은 모임을 열 때 고르는 항목과 같다 — 짐 · 날짜 · 시간 ·
   성비 · 정원 · 레벨 · 나이대. 조건을 새로 만들지 않고 그대로 뒤집은
   것이라, 여는 쪽과 찾는 쪽이 같은 말을 쓴다.

   날짜 · 시간 · 레벨 · 나이대는 칸을 고르는 게 아니라 범위를 잡는다.
   찾는 사람은 "이번 주말 아무 때나" 처럼 폭으로 생각하고, 모임 자체도
   범위로 열린다("L2~L3", "20대 후반~30대 초반") — 한 칸만 고르게 하면
   걸치는 모임을 놓친다.

   서버를 다시 부르지 않고 이미 받아온 목록에서 거른다. 목록은 시작 전
   모임만 담고 있어서(session_list) 양이 적고, 조건을 바꿀 때마다 왕복하면
   손끝보다 느리다. */

import type { LevelId } from "./levels";
import type { Session } from "./mock";
import { totalSeats, type GenderMode } from "./capacity";

export interface SessionFilter {
  gyms: string[];
  /** 모임 날짜 범위 "YYYY-MM-DD" · 빈 문자열이면 그쪽은 열려 있음 */
  dateFrom: string;
  dateTo: string;
  /** 시작 시각 범위 "HH:MM" · 빈 문자열이면 열려 있음 */
  timeFrom: string;
  timeTo: string;
  genderMode: GenderMode | null;
  /** 총 인원. 성비 모드가 달라도 같은 잣대로 세려면 총원이어야 한다 */
  seats: number[];
  levelMin: LevelId | null;
  levelMax: LevelId | null;
  ageFrom: number | null;
  ageTo: number | null;
}

export const EMPTY_FILTER: SessionFilter = {
  gyms: [],
  dateFrom: "",
  dateTo: "",
  timeFrom: "",
  timeTo: "",
  genderMode: null,
  seats: [],
  levelMin: null,
  levelMax: null,
  ageFrom: null,
  ageTo: null,
};

/* 정원 선택지는 성비를 따라간다. 성비를 "맞춤" 으로 잡아놓고 3명을
   고를 수 있으면 결과가 언제나 0이다 — 반반은 홀수가 안 나온다. */
export function seatChoices(
  mode: GenderMode | null
): { seats: number; label: string }[] {
  if (mode === "balanced")
    return [
      { seats: 2, label: "1:1 (2명)" },
      { seats: 4, label: "2:2 (4명)" },
    ];
  return [2, 3, 4].map((n) => ({ seats: n, label: `${n}명` }));
}

/** 성비를 바꾸면 그 모드에 없는 정원은 떨군다 */
export function withGenderMode(
  f: SessionFilter,
  mode: GenderMode | null
): SessionFilter {
  const ok = seatChoices(mode).map((c) => c.seats);
  return { ...f, genderMode: mode, seats: f.seats.filter((s) => ok.includes(s)) };
}

/** 몇 가지 조건이 걸려 있나 — 초기화 버튼을 띄울지 정한다 */
export function activeFilterCount(f: SessionFilter) {
  return (
    (f.gyms.length ? 1 : 0) +
    (f.dateFrom || f.dateTo ? 1 : 0) +
    (f.timeFrom || f.timeTo ? 1 : 0) +
    // 성비와 정원은 버튼 하나라 한 몫으로 센다
    (f.genderMode || f.seats.length ? 1 : 0) +
    (f.levelMin ? 1 : 0) +
    (f.ageFrom || f.ageTo ? 1 : 0)
  );
}

/** "2026-08-29" — toISOString 은 UTC 라 한국 오전 9시 이전에 하루가 밀린다 */
export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function applySessionFilter(list: Session[], f: SessionFilter) {
  return list.filter((s) => {
    if (f.gyms.length && !f.gyms.includes(s.gym)) return false;

    /* 날짜는 원본 ISO 로만 판단한다. 카드의 "토 8/1" 은 연도가 없어서
       내년 모임과 구분이 안 된다. 목데이터에는 ISO 가 없으니 그냥 통과.
       "YYYY-MM-DD" 는 자리수가 고정이라 문자열 비교가 곧 날짜 비교다. */
    if ((f.dateFrom || f.dateTo) && s.startsAt) {
      const d = ymd(new Date(s.startsAt));
      if (f.dateFrom && d < f.dateFrom) return false;
      if (f.dateTo && d > f.dateTo) return false;
    }

    /* "HH:MM" 은 0으로 채워져 있어서 문자열 비교가 곧 시각 비교다 */
    if (f.timeFrom && s.start < f.timeFrom) return false;
    if (f.timeTo && s.start > f.timeTo) return false;

    if (f.genderMode && (s.genderMode ?? "balanced") !== f.genderMode) return false;

    if (f.seats.length && !f.seats.includes(totalSeats(s.capacity, s.genderMode))) {
      return false;
    }

    /* 레벨·나이대는 모임이 범위로 열려 있다. 두 범위가 겹치기만 하면
       보여준다 — 감싸야 한다고 하면 L2~L3 모임이 L2 만 고른 사람에게
       안 보인다. */
    if (f.levelMin && f.levelMax) {
      if (f.levelMin > s.levelMax || f.levelMax < s.levelMin) return false;
    }
    if (f.ageFrom != null && f.ageTo != null) {
      if (f.ageFrom > s.ageMax || f.ageTo < s.ageMin) return false;
    }

    return true;
  });
}
