"use client";

/* 오픈 전 잠금 — 두 플래그(모임·사람)가 다 꺼져 있으면 앱을 닫는다.
   홈은 대기 화면을 직접 그리니 그대로 두고, 나머지 잠긴 화면으로
   가려는 시도를 홈으로 돌려보낸다.

   내부 테스터는 여기 안 걸린다 — 서버(app_flags)가 테스터에게는
   열린 값을 내려주기 때문에, 이 컴포넌트는 구분할 필요가 없다. */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchAppFlags, hasSupabase } from "@/lib/supabase";

// 잠겨 있어도 다녀야 하는 곳 — 가입·프로필·내 정보·법적 문서·고객센터
// (/support 는 스토어 Support URL — 심사관이 로그인 없이 열어본다)
const OPEN_PATHS = [
  "/login",
  "/signup",
  "/reset",
  "/auth",
  "/profile/new",
  "/me",
  "/safety",
  "/terms",
  "/privacy",
  "/support",
];

export default function LaunchGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!hasSupabase()) return;
    if (pathname === "/" || OPEN_PATHS.some((p) => pathname.startsWith(p)))
      return;
    let alive = true;
    (async () => {
      const f = await fetchAppFlags();
      if (!alive || !f) return;
      if (!f.sessions_open && !f.people_open) router.replace("/");
    })();
    return () => {
      alive = false;
    };
  }, [pathname, router]);

  return null;
}
