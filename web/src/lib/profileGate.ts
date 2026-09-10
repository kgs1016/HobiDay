/* 콘텐츠 참여에 필요한 최소 정보. 둘러보기에는 적용하지 않는다. */

import type { MyProfile } from "./myProfile";

export function isBasicProfileComplete(p: MyProfile | null | undefined): boolean {
  return !!p && !!p.nickname.trim() && (p.gender === "m" || p.gender === "f") &&
    p.age !== null && Number.isInteger(p.age) && p.age >= 19 && p.age <= 60;
}
