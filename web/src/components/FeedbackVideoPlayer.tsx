"use client";

import { useCallback, useEffect, useState } from "react";
import { feedbackMediaUrls } from "@/lib/feedbackVideo";

export default function FeedbackVideoPlayer({ path, thumbnail }: { path: string; thumbnail?: string | null }) {
  const [url, setUrl] = useState("");
  const [poster, setPoster] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const fail = useCallback(() => setError("영상을 재생하지 못했어요. 다시 불러오거나 다른 브라우저에서 시도해주세요"), []);
  useEffect(() => {
    let alive = true;
    feedbackMediaUrls([path, ...(thumbnail ? [thumbnail] : [])]).then((urls) => {
      if (!alive) return;
      if (!urls[path]) return fail();
      setUrl(urls[path]);
      setPoster(thumbnail ? urls[thumbnail] ?? "" : "");
    }).catch(() => { if (alive) fail(); });
    return () => { alive = false; };
  }, [path, thumbnail, attempt, fail]);
  if (error) return <div role="alert" className="mt-4 rounded-xl bg-surface2 p-5 text-sm">
    <p>{error}</p><button onClick={() => { setError(""); setUrl(""); setAttempt((v) => v + 1); }} className="mt-3 font-semibold text-accent-strong">다시 불러오기</button>
  </div>;
  return url ? <video key={`${path}-${attempt}`} src={url} poster={poster} controls playsInline preload="metadata" onError={fail}
    className="mt-4 max-h-[65vh] w-full rounded-2xl bg-black" /> : <p className="py-8 text-center text-sm text-faint">영상 불러오는 중…</p>;
}
