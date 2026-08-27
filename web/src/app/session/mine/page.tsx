"use client";

/* 내가 만든 모임 — 홈 목록은 "시작 3시간 전 이후" 만 보여줘서
   지난 모임·취소한 모임은 여기서만 볼 수 있다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { HoldIllust } from "@/components/illustrations";
import {
  currentUser,
  fetchMyHostedSessions,
  hasSupabase,
  type MyHostedSession,
} from "@/lib/supabase";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const when = (iso: string) => {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

/** 홈 목록과 같은 기준 — 시작 3시간 뒤부터는 지난 모임으로 본다 */
const isPast = (s: MyHostedSession) =>
  new Date(s.starts_at).getTime() < Date.now() - 3 * 60 * 60 * 1000;

function badge(s: MyHostedSession) {
  if (s.status === "cancelled")
    return { label: "취소됨", cls: "bg-surface2 text-muted" };
  if (isPast(s)) return { label: "지난 모임", cls: "bg-surface2 text-muted" };
  if (s.status === "confirmed")
    return { label: "확정", cls: "bg-accent-soft text-accent-pressed" };
  return { label: "모집 중", cls: "bg-accent-soft text-accent-pressed" };
}

function Card({ s }: { s: MyHostedSession }) {
  const b = badge(s);
  const active = s.status !== "cancelled" && !isPast(s);
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold">{s.gym}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {when(s.starts_at)} · {s.capacity}:{s.capacity}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2.5 py-1 text-[11.5px] font-medium ${b.cls}`}
        >
          {b.label}
        </span>
      </div>
      {active && (
        <p className="mt-2 text-[12.5px] text-muted">
          확정 남 {s.m_confirmed} · 여 {s.f_confirmed} / 각 {s.capacity}명
          {s.waiting > 0 && (
            <b className="ml-1.5 font-semibold text-ink">대기 {s.waiting}</b>
          )}
        </p>
      )}
    </>
  );

  // 지난·취소된 모임은 상세 화면이 못 여는 상태라 링크를 걸지 않는다
  return active ? (
    <Link
      href={`/session?id=${s.id}`}
      className="block rounded-xl border border-line bg-surface p-4 transition-colors active:bg-surface2"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-line bg-surface p-4 opacity-70">
      {body}
    </div>
  );
}

export default function MySessions() {
  const [list, setList] = useState<MyHostedSession[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) return setAuthed(false);
      const user = await currentUser();
      setAuthed(!!user);
      if (user) setList((await fetchMyHostedSessions()) ?? []);
    })();
  }, []);

  const upcoming = (list ?? []).filter(
    (s) => s.status !== "cancelled" && !isPast(s)
  );
  const past = (list ?? []).filter((s) => s.status === "cancelled" || isPast(s));

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-4">
        <BackButton fallback="/me" />
        <h1 className="text-[18px] font-bold tracking-tight">내가 만든 모임</h1>
      </header>

      {authed === false ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 내 모임이 보여요</p>
          <Link
            href="/login"
            className="rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
          >
            로그인 하기
          </Link>
        </div>
      ) : list === null ? (
        <p className="pt-16 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-1.5 text-center">
          <HoldIllust size={64} />
          <p className="mt-3 text-[15px] font-semibold">아직 만든 모임이 없어요</p>
          <Link
            href="/"
            className="mt-3 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
          >
            모임 만들러 가기
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-[15px] font-bold">다가오는 모임</h2>
              <div className="flex flex-col gap-2">
                {upcoming.map((s) => (
                  <Card key={s.id} s={s} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-[15px] font-bold text-muted">
                지난 · 취소된 모임
              </h2>
              <div className="flex flex-col gap-2">
                {past.map((s) => (
                  <Card key={s.id} s={s} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
