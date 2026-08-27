/* 홈 "모임 찾기" 의 필터.
   거르는 조건은 모임을 열 때 고르는 항목과 같다 — 짐 · 날짜 · 시간 ·
   성비 · 정원 · 레벨 · 나이대. 조건을 새로 만들지 않고 그대로 뒤집은
   것이라, 여는 쪽과 찾는 쪽이 같은 말을 쓴다.

   서버를 다시 부르지 않고 이미 받아온 목록에서 거른다. 목록은 시작 전
   모임만 담고 있어서(session_list) 양이 적고, 조건을 바꿀 때마다 왕복하면
   손끝보다 느리다. */

import type { LevelId } from "./levels";
import type { Session } from "./mock";
import { totalSeats, type GenderMode } from "./capacity";

/** 시작 시각 기준. 저녁이 대부분이라 그 안을 더 쪼개지는 않았다 */
export type TimeBand = "morning" | "day" | "evening";

export const TIME_BANDS: { id: TimeBand; label: string; from: number; to: number }[] = [
  { id: "morning", label: "오전", from: 0, to: 12 },
  { id: "day", label: "낮", from: 12, to: 17 },
  { id: "evening", label: "저녁", from: 17, to: 24 },
];

/** 나이대 — 모임 만들기의 "20대 후반부터 ~ 30대 초반까지" 와 같은 눈금 */
export const AGE_BANDS: { id: string; label: string; from: number; to: number }[] = [
  { id: "20e", label: "20대 초반", from: 20, to: 23 },
  { id: "20m", label: "20대 중반", from: 24, to: 26 },
  { id: "20l", label: "20대 후반", from: 27, to: 29 },
  { id: "30e", label: "30대 초반", from: 30, to: 33 },
  { id: "30m", label: "30대 중반", from: 34, to: 36 },
  { id: "30l", label: "30대 후반", from: 37, to: 39 },
];

/** 정원은 총 인원으로 센다. 그래야 1:1 과 2명이 한 칸에 놓인다 */
export const SEAT_CHOICES = [2, 3, 4];

export interface SessionFilter {
  gyms: string[];
  /** "YYYY-MM-DD" · 빈 문자열이면 전체 */
  date: string;
  times: TimeBand[];
  genderMode: GenderMode | null;
  seats: number[];
  levels: LevelId[];
  ages: string[];
}

export const EMPTY_FILTER: SessionFilter = {
  gyms: [],
  date: "",
  times: [],
  genderMode: null,
  seats: [],
  levels: [],
  ages: [],
};

/** 몇 가지 조건이 걸려 있나 — 초기화 버튼을 띄울지 정한다 */
export function activeFilterCount(f: SessionFilter) {
  return (
    (f.gyms.length ? 1 : 0) +
    (f.date ? 1 : 0) +
    (f.times.length ? 1 : 0) +
    (f.genderMode ? 1 : 0) +
    (f.seats.length ? 1 : 0) +
    (f.levels.length ? 1 : 0) +
    (f.ages.length ? 1 : 0)
  );
}

/** "2026-08-29" — toISOString 은 UTC 라 한국 오전 9시 이전에 하루가 밀린다 */
export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 카드에 적힌 "15:00" 에서 시(hour)만 — 목데이터에도 있는 값이라 이걸 쓴다 */
function startHour(s: Session) {
  return Number(s.start.slice(0, 2));
}

export function applySessionFilter(list: Session[], f: SessionFilter) {
  return list.filter((s) => {
    if (f.gyms.length && !f.gyms.includes(s.gym)) return false;

    /* 날짜는 원본 ISO 로만 판단한다. 카드의 "토 8/1" 은 연도가 없어서
       내년 모임과 구분이 안 된다. 목데이터에는 ISO 가 없으니 그냥 통과. */
    if (f.date && s.startsAt && ymd(new Date(s.startsAt)) !== f.date) return false;

    if (f.times.length) {
      const h = startHour(s);
      const hit = f.times.some((id) => {
        const b = TIME_BANDS.find((x) => x.id === id)!;
        return h >= b.from && h < b.to;
      });
      if (!hit) return false;
    }

    if (f.genderMode) {
      const mode = s.genderMode ?? "balanced";
      if (mode !== f.genderMode) return false;
    }

    if (f.seats.length && !f.seats.includes(totalSeats(s.capacity, s.genderMode))) {
      return false;
    }

    /* 레벨·나이대는 모임이 "범위" 로 열려 있다. 고른 값이 그 범위에
       걸치기만 하면 보여준다 — 정확히 같아야 한다고 하면 L2~L3 모임이
       L2 를 고른 사람에게 안 보인다. */
    if (f.levels.length && !f.levels.some((l) => l >= s.levelMin && l <= s.levelMax)) {
      return false;
    }

    if (f.ages.length) {
      const hit = f.ages.some((id) => {
        const b = AGE_BANDS.find((x) => x.id === id)!;
        return b.from <= s.ageMax && b.to >= s.ageMin;
      });
      if (!hit) return false;
    }

    return true;
  });
}
