export type AvatarGender = "m" | "f" | null | undefined;
const AVATARS = {
  m: "/images/avatars/member-man.svg",
  f: "/images/avatars/member-woman.svg",
  neutral: "/images/avatars/member-neutral.svg",
} as const;

export function defaultAvatar(gender?: AvatarGender): string {
  return gender === "m" || gender === "f" ? AVATARS[gender] : AVATARS.neutral;
}

/** 앱에 포함된 세 파일만 허용한다. 임의 외부 URL을 사진 주소로 사용하지 않는다. */
export function isDefaultAvatar(path?: string | null): boolean {
  return Object.values(AVATARS).some(value => value === path);
}
