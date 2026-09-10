"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import VideoFeedbackFeed from "@/components/VideoFeedbackFeed";
import { PlusIcon } from "@/components/icons";
import { currentUser, hasSupabase } from "@/lib/supabase";

export default function Videos() {
  const [authed, setAuthed] = useState<boolean | null>(hasSupabase() ? null : true);
  useEffect(() => {
    if (!hasSupabase()) return;
    let alive = true;
    currentUser().then(user => { if (alive) setAuthed(!!user); });
    return () => { alive = false; };
  }, []);

  return <main className="px-4">
    <header className="flex items-center justify-between pt-6 pb-3">
      <h1 className="text-[20px] font-bold tracking-tight">영상</h1>
      {authed && <Link href="/videos/upload" className="button-secondary flex min-h-9 items-center gap-1 rounded-lg px-3 text-[12.5px] font-semibold">
        <PlusIcon size={14} strokeWidth={2.2} />영상 올리기
      </Link>}
    </header>
    {authed && <nav aria-label="영상 분류" className="mt-2 flex gap-2 border-b border-line pb-3">
      <span aria-current="page" className="flex min-h-9 items-center rounded-full bg-ink px-4 text-[12.5px] font-medium text-white">전체 영상</span>
      <Link href="/me/videos" className="flex min-h-9 items-center rounded-full bg-surface2 px-4 text-[12.5px] font-medium text-muted">내 영상</Link>
    </nav>}
    {authed === false ? <div className="mt-14 flex flex-col items-center gap-3 text-center">
      <p className="text-[14px] text-muted">로그인하면 영상을 볼 수 있어요</p>
      <Link href="/login" className="button-primary rounded-xl px-6 py-2.5 text-[14px] font-semibold">로그인 하기</Link>
    </div> : authed ? <VideoFeedbackFeed /> : <p role="status" className="pt-16 text-center text-sm text-faint">불러오는 중…</p>}
  </main>;
}
