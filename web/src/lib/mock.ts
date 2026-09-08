/* 목데이터 — Supabase 연결 전까지 화면 검증용.
   실제 스키마 기준은 supabase/migrations/ — PRODUCT.md 의 스케치는 낡았다. */

import type { CareerId, LevelId } from "./levels";

export type SessionStatus = "open" | "confirmed" | "closed";

export interface Session {
  id: string;
  /* 표시용 장소명 — gym master 연결 후에는 canonical name 이 들어온다 */
  gym: string;
  /* Gym Master 연결 (gyms.id). 옛 모임과 목데이터에는 없다 */
  gymId?: string;
  /* 암장 대표사진 — 없거나 불러오지 못하면 대체 표시 */
  gymThumb?: string;
  date: string; // "토 8/1"
  start: string; // "15:00"
  end: string; // "17:00"
  /* 원본 ISO. date/start 는 사람이 읽는 값이라 비교에 못 쓴다.
     "이미 시작했나" 같은 판단은 이걸로 한다. 목데이터에는 없다. */
  startsAt?: string;
  endsAt?: string;
  /* 최대 정원. 2~8명 — 호스트를 포함한 수다. 채워야 하는 수가 아니라
     여기까지만 받는다는 뜻이다 (둘만 모여도 모임은 열린다). */
  capacity: number;
  levelMin: LevelId;
  levelMax: LevelId;
  ageMin: number; // 25 = 20대 중후반 시작점
  ageMax: number;
  note?: string;
  /* 확정된 참가자 수 (호스트 포함). 예전엔 성별로 나눠 셌다. */
  joined: number;
  status: SessionStatus;
  isAway?: boolean; // 내 홈짐과 다른 짐 (🗺 원정)
  /* 모임을 연 사람. 참가자와 달리 확정 전에도 공개한다.
     개설자가 탈퇴하면 host_id 가 null 이 되므로 없을 수 있다. */
  host?: SessionHost;
  iAmHost?: boolean;
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
  /* 레벨은 선택 입력 — 없으면 카드·프로필에서 그 칸을 접는다 */
  level: LevelId | null;
  careerId?: CareerId;
  height?: number;
  homeGym: string;
  mbti: string;
  area: string;
  photo?: string;
  achievement?: import("./shoeProgress").PublicShoeAchievement;
}

export const MOCK_SESSIONS: Session[] = [
  {
    id: "s1",
    gym: "더클라임 사당점",
    gymThumb: "https://loigwslmwvltdurjttpe.supabase.co/storage/v1/object/public/gym-photos/HBD-GYM-0021.jpg",
    date: "토 8/1",
    start: "15:00",
    end: "17:00",
    capacity: 4,
    levelMin: 2,
    levelMax: 3,
    ageMin: 27,
    ageMax: 33,
    note: "끝나고 저녁 같이 먹어요",
    joined: 3,
    status: "confirmed",
    host: { id: "p1", nickname: "서연", age: 27, area: "연남동", level: 3 },
  },
  {
    id: "s2",
    gym: "더클라임 연남점",
    gymThumb: "https://loigwslmwvltdurjttpe.supabase.co/storage/v1/object/public/gym-photos/HBD-GYM-0051.jpg",
    date: "일 8/2",
    start: "11:00",
    end: "13:00",
    capacity: 4,
    levelMin: 1,
    levelMax: 2,
    ageMin: 24,
    ageMax: 29,
    note: "볼더링 처음이어도 환영! 같이 워밍업부터",
    joined: 2,
    status: "confirmed",
    host: { id: "p3", nickname: "하은", age: 31, area: "상수동", level: 2 },
  },
  {
    id: "s3",
    gym: "홍대클라이밍센터",
    gymThumb: "https://loigwslmwvltdurjttpe.supabase.co/storage/v1/object/public/gym-photos/HBD-GYM-0057.jpg",
    date: "토 8/1",
    start: "19:00",
    end: "21:00",
    capacity: 4,
    levelMin: 3,
    levelMax: 4,
    ageMin: 28,
    ageMax: 36,
    joined: 4,
    status: "confirmed",
    isAway: true,
    host: { id: "p2", nickname: "지훈", age: 29, area: "망원동", level: 3 },
  },
  {
    id: "s4",
    gym: "써미트클라이밍센터",
    gymThumb: "https://loigwslmwvltdurjttpe.supabase.co/storage/v1/object/public/gym-photos/HBD-GYM-0055.jpg",
    date: "수 8/5",
    start: "19:30",
    end: "21:00",
    capacity: 4,
    levelMin: 2,
    levelMax: 3,
    ageMin: 25,
    ageMax: 32,
    note: "퇴근하고 한 판!",
    joined: 1,
    status: "open",
    host: { id: "p4", nickname: "민지", age: 26, area: "연희동", level: 4 },
  },
  {
    id: "s5",
    gym: "더클라임 강남점",
    gymThumb: "https://loigwslmwvltdurjttpe.supabase.co/storage/v1/object/public/gym-photos/HBD-GYM-0002.jpg",
    date: "목 8/6",
    start: "10:00",
    end: "12:00",
    capacity: 3,
    levelMin: 1,
    levelMax: 2,
    ageMin: 24,
    ageMax: 33,
    note: "성별 상관없이 셋이서 가볍게",
    joined: 2,
    status: "confirmed",
    host: { id: "p2", nickname: "지훈", age: 29, area: "망원동", level: 2 },
  },
];

export const MOCK_PEOPLE: Person[] = [
  { id: "p1", nickname: "서연", age: 27, gender: "f", level: 3, careerId: 4, height: 164, homeGym: "써미트클라이밍센터", mbti: "ENFP", area: "연남동", achievement: { stage: "blue", total: 42 } },
  { id: "p2", nickname: "지훈", age: 29, gender: "m", level: 3, careerId: 2, homeGym: "더클라임 연남점", mbti: "ISTP", area: "망원동", achievement: { stage: "green", total: 24 } },
  { id: "p3", nickname: "하은", age: 31, gender: "f", level: 2, careerId: 1, height: 158, homeGym: "더클라임 사당점", mbti: "ISFJ", area: "상수동", achievement: { stage: "white", total: 0 } },
  { id: "p4", nickname: "민지", age: 26, gender: "f", level: 4, careerId: 6, height: 170, homeGym: "더클라임 강남점", mbti: "INTP", area: "연희동", achievement: { stage: "purple", total: 76 } },
];

/** 남은 자리. 성비가 없어진 뒤로는 셀 것이 하나뿐이다 */
export function slotsLeft(s: Session) {
  return { total: Math.max(0, s.capacity - s.joined) };
}
