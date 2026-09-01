/* 내 프로필 — 목데이터 단계에선 localStorage, Supabase 연결 시 교체 */

import type { CareerId, LevelId } from "./levels";

export interface MyProfile {
  nickname: string;
  gender: "m" | "f";
  age: number;
  area: string;
  /** 레벨 — 자기신고 · 선택 입력. 비우면 카드에 표시하지 않는다 */
  level: LevelId | null;
  /** 구력 — 기존 프로필엔 없어서 optional */
  careerId?: CareerId;
  /** 키(cm) — 선택 입력. 표시만 하고 필터로는 쓰지 않는다 */
  height?: number;
  homeGym: string;
  mbti: string;
  intro?: string;
  /** 대표 사진 — 스토리지 경로. 사람 찾기에 공개할 때 필수 */
  photo?: string;
}

const KEY = "hobiday.myProfile";

export function loadMyProfile(): MyProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MyProfile) : null;
  } catch {
    return null;
  }
}

export function saveMyProfile(p: MyProfile) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function removeMyProfile() {
  localStorage.removeItem(KEY);
}
