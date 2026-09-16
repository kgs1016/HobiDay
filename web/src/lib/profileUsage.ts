"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { getSupabase } from "./supabase";
import { withDeadline } from "./network";

export const PROFILE_USAGE_EVENTS = {
  profile_opened: "기본정보 화면 진입", profile_ready: "기본정보 불러오기 완료",
  profile_save_attempt: "기본정보 저장 시도", profile_saved: "기본정보 저장 완료",
  profile_validation_failed: "필수 입력 확인", profile_load_failed: "기본정보 불러오기 실패",
  profile_save_failed: "기본정보 저장 실패", profile_photo_failed: "사진 업로드 실패",
  shoe_opened: "클라이밍화 화면 진입", shoe_ready: "클라이밍화 선택 화면 표시",
  shoe_save_attempt: "클라이밍화 저장 시도", shoe_saved: "클라이밍화 설정 완료",
  shoe_save_failed: "클라이밍화 저장 실패", shoe_load_failed: "클라이밍화 불러오기 실패",
  profile_publish_failed: "프로필 공개 설정 실패",
} as const;
export type ProfileUsageEvent = keyof typeof PROFILE_USAGE_EVENTS;
export const PROFILE_USAGE_ERRORS = ["offline", "timeout", "network", "auth", "server", "nickname_required", "basic_required", "invalid_age", "photo_too_large"] as const;
export type ProfileUsageError = typeof PROFILE_USAGE_ERRORS[number];

export function profileUsageError(error: unknown): ProfileUsageError {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const message = error instanceof Error ? error.message : "";
  if (/timeout|timed out|연결이 지연/i.test(message)) return "timeout";
  if (/fetch|network|네트워크/i.test(message)) return "network";
  if (/로그인|jwt|unauthorized/i.test(message)) return "auth";
  return "server";
}

let active = 0;
let transmission = Promise.resolve();
let cooldownUntil = 0;
let failures = 0;
let metadata: Promise<{ platform: string; version: string | null }> | undefined;
function environment() {
  return metadata ??= (async () => {
    const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : "web";
    if (platform === "web") return { platform, version: null };
    try {
      const info = await withDeadline(() => App.getInfo(), 1_000);
      return { platform, version: info.version };
    } catch { return { platform, version: null }; }
  })();
}

/** Best effort only: no UI waits, persistent queue, automatic retry or raw input/error text. */
export function trackProfileUsage(event: ProfileUsageEvent, errorCode: ProfileUsageError | null = null): void {
  try {
    if (typeof window === "undefined" ||
      process.env.NEXT_PUBLIC_PROFILE_USAGE_ENABLED === "false" ||
      (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_PROFILE_USAGE_ENABLED !== "true") ||
      !Object.hasOwn(PROFILE_USAGE_EVENTS, event) ||
      (errorCode !== null && !(PROFILE_USAGE_ERRORS as readonly string[]).includes(errorCode)) ||
      active >= 20 || Date.now() < cooldownUntil) return;
    const sb = getSupabase();
    if (!sb) return;
    active++;
    void (async () => {
      const sessionRequest = sb.auth.getSession();
      const [{ data, error }, info] = await Promise.all([
        withDeadline(() => sessionRequest, 2_000), environment(),
      ]);
      if (error || !data.session) return;
      // Pin the token to the account at capture time, even if another account signs in.
      const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() :
        "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
          (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));
      const send = transmission.then(async () => {
        if (Date.now() < cooldownUntil) return;
        const result = await withDeadline(signal => sb.rpc("record_profile_usage", {
          p_id: id, p_event: event, p_platform: info.platform, p_version: info.version, p_error_code: errorCode,
        }).setHeader("Authorization", `Bearer ${data.session.access_token}`).abortSignal(signal), 2_500);
        if (result.error) throw new Error("telemetry_unavailable");
      });
      transmission = send.catch(() => {});
      await send;
      failures = 0;
    })().catch(() => {
      if (++failures >= 3) { cooldownUntil = Date.now() + 60_000; failures = 0; }
    }).finally(() => { active--; });
  } catch { /* Instrumentation must never interrupt the user's action. */ }
}

/** One view event per mount, including React Strict Mode's effect replay. */
export function useProfileUsageView(event: ProfileUsageEvent, enabled = true) {
  const recorded = useRef(false);
  useEffect(() => {
    if (!enabled || recorded.current) return;
    recorded.current = true;
    trackProfileUsage(event);
  }, [event, enabled]);
}

export type ProfileUsageReport = {
  period_start: string; period_end: string; cohort_count: number; observed_users: number;
  stages: { event: ProfileUsageEvent; users: number; events: number }[];
  recent_users: { user_id: string; joined_at: string; last_event: ProfileUsageEvent | null;
    last_at: string | null; platform: string | null; app_version: string | null;
    events: ProfileUsageEvent[]; error_code: ProfileUsageError | null }[];
};

export async function fetchProfileUsageReport(days: number, newOnly: boolean): Promise<ProfileUsageReport> {
  const sb = getSupabase();
  if (!sb) throw new Error("운영 DB 연결이 필요합니다");
  const { data, error } = await withDeadline(signal => sb.rpc("admin_profile_usage", {
    p_days: days, p_new_only: newOnly,
  }).abortSignal(signal));
  if (error) throw new Error("이용 현황을 불러오지 못했습니다");
  if (data?.error === "not_admin") throw new Error("운영자만 확인할 수 있습니다");
  if (!data || !Array.isArray(data.stages) || !Array.isArray(data.recent_users)) throw new Error("이용 현황을 불러오지 못했습니다");
  return data as ProfileUsageReport;
}
