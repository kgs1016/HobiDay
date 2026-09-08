"use client";

/* 내 정보 > 리뷰 작성 — 끝난 지 일주일 안인 모임들.
   알림을 놓쳤어도 여기서 쓴다. 모임을 누르면 함께한 사람별로 남긴다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { AvatarFallback, ChevronRightIcon } from "@/components/icons";
import { HoldIllust } from "@/components/illustrations";
import {
  currentUser,
  fetchReviewSessions,
  hasSupabase,
  signedPhotoUrls,
  type ReviewSession,
} from "@/lib/supabase";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const until = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}까지`;
};

export default function MyReviews() {
  const [list, setList] = useState<ReviewSession[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) return setAuthed(false);
      const user = await currentUser();
      setAuthed(!!user);
      if (!user) return;
      const rows = (await fetchReviewSessions()) ?? [];
      setList(rows);
      const paths = rows
        .flatMap((r) => r.people.map((p) => p.photo))
        .filter(Boolean) as string[];
      if (paths.length) setPhotos(await signedPhotoUrls(paths));
    })();
  }, []);

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-2">
        <BackButton fallback="/me" />
        <h1 className="text-[18px] font-bold tracking-tight">리뷰 작성</h1>
      </header>

      {authed === false ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 보여요</p>
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
          <p className="mt-3 text-[15px] font-semibold">리뷰를 남길 모임이 없어요</p>
          <p className="text-[12.5px] leading-relaxed text-muted">
            모임이 끝나고 일주일 동안 여기서 남길 수 있어요
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {list.map((r) => {
            const done = r.people.filter((p) => p.liked || p.body).length;
            return (
              <Link
                key={r.id}
                href={`/review?id=${r.id}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-4 transition-colors active:bg-surface2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{r.gym}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {when(r.starts_at)} · {until(r.until)}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <div className="flex -space-x-1.5">
                      {r.people.slice(0, 5).map((p) =>
                        p.photo && photos[p.photo] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={p.id}
                            src={photos[p.photo]}
                            alt=""
                            className="h-6 w-6 rounded-full border-2 border-bg object-cover"
                          />
                        ) : (
                          <AvatarFallback key={p.id} size={24} className="border-2 border-bg" />
                        )
                      )}
                    </div>
                    <span className="ml-1 text-[12px] text-muted">
                      {done}/{r.people.length}명 남김
                    </span>
                  </div>
                </div>
                <ChevronRightIcon size={16} className="shrink-0 text-faint" />
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
