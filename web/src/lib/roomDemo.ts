/* 데모 모드 — /room?id=demo 로 들어오면 DB 없이 진행 화면을 그대로 본다.
   혼자서는 성비를 맞출 수 없어 실제 방을 열 수 없으므로,
   화면·문구를 눈으로 검증하려면 이 경로가 필요하다.

   실제 UI 컴포넌트를 그대로 쓰고 데이터만 가짜다. */

import type { Room, RoomPerson } from "./supabase";

export const DEMO_ID = "demo";

const PEOPLE: RoomPerson[] = [
  {
    id: "demo-me",
    nickname: "나",
    age: 28,
    gender: "m",
    level: 3,
    career: 4,
    height: 178,
    home_gym: "더클라임 연남",
    area: "연남동",
    mbti: "ENFP",
    intro: null,
    photo: null,
    is_me: true,
  },
  {
    id: "demo-p1",
    nickname: "서연",
    age: 27,
    gender: "f",
    level: 3,
    career: 4,
    height: 164,
    home_gym: "더클라임 연남",
    area: "연남동",
    mbti: "ENFJ",
    intro: "주말 오후에 주로 타요. 같이 문제 풀어요!",
    photo: null,
    is_me: false,
  },
  {
    // 구력 미입력(기존 유저) — null 이어도 줄만 빠지고 정상인지 확인용
    id: "demo-p2",
    nickname: "하은",
    age: 26,
    gender: "f",
    level: 2,
    career: null,
    height: null,
    home_gym: "써미트클라이밍",
    area: "상수동",
    mbti: "INFP",
    intro: "클라이밍 3개월차예요 🧗",
    photo: null,
    is_me: false,
  },
  {
    id: "demo-p3",
    nickname: "지훈",
    age: 29,
    gender: "m",
    level: 4,
    career: 6,
    height: null,
    home_gym: "홍대클라이밍",
    area: "망원동",
    mbti: "ISTP",
    intro: null,
    photo: null,
    is_me: false,
  },
];

/** 이미 시작한 모임 상태로 만든다 (최종선택까지 열려 있게) */
export function buildDemoRoom(): Room {
  const now = Date.now();
  const min = 60_000;
  const startsAt = now - 30 * min;
  const iso = (ms: number) => new Date(ms).toISOString();

  return {
    session: {
      id: DEMO_ID,
      gym: "더클라임 B홍대 (데모)",
      starts_at: iso(startsAt),
      ends_at: iso(startsAt + 120 * min),
      capacity: 2,
      note: "끝나고 저녁 먹어요",
    },
    me: { id: "demo-me", gender: "m", level: 3 },
    matched: 2,
    people: PEOPLE,
    videos: [],
    selection_open: true,
  };
}

/** 데모에서 상호매칭이 된 것처럼 보여줄 결과 */
export function demoMatches(pickedIds: Set<string>) {
  return PEOPLE.filter((p) => pickedIds.has(p.id)).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    age: p.age,
    level: p.level,
    career: p.career,
    home_gym: p.home_gym,
    area: p.area,
    mbti: p.mbti,
    intro: p.intro,
  }));
}
