"use client";

/* 네이티브 앱에서의 소셜 로그인.
 *
 *  웹에서는 그냥 주소를 옮기면 끝난다. 앱에서는 그럴 수 없다 —
 *
 *   1. 구글은 앱 안에 박힌 웹뷰에서의 로그인을 아예 막는다
 *      (disallowed_useragent). 시스템 브라우저로 열어야 한다.
 *   2. 시스템 브라우저로 열면 로그인이 끝난 뒤 "앱으로 돌아올 길" 이 없다.
 *      https 주소로 돌려보내면 앱이 아니라 브라우저가 그 페이지를 연다.
 *
 *  그래서 앱 전용 주소(kr.hobiday.app://)로 돌아오게 하고, 그 주소가 열릴 때
 *  Capacitor 가 알려주면 거기서 세션을 완성한다.
 *
 *  ⚠️ Supabase 대시보드 > Authentication > URL Configuration 의
 *     Redirect URLs 에 아래 주소가 등록돼 있어야 한다. 없으면 Supabase 가
 *     되돌려보내지 않는다.
 */

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { getSupabase } from "./supabase";

/** capacitor.config.ts 의 appId 와 같아야 한다 (네이티브 설정에도 같은 값) */
export const NATIVE_SCHEME = "kr.hobiday.app";
export const NATIVE_REDIRECT = `${NATIVE_SCHEME}://auth/callback`;

export const isNative = () => Capacitor.isNativePlatform();

export type Provider = "kakao" | "google" | "apple";

/** 웹이면 주소를 옮기고, 앱이면 시스템 브라우저로 연다. */
export async function signInWithProvider(
  provider: Provider
): Promise<{ error?: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "no_client" };

  if (!isNative()) {
    const { error } = await sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error?.message };
  }

  // skipBrowserRedirect: 웹뷰를 그대로 두고 주소만 받는다.
  // 여기서 만들어진 PKCE 검증값은 웹뷰의 저장소에 남아 있고,
  // 돌아왔을 때 같은 웹뷰가 처리하므로 짝이 맞는다.
  const { data, error } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
  });
  if (error) return { error: error.message };
  if (!data?.url) return { error: "no_url" };

  await Browser.open({ url: data.url, presentationStyle: "popover" });
  return {};
}

/** 앱으로 돌아온 주소에서 세션을 완성한다.
 *  성공하면 true — 호출한 쪽이 화면을 옮긴다. */
export async function completeNativeAuth(url: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // 쿼리에 오면 PKCE, 해시에 오면 암묵적 흐름. 둘 다 받아둔다.
  const code = parsed.searchParams.get("code");
  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    return !error;
  }

  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const access_token = hash.get("access_token");
  const refresh_token = hash.get("refresh_token");
  if (access_token && refresh_token) {
    const { error } = await sb.auth.setSession({ access_token, refresh_token });
    return !error;
  }

  return false;
}

/** 앱 전용 주소가 열릴 때를 듣는다. 웹에서는 아무 일도 하지 않는다.
 *  반환값은 정리 함수. */
export function onNativeAuthReturn(
  handle: (ok: boolean) => void
): () => void {
  if (!isNative()) return () => {};

  const sub = App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(`${NATIVE_SCHEME}://`)) return;
    // 로그인 창을 먼저 닫는다 — 안 닫으면 앱 위에 남는다
    await Browser.close().catch(() => {});
    handle(await completeNativeAuth(url));
  });

  return () => {
    sub.then((s) => s.remove()).catch(() => {});
  };
}
