"use client";

/* 네이티브 푸시 알림 — 토큰 등록과 알림 탭 처리.
 *
 *  앱은 세 가지만 한다:
 *   1. 로그인된 상태로 앱을 열면 OS 에 권한을 묻고 기기 토큰을 받아 저장
 *   2. 알림을 탭하면 data.url 로 이동
 *   3. 로그아웃하면 토큰 삭제 (안 지우면 이 폰에 알림이 계속 온다)
 *
 *  발송은 Edge Function(push)이 한다 — notifyPush() 로 부탁만 한다.
 *  웹(PWA)에서는 전부 no-op. 웹 푸시는 별도 작업(VAPID)이라 나중에.
 */

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { currentUser, getSupabase } from "./supabase";
import { App } from "@capacitor/app";

const TOKEN_KEY = "hobiday.push.token"; // 로그아웃 때 지우려고 기억해둔다

export const isNativePush = () => Capacitor.isNativePlatform();

let registration: Promise<void> | null = null;
let listeners: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;
let attempts = 0;
let epoch = 0;

function retryRegistration() {
  if (retry || attempts >= 3) return;
  retry = setTimeout(() => { retry = undefined; void registerPush(); }, [2000, 10000, 30000][attempts++]);
}

/** One listener per app process; retry storage failures without printing device tokens. */
async function listenForToken() {
  if (!listeners) listeners = (async () => {
    await PushNotifications.addListener("registration", async ({ value }) => {
      const version = epoch;
      try {
        const sb = getSupabase();
        const user = await currentUser();
        if (!sb || !user || !value || version !== epoch) return;
        localStorage.setItem(TOKEN_KEY, value);
        const { data, error } = await sb.rpc("push_token_save", {
          p_token: value, p_platform: Capacitor.getPlatform() === "ios" ? "ios" : "android",
        });
        if (error || !data?.ok) throw new Error("token_save_failed");
        if (version !== epoch) return;
        attempts = 0;
        if (retry) clearTimeout(retry);
        retry = undefined;
      } catch { console.warn("푸시 기기 등록을 재시도합니다"); retryRegistration(); }
    });
    await PushNotifications.addListener("registrationError", () => {
      console.warn("휴대폰 푸시 등록에 실패했습니다"); retryRegistration();
    });
  })().catch(e => { listeners = null; throw e; });
  await listeners;
}

/** Call on sign-in and app resume, including return from the phone's Settings app. */
export async function registerPush(): Promise<void> {
  if (!isNativePush()) return;
  if (registration) return registration;
  const version = epoch;
  registration = (async () => {
    if (!(await currentUser())) return;
    const perm = await PushNotifications.checkPermissions();
    if (perm.receive === "denied") return;
    if (perm.receive !== "granted" && (await PushNotifications.requestPermissions()).receive !== "granted") return;
    if (version !== epoch || !(await currentUser())) return;
    await listenForToken();
    if (Capacitor.getPlatform() === "android") await PushNotifications.createChannel({
      id: "hobiday_activity", name: "채팅과 모임", importance: 4, visibility: 0, sound: "default",
    });
    if (version === epoch) await PushNotifications.register();
  })().catch(() => { console.warn("푸시 연결을 다시 확인합니다"); retryRegistration(); })
    .finally(() => { registration = null; });
  return registration;
}

/** Covers email/social login, restored sessions, permission changes and network recovery. */
export function watchPushRegistration(): () => void {
  if (!isNativePush()) return () => {};
  let active = true;
  const refresh = () => { if (active) { attempts = 0; void registerPush(); } };
  // Supabase auth callbacks must not await another auth call inside the callback.
  const auth = getSupabase()?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") { epoch++; return; }
    if (["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) setTimeout(refresh, 0);
  });
  const resume = App.addListener("appStateChange", ({ isActive }) => { if (isActive) refresh(); });
  window.addEventListener("online", refresh);
  refresh();
  return () => {
    active = false; auth?.data.subscription.unsubscribe();
    void resume.then(s => s.remove()).catch(() => {});
    window.removeEventListener("online", refresh);
    if (retry) clearTimeout(retry);
    retry = undefined;
  };
}

/** 알림을 탭했을 때 — data.url 로 이동. 반환값은 정리 함수. */
export function onPushTap(navigate: (url: string) => void): () => void {
  if (!isNativePush()) return () => {};

  const sub = PushNotifications.addListener(
    "pushNotificationActionPerformed",
    ({ notification }) => {
      const url = notification.data?.url;
      if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) navigate(url);
    }
  );
  return () => {
    sub.then((s) => s.remove()).catch(() => {});
  };
}

/** 로그아웃 직전에 부른다 — 세션이 살아 있어야 RPC 가 통과한다 */
export async function unregisterPush(): Promise<void> {
  if (!isNativePush()) return;
  epoch++;
  if (retry) clearTimeout(retry);
  retry = undefined;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  const result = await getSupabase()?.rpc("push_token_delete", { p_token: token });
  if (!result?.error && result?.data?.ok) localStorage.removeItem(TOKEN_KEY);
  await PushNotifications.unregister().catch(() => {});
}

/** 상대에게 알림을 알린다 — 푸시로 한 번, 알림함에 한 번.
 *
 *  둘을 같이 두는 이유: 푸시는 놓치면 끝이고 웹에서는 아예 안 온다.
 *  알림함에 남겨두면 종 아이콘을 눌러 나중에 볼 수 있다.
 *
 *  실패해도 조용히 넘어간다 — 메시지 전송 자체를 막으면 안 된다.
 *  알림함 소식은 먼저 서버에 보관하고 즉시 발송을 요청한다. 실패하면 예약 작업이 재시도한다. */
export async function notifyPush(
  to: string | string[],
  title: string,
  body: string,
  url?: string,
  /** 서버가 이미 알림함에 남긴 소식이면 푸시만 쏜다 (모임 취소 등).
   *  안 그러면 알림함에 같은 줄이 두 번 쌓인다. */
  opts?: { pushOnly?: boolean; queuedOnServer?: boolean }
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  if (opts?.queuedOnServer) return; // The server-created notification is sent by the worker once.
  const list = Array.isArray(to) ? to : [to];
  try {
    if (opts?.pushOnly) {
      await sb.functions.invoke("push", { body: { to: list, title, body, url } });
      return;
    }
    const queued = await sb.rpc("notify_send_pending", {
      p_to: list, p_title: title, p_body: body, p_url: url ?? null,
    });
    if (queued.error || !Array.isArray(queued.data) || !queued.data.length) return;
    // If this immediate call fails, the server worker still owns the durable queue entries.
    await sb.functions.invoke("push", { body: { to: list, title, body, url, queue_ids: queued.data } });
  } catch { console.warn("푸시 즉시 발송을 완료하지 못했습니다"); }
}
