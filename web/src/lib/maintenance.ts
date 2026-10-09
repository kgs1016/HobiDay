import { getSupabase } from "./supabase";
import { withDeadline } from "./network";

export interface AppAccessStatus {
  maintenance: boolean;
  allowed: boolean;
  authenticated: boolean;
  tester: boolean;
  title: string;
  message: string;
}

// These routes keep login, account deletion and support available during a pause.
const PUBLIC_PATHS = new Set(["/login", "/reset", "/auth/callback", "/support", "/terms", "/privacy", "/account/delete"]);

export function isMaintenancePublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname.replace(/\/+$/, "") || "/");
}

export function parseAppAccessStatus(value: unknown): AppAccessStatus {
  if (!value || typeof value !== "object") throw new Error("Invalid access status");
  const status = value as Record<string, unknown>;
  if (["maintenance", "allowed", "authenticated", "tester"].some(key => typeof status[key] !== "boolean")) {
    throw new Error("Invalid access status");
  }
  return {
    maintenance: status.maintenance as boolean,
    allowed: status.allowed as boolean,
    authenticated: status.authenticated as boolean,
    tester: status.tester as boolean,
    title: typeof status.title === "string" ? status.title : "리뉴얼 준비 중",
    message: typeof status.message === "string" ? status.message : "새로운 하비데이를 준비하고 있어요. 잠시만 기다려주세요.",
  };
}

export async function fetchAppAccessStatus(signal?: AbortSignal): Promise<AppAccessStatus> {
  const sb = getSupabase();
  if (!sb) throw new Error("Access service unavailable");
  const { data, error } = await withDeadline(s => sb.rpc("app_access_status").abortSignal(s), 12_000, signal);
  if (error) throw error;
  return parseAppAccessStatus(data);
}
