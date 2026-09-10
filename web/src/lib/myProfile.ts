/* 내 프로필 — 목데이터 단계에선 localStorage, Supabase 연결 시 교체 */

import type { CareerId, LevelId } from "./levels";
import type { VisitFrequencyId } from "./visitFrequency";

export interface MyProfile {
  nickname: string;
  gender: "m" | "f" | null;
  age: number | null;
  area: string;
  /** 레벨 — 자기신고 · 선택 입력. 비우면 카드에 표시하지 않는다 */
  level: LevelId | null;
  /** 구력 — 기존 프로필엔 없어서 optional */
  careerId?: CareerId;
  visitFrequency?: VisitFrequencyId;
  homeGym: string;
  mbti: string;
  intro?: string;
  /** 선택 사진 — 스토리지 경로 또는 앱 기본 아바타 경로 */
  photo?: string;
  /** 사람 찾기 공개는 직접 선택한다. 저장된 선택이 없으면 비공개. */
  isPublic?: boolean;
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
