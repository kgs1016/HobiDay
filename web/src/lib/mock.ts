/* 목데이터 — Supabase 연결 전까지 화면 검증용.
   실제 스키마 기준은 supabase/migrations/ — PRODUCT.md 의 스케치는 낡았다. */

import type { CareerId, LevelId } from "./levels";
import type { GenderMode } from "@/lib/capacity";

export type SessionStatus = "open" | "confirmed" | "closed";

export interface Session {
  id: string;
  /* 표시용 장소명 — gym master 연결 후에는 canonical name 이 들어온다 */
  gym: string;
  /* Gym Master 연결 (gyms.id). 옛 모임과 목데이터에는 없다 */
  gymId?: string;
  /* 암장 대표사진 — 사진 수집 전까지는 없다. 없으면 카드가 placeholder */
  gymThumb?: string;
  date: string; // "토 8/1"
  start: string; // "15:00"
  end: string; // "17:00"
  /* 원본 ISO. date/start 는 사람이 읽는 값이라 비교에 못 쓴다.
     "이미 시작했나" 같은 판단은 이걸로 한다. 목데이터에는 없다. */
  startsAt?: string;
  endsAt?: string;
  /* 뜻이 genderMode 를 따라간다 — 반반이면 성별당 인원(1 = 1:1, 2 = 2:2),
     무관이면 총 인원(2 · 3 · 4명). lib/capacity.ts 참고. */
  capacity: number;
  genderMode?: GenderMode;
  levelMin: LevelId;
  levelMax: LevelId;
  ageMin: number; // 25 = 20대 중후반 시작점
  ageMax: number;
  note?: string;
  maleJoined: number;
  femaleJoined: number;
  status: SessionStatus;
  isAway?: boolean; // 내 홈짐과 다른 짐 (🗺 원정)
  /* 모임을 연 사람. 참가자와 달리 확정 전에도 공개한다.
     개설자가 탈퇴하면 host_id 가 null 이 되므로 없을 수 있다. */
  host?: SessionHost;
  /* 조기 확정 — 2:2 로 열었지만 남녀 수가 맞으면 그 인원으로 확정하자는 제안.
     호스트가 걸고 게스트가 받는다. */
  iAmHost?: boolean;
  earlyConfirmAt?: string | null;
  myAck?: boolean;
  /* 이 모임에 대한 내 신청 상태 — waiting · confirmed · cancelled.
     신청한 적이 없으면 null. 목록 카드가 버튼을 끄는 데 쓴다. */
  myStatus?: string | null;
}

export interface SessionHost {
  id: string;
  nickname: string;
  photo?: string;
  age?: number;
  area?: string;
  level?: LevelId;
}

export interface Person {
  id: string;
  nickname: string;
  age: number;
  gender: "m" | "f";
  level: LevelId;
  careerId?: CareerId;
  height?: number;
  homeGym: string;
  mbti: string;
  area: string;
  photo?: string;
}

export const MOCK_SESSIONS: Session[] = [
  {
    id: "s1",
    gym: "더클라임 B홍대점",
    date: "토 8/1",
    start: "15:00",
    end: "17:00",
    capacity: 2,
    levelMin: 2,
    levelMax: 3,
    ageMin: 27,
    ageMax: 33,
    note: "끝나고 저녁 같이 먹어요",
    maleJoined: 2,
    femaleJoined: 1,
    status: "open",
    host: { id: "p1", nickname: "서연", age: 27, area: "연남동", level: 3 },
  },
  {
    id: "s2",
    gym: "더클라임 연남점",
    date: "일 8/2",
    start: "11:00",
    end: "13:00",
    capacity: 2,
    levelMin: 1,
    levelMax: 2,
    ageMin: 24,
    ageMax: 29,
    note: "볼더링 처음이어도 환영! 같이 워밍업부터",
    maleJoined: 1,
    femaleJoined: 1,
    status: "open",
    host: { id: "p3", nickname: "하은", age: 31, area: "상수동", level: 2 },
  },
  {
    id: "s3",
    gym: "홍대클라이밍센터",
    date: "토 8/1",
    start: "19:00",
    end: "21:00",
    capacity: 2,
    levelMin: 3,
    levelMax: 4,
    ageMin: 28,
    ageMax: 36,
    maleJoined: 2,
    femaleJoined: 2,
    status: "confirmed",
    isAway: true,
    host: { id: "p2", nickname: "지훈", age: 29, area: "망원동", level: 3 },
  },
  {
    id: "s4",
    gym: "써미트클라이밍센터",
    date: "수 8/5",
    start: "19:30",
    end: "21:00",
    capacity: 2,
    levelMin: 2,
    levelMax: 3,
    ageMin: 25,
    ageMax: 32,
    note: "퇴근하고 한 판!",
    maleJoined: 0,
    femaleJoined: 1,
    status: "open",
    host: { id: "p4", nickname: "민지", age: 26, area: "연희동", level: 4 },
  },
  {
    id: "s5",
    gym: "더클라임 강남점",
    date: "목 8/6",
    start: "10:00",
    end: "12:00",
    capacity: 3,
    genderMode: "any",
    levelMin: 1,
    levelMax: 2,
    ageMin: 24,
    ageMax: 33,
    note: "성별 상관없이 셋이서 가볍게",
    maleJoined: 2,
    femaleJoined: 0,
    status: "open",
    host: { id: "p2", nickname: "지훈", age: 29, area: "망원동", level: 2 },
  },
];

export const MOCK_PEOPLE: Person[] = [
  { id: "p1", nickname: "서연", age: 27, gender: "f", level: 3, careerId: 4, height: 164, homeGym: "써미트클라이밍센터", mbti: "ENFP", area: "연남동" },
  { id: "p2", nickname: "지훈", age: 29, gender: "m", level: 3, careerId: 2, homeGym: "더클라임 연남점", mbti: "ISTP", area: "망원동" },
  { id: "p3", nickname: "하은", age: 31, gender: "f", level: 2, careerId: 1, height: 158, homeGym: "더클라임 B홍대점", mbti: "ISFJ", area: "상수동" },
  { id: "p4", nickname: "민지", age: 26, gender: "f", level: 4, careerId: 6, height: 170, homeGym: "더클라임 강남점", mbti: "INTP", area: "연희동" },
];

export function slotsLeft(s: Session) {
  const joined = s.maleJoined + s.femaleJoined;
  /* 성별 무관 모임에는 "남 자리 / 여 자리" 라는 게 없다. 총 자리만 센다 —
     성별로 나눠 보여주면 없는 규칙을 있는 것처럼 말하게 된다. */
  if (s.genderMode === "any")
    return { male: 0, female: 0, total: Math.max(0, s.capacity - joined) };
  return {
    male: s.capacity - s.maleJoined,
    female: s.capacity - s.femaleJoined,
    total: Math.max(0, s.capacity * 2 - joined),
  };
}
