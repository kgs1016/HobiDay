/* 참여에 필요한 기본 정보. 클라이밍화 설정은 별도 기록으로 확인한다. */
import type { MyProfile } from "./myProfile";
export function isBasicProfileComplete(p: MyProfile | null | undefined): boolean {
  return !!p && !!p.nickname.trim() && (p.gender === "m" || p.gender === "f") &&
    Number.isInteger(p.careerId) && (p.careerId ?? 0) >= 1 && (p.careerId ?? 0) <= 6;
}
