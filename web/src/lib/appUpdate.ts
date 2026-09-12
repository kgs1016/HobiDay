import type { AppUpdatePolicy } from "@/lib/supabase";

export type NativeStore = "ios" | "android";
export type UpdateDecision = "none" | "available" | "required";

export const STORE_URLS: Record<NativeStore, string> = {
  ios: "https://apps.apple.com/kr/app/id6803351277",
  android: "https://play.google.com/store/apps/details?id=kr.hobiday.app",
};

function versionParts(value: string | null | undefined): number[] | null {
  const clean = value?.trim();
  if (!clean || !/^\d+(?:\.\d+){0,3}$/.test(clean)) return null;
  return clean.split(".").map(Number);
}

/** 1.2와 1.2.0을 같은 버전으로 취급한다. 잘못된 값은 비교하지 않는다. */
export function compareVersions(left: string, right: string): number | null {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return null;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

export function updateDecision(current: string, platform: NativeStore, policy: AppUpdatePolicy): UpdateDecision {
  const latest = platform === "ios" ? policy.ios_latest_version : policy.android_latest_version;
  const minimum = platform === "ios" ? policy.ios_minimum_version : policy.android_minimum_version;
  if (minimum && compareVersions(current, minimum) === -1) return "required";
  return compareVersions(current, latest) === -1 ? "available" : "none";
}

const SNOOZE_MS = 24 * 60 * 60 * 1000;

export function updateSnoozeKey(platform: NativeStore, latest: string) {
  return `hobiday:update-snooze:${platform}:${latest}`;
}

export function isUpdateSnoozed(value: string | null, now = Date.now()) {
  if (!value) return false;
  const savedAt = Number(value);
  return Number.isFinite(savedAt) && savedAt > 0 && now - savedAt < SNOOZE_MS;
}
