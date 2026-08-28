"use client";

/* 알림함 — 홈 오른쪽 위 종 아이콘으로 들어온다.
   화면을 열면 전부 읽은 것으로 친다. 목록을 봤다는 게 곧 읽었다는
   뜻이라 알림마다 따로 누르게 하지 않는다. 읽은 알림은 24시간 뒤에
   사라진다 (그 말은 굳이 화면에 쓰지 않는다 — 알림 하나하나에
   유통기한을 붙여 읽히게 할 이유가 없다). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  currentUser,
  fetchNotifications,
  hasSupabase,
  markNotificationsRead,
  type AppNotification,
} from "@/lib/supabase";

/** "방금 · 12분 전 · 3시간 전 · 어제 · 8/26" */
function ago(iso: string) {
  const t = new Date(iso).getTime();
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  if (h < 48) return "어제";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function Notifications() {
  const router = useRouter();
  const [list, setList] = useState<AppNotification[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) return setAuthed(false);
      const user = await currentUser();
      setAuthed(!!user);
      if (!user) return;
      // 먼저 그리고 나서 읽음 처리한다 — 안 읽은 표시를 한 번은 보여준다
      const r = await fetchNotifications();
      setList(r?.items ?? []);
      await markNotificationsRead();
    })();
  }, []);

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-3 pt-5 pb-4">
        <button onClick={() => router.back()} className="text-lg text-muted">
          ←
        </button>
        <h1 className="text-[19px] font-extrabold tracking-tight">알림</h1>
      </header>

      {authed === false ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 알림이 보여요</p>
          <Link
            href="/login"
            className="rounded-xl bg-accent px-6 py-2.5 text-[14px] font-bold text-white"
          >
            로그인 하기
          </Link>
        </div>
      ) : list === null ? (
        <p className="pt-14 text-center text-muted">불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <span className="text-4xl">🔔</span>
          <p className="text-[15px] font-bold">새 알림이 없어요</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((n) => {
            const card = (
              <div
                className={`rounded-2xl border p-4 ${
                  n.read_at
                    ? "border-line bg-surface"
                    : "border-accent/40 bg-accent/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14.5px] font-extrabold">{n.title}</p>
                  <span className="shrink-0 text-[11.5px] text-muted">
                    {ago(n.created_at)}
                  </span>
                </div>
                {n.body && (
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    {n.body}
                  </p>
                )}
              </div>
            );
            return n.url ? (
              <Link key={n.id} href={n.url} className="block">
                {card}
              </Link>
            ) : (
              <div key={n.id}>{card}</div>
            );
          })}
        </div>
      )}
    </main>
  );
}
