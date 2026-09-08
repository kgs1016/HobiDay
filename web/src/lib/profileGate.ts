/* 기본 회원 정보와 사람 찾기 공개·모임 참여용 프로필을 구분한다. */

import type { MyProfile } from "./myProfile";

export function isBasicProfileComplete(p: MyProfile | null | undefined): boolean {
  return !!p && !!p.photo?.trim() && !!p.nickname.trim() && (p.gender === "m" || p.gender === "f") &&
    Number.isInteger(p.age) && p.age >= 19 && p.age <= 60;
}

/** 사람 찾기 공개·모임 이용에 반드시 있어야 하는 것들 */
export function missingFields(p: MyProfile): string[] {
  const missing: string[] = [];
  if (!p.photo) missing.push("대표 사진");
  if (!p.careerId) missing.push("구력");
  // 키·MBTI·동네·홈짐은 선택 (키는 2026-09 에 다시 선택으로)
  return missing;
}

export function isProfileComplete(p: MyProfile | null | undefined): boolean {
  return isBasicProfileComplete(p) && !!p && missingFields(p).length === 0;
}
