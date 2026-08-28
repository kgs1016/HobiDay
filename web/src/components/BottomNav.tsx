"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { currentUser, hasSupabase, fetchAppFlags, fetchInboxCounts } from "@/lib/supabase";
import { HomeIcon, ChatIcon, InboxIcon, UserIcon } from "@/components/icons";

const TABS = [
  { href: "/", label: "홈", Icon: HomeIcon },
  { href: "/chat", label: "채팅", Icon: ChatIcon },
  { href: "/inbox", label: "신청함", Icon: InboxIcon },
  { href: "/me", label: "내 정보", Icon: UserIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  // 탭 배지 — 받은 관심 수 · 안 읽은 메시지 수
  const [badges, setBadges] = useState<Record<string, number>>({});
  // 비로그인은 채팅·신청함·내 정보가 전부 빈 화면이라 탭 자체를 감춘다.
  // 키가 없는 개발 폴백(목데이터)에서는 화면을 못 옮기니 그대로 띄운다.
  // null = 확인 중 — 깜빡임을 막으려고 이때도 그리지 않는다.
  const [authed, setAuthed] = useState<boolean | null>(hasSupabase() ? null : true);
  // 오픈 전 잠금이면 홈·내 정보만 남긴다 (테스터에겐 서버가 열린 값을 준다)
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!hasSupabase()) return;
    let alive = true;
    currentUser().then((u) => {
      if (alive) setAuthed(!!u);
    });
    fetchAppFlags().then((f) => {
      if (alive && f) setLocked(!f.sessions_open && !f.people_open);
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!authed) return;
    let alive = true;
    const load = async () => {
      const c = await fetchInboxCounts();
      if (!alive || !c) return;
      setBadges({ "/inbox": c.requests, "/chat": c.unread_messages });

      // 홈 화면에 추가한 PWA 는 앱 아이콘에도 숫자를 띄울 수 있다 (iOS 16.4+)
      const total = c.requests + c.unread_messages;
      const nav = navigator as Navigator & {
        setAppBadge?: (n?: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      try {
        if (total > 0) await nav.setAppBadge?.(total);
        else await nav.clearAppBadge?.();
      } catch {
        // 미지원 브라우저는 무시
      }
    };
    load();
    // 채팅 화면에선 더 자주 확인한다
    const t = setInterval(load, pathname === "/chat" ? 10_000 : 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // 화면을 옮길 때마다 갱신해 읽은 뒤에도 배지가 남지 않게
  }, [pathname, authed]);

  if (!authed) return null;

  const tabs = locked
    ? TABS.filter((t) => t.href === "/" || t.href === "/me")
    : TABS;

  return (
    // pb-[safe] — 홈 화면에 추가해 전체화면으로 뜰 때 아이폰 홈바에 가리지 않게
    <nav
      className="fixed bottom-0 inset-x-0 z-20 border-t border-line bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className={`mx-auto max-w-md grid ${locked ? "grid-cols-2" : "grid-cols-4"}`}>
        {tabs.map((t) => {
          const active =
            t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
                active ? "font-semibold text-accent" : "font-medium text-faint"
              }`}
            >
              <span className="relative leading-none">
                <t.Icon size={23} strokeWidth={active ? 2 : 1.75} />
                {(badges[t.href] ?? 0) > 0 && (
                  <span className="absolute -right-2 -top-1 min-w-[15px] rounded-full bg-danger px-1 text-center text-[9.5px] font-bold leading-[15px] text-white">
                    {badges[t.href] > 9 ? "9+" : badges[t.href]}
                  </span>
                )}
              </span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
