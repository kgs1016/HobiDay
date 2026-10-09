"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { fetchAppUpdatePolicy, getSupabase, type AppUpdatePolicy } from "@/lib/supabase";
import { isMaintenancePublicPath } from "@/lib/maintenance";
import { withDeadline } from "@/lib/network";
import {
  STORE_URLS, isUpdateSnoozed, updateDecision, updateSnoozeKey,
  type NativeStore, type UpdateDecision,
} from "@/lib/appUpdate";

type Prompt = {
  platform: NativeStore;
  latest: string;
  decision: Exclude<UpdateDecision, "none">;
  policy: AppUpdatePolicy;
};

/** Always mounted outside maintenance, including while all service routes are closed. */
export default function AppUpdateGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [ready, setReady] = useState(false);
  const [storeFailed, setStoreFailed] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      const timer = window.setTimeout(() => setReady(true), 0);
      return () => window.clearTimeout(timer);
    }
    let alive = true;
    let generation = 0;
    let controller: AbortController | null = null;

    const check = async () => {
      const request = ++generation;
      controller?.abort();
      controller = new AbortController();
      try {
        const platform = Capacitor.getPlatform();
        if (platform !== "ios" && platform !== "android") return;
        const [info, policy] = await Promise.all([
          withDeadline(() => App.getInfo(), 12_000, controller.signal),
          fetchAppUpdatePolicy(controller.signal),
        ]);
        if (!alive || request !== generation || !policy) return;
        const decision = updateDecision(info.version, platform, policy);
        const latest = platform === "ios" ? policy.ios_latest_version : policy.android_latest_version;
        let snoozed = false;
        try { snoozed = isUpdateSnoozed(localStorage.getItem(updateSnoozeKey(platform, latest))); } catch { /* Storage can be disabled. */ }
        setPrompt(decision === "none" || (decision === "available" && snoozed)
          ? null : { platform, latest, decision, policy });
      } catch {
        // A first-check outage doesn't create a block. Keep an already confirmed
        // requirement until the server withdraws it or the installed version changes.
      } finally {
        if (alive && request === generation) setReady(true);
      }
    };

    const timer = window.setTimeout(check, 0);
    const refresh = () => { if (document.visibilityState === "visible") void check(); };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    const listener = App.addListener("appStateChange", ({ isActive }) => { if (isActive) void check(); });
    const subscription = getSupabase()?.auth.onAuthStateChange(() => {
      // Invalidate in-flight anonymous/member policies before a tester signs in.
      generation += 1;
      controller?.abort();
      window.setTimeout(() => { if (alive) void check(); }, 0);
    }).data.subscription;
    return () => {
      alive = false;
      controller?.abort();
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      subscription?.unsubscribe();
      listener.then(handle => handle.remove()).catch(() => {});
    };
  }, []);

  const publicPath = isMaintenancePublicPath(pathname);
  if (!ready && !publicPath) {
    return <main className="flex min-h-dvh items-center justify-center px-7 text-sm text-muted" role="status">앱 상태를 확인하고 있어요.</main>;
  }
  if (!prompt) return <>{children}</>;
  const required = prompt.decision === "required";

  const later = () => {
    try { localStorage.setItem(updateSnoozeKey(prompt.platform, prompt.latest), String(Date.now())); } catch { /* Dismiss still works. */ }
    setPrompt(null);
  };
  const update = async () => {
    setStoreFailed(false);
    try { await Browser.open({ url: STORE_URLS[prompt.platform], presentationStyle: "popover" }); }
    catch { setStoreFailed(true); }
  };
  const storeButton = <button type="button" onClick={update} className="button-primary min-h-12 flex-1 rounded-xl px-5 text-[14px] font-semibold">업데이트</button>;
  const storeFallback = storeFailed && <a href={STORE_URLS[prompt.platform]} target="_blank" rel="noopener noreferrer" className="mt-3 block text-sm underline">스토어에서 직접 열기</a>;

  // Testers must be able to sign in; support, legal and deletion stay reachable.
  // Optional notices never obstruct these paths either.
  if (publicPath) return <>{required && <aside className="border-b border-line bg-surface px-5 py-3" aria-label="업데이트 안내">
    <p className="mb-2 text-sm">{prompt.policy.title}</p>{storeButton}{storeFallback}
  </aside>}{children}</>;

  return <>
    {!required && children}
    <div className={required
      ? "flex min-h-dvh items-center justify-center bg-surface px-6 py-[calc(2rem+env(safe-area-inset-top))]"
      : "fixed inset-0 z-[110] flex items-end justify-center bg-black/45 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center"}
      role={required ? undefined : "dialog"} aria-modal={required ? undefined : true} aria-labelledby="app-update-title" aria-describedby="app-update-message">
      <section className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-[25px] font-black text-white">H</div>
        <h1 id="app-update-title" className="mt-4 text-[20px] font-bold tracking-tight">{prompt.policy.title}</h1>
        <p id="app-update-message" className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-muted">
          {prompt.policy.message}{required ? "\n계속 이용하려면 업데이트가 필요해요." : ""}
        </p>
        <div className="mt-6 flex gap-2">
          {!required && <button type="button" onClick={later} className="button-secondary min-h-12 flex-1 rounded-xl text-[14px] font-semibold">나중에</button>}
          {storeButton}
        </div>
        {storeFallback}
        {required && <div className="mt-7 flex flex-wrap gap-5 text-[13px] text-muted">
          <Link href="/login" className="underline">로그인</Link>
          <Link href="/support" className="underline">문의하기</Link>
          <Link href="/account/delete" className="underline">회원 탈퇴</Link>
        </div>}
      </section>
    </div>
  </>;
}
