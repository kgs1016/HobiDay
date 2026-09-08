/* 프로필 완성 게이트
   가입 직후 프로필(사진 포함)을 먼저 채우게 한다. 서로를 신뢰할 수 있는 상태에서만
   모임·사람을 볼 수 있어야 하고, 사진 없는 카드가 목록에 섞이는 것도 막힌다. */

import type { MyProfile } from "./myProfile";

/** 사람 찾기 공개·모임 이용에 반드시 있어야 하는 것들 */
export function missingFields(p: MyProfile): string[] {
  const missing: string[] = [];
  if (!p.photo) missing.push("대표 사진");
  if (!p.careerId) missing.push("구력");
  // 키·MBTI·동네·홈짐은 선택 (키는 2026-09 에 다시 선택으로)
  return missing;
}

export function isProfileComplete(p: MyProfile | null | undefined): boolean {
  return !!p && missingFields(p).length === 0;
}
