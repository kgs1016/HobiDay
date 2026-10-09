"use client";

import Image from "next/image";
import Link from "next/link";
import { App } from "@capacitor/app";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { fetchAppAccessStatus, isMaintenancePublicPath, type AppAccessStatus } from "@/lib/maintenance";

export default function MaintenanceGate({ children, navigation }: { children: React.ReactNode; navigation: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<AppAccessStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    let generation = 0;
    let controller: AbortController | null = null;

    const check = async (invalidate = false) => {
      const request = ++generation;
      controller?.abort();
      controller = new AbortController();
      if (invalidate) setStatus(null);
      try {
        const next = await fetchAppAccessStatus(controller.signal);
        if (!alive || request !== generation) return;
        setStatus(next);
        setSignedIn(next.authenticated);
        setFailed(false);
      } catch {
        if (!alive || request !== generation) return;
        // A failed check must never reopen a paused app or retain tester access.
        setStatus(null);
        setFailed(true);
      }
    };

    void check();
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event, session) => {
      generation += 1;
      controller?.abort();
      setSignedIn(!!session);
      setStatus(null);
      // Supabase auth callbacks must release their lock before issuing another request.
      window.setTimeout(() => { if (alive) void check(true); }, 0);
    });
    const refresh = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    const timer = window.setInterval(refresh, 30_000);
    const listener = App.addListener("appStateChange", ({ isActive }) => { if (isActive) void check(); });
    return () => {
      alive = false;
      controller?.abort();
      subscription.unsubscribe();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.clearInterval(timer);
      listener.then(handle => handle.remove()).catch(() => {});
    };
  }, [retry]);

  const publicPath = isMaintenancePublicPath(pathname);
  // Only the local development preview may bypass a missing public client key.
  if ((!getSupabase() && process.env.NODE_ENV === "development") || status?.allowed) return <>{children}{navigation}</>;
  if (publicPath) return <>{children}</>;

  return <main className="flex min-h-[80dvh] flex-col items-center justify-center px-7 py-16 text-center">
    <Image src="/brand/hobiday-logo.png" alt="하비데이" width={160} height={160} unoptimized />
    <h1 className="mt-8 text-[25px] font-bold tracking-tight">{status?.title ?? "리뉴얼 준비 중"}</h1>
    <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-muted" role="status">
      {status?.message ?? (failed ? "연결을 확인하고 다시 시도해주세요." : "새로운 하비데이를 준비하고 있어요. 잠시만 기다려주세요.")}
    </p>
    {failed && <button type="button" onClick={() => { setFailed(false); setRetry(n => n + 1); }} className="button-secondary mt-6 rounded-xl px-6 py-3 text-sm">다시 확인</button>}
    <div className="mt-9 flex items-center gap-5 text-[13px] text-muted">
      <Link href="/login" className="underline underline-offset-4">로그인</Link>
      <Link href="/support" className="underline underline-offset-4">문의하기</Link>
      {signedIn && <Link href="/account/delete" className="underline underline-offset-4">회원 탈퇴</Link>}
    </div>
    {signedIn && <button type="button" onClick={() => { setStatus(null); void getSupabase()?.auth.signOut(); }} className="mt-5 text-[12px] text-faint underline underline-offset-4">로그아웃</button>}
    <div className="mt-8 flex gap-4 text-[11px] text-faint">
      <Link href="/terms">이용약관</Link><Link href="/privacy">개인정보처리방침</Link>
    </div>
  </main>;
}
