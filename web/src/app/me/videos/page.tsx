"use client";

/* 내 영상 — 커뮤니티 영상 피드백에 내가 올린 것들.
   격자는 커뮤니티 목록과 같은 컴포넌트를 쓴다 (mine 모드). */

import BackButton from "@/components/BackButton";
import VideoFeedbackFeed from "@/components/VideoFeedbackFeed";

export default function MyVideos() {
  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-2">
        <BackButton fallback="/me/settings" />
        <h1 className="text-[18px] font-bold tracking-tight">내 영상</h1>
      </header>
      <VideoFeedbackFeed mine />
    </main>
  );
}
