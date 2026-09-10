/* 선택 프로필 설정의 진행 상태. 앱 접근이나 참여를 제한하는 조건이 아니다. */

import type { MyProfile } from "./myProfile";

export function isBasicProfileComplete(p: MyProfile | null | undefined): boolean {
  return !!p && !!p.nickname.trim() && (p.gender === "m" || p.gender === "f") &&
    p.age !== null && Number.isInteger(p.age) && p.age >= 19 && p.age <= 60;
}
