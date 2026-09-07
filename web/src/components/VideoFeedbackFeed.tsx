"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ago, VIDEO_PAGE, type VideoSummary } from "@/lib/community";
import { feedbackMediaUrls, fetchFeedbackVideos, fetchMyFeedbackVideos } from "@/lib/feedbackVideo";

/** mine 이면 내가 올린 영상만 — 내 정보의 "내 영상" 이 같은 격자를 쓴다 */
export default function VideoFeedbackFeed({ mine = false }: { mine?: boolean }) {
  const fetchPage = mine ? fetchMyFeedbackVideos : fetchFeedbackVideos;
  const [rows, setRows] = useState<VideoSummary[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const fetching = useRef(false);

  const load = async (before?: VideoSummary) => {
    if (fetching.current) return;
    fetching.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await fetchPage(before);
      const thumbnails = await feedbackMediaUrls(next.map((r) => r.thumbnail_path));
      setRows((prev) => before ? [...prev, ...next.filter((r) => !prev.some((p) => p.id === r.id))] : next);
      setUrls((prev) => ({ ...prev, ...thumbnails }));
      setMore(next.length === VIDEO_PAGE);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했어요");
    } finally {
      fetching.current = false; setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    fetchPage().then(async (next) => {
      const thumbnails = await feedbackMediaUrls(next.map((r) => r.thumbnail_path));
      if (!alive) return;
      setRows(next); setUrls(thumbnails); setMore(next.length === VIDEO_PAGE); setLoaded(true);
    }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : "불러오지 못했어요"); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine]);

  return (
    <section className="pb-8 pt-4" aria-label="영상 피드백 목록">
      {rows.length > 0 && <div className="grid grid-cols-2 gap-x-3 gap-y-6">
        {rows.map((p) => <Link key={p.id} href={`/community/post?id=${p.id}&from=video`} className="min-w-0">
          <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-surface2">
            {urls[p.thumbnail_path] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[p.thumbnail_path]} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
            <span aria-hidden="true" className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">▶</span>
          </div>
          <p className="mt-2 line-clamp-2 break-words text-sm font-semibold leading-snug">{p.preview}</p>
          <p className="mt-1 truncate text-xs text-faint">{p.nickname ?? "탈퇴한 회원"} · {ago(p.created_at)}</p>
          <p className="mt-1 text-xs text-muted">좋아요 {p.like_count} · 댓글 {p.comment_count}</p>
        </Link>)}
      </div>}
      {loaded && !rows.length && !error && <div className="py-16 text-center">
        <p className="text-[15px] font-semibold">{mine ? "아직 올린 영상이 없어요" : "아직 올라온 영상이 없어요"}</p>
        <Link href="/community/upload" className="mt-4 inline-block rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white">영상 올리기</Link>
      </div>}
      {busy && <p role="status" className="py-6 text-center text-sm text-faint">불러오는 중…</p>}
      {error && <div role="alert" className="py-6 text-center text-sm">
        <p className="text-danger">{error}</p>
        <button onClick={() => load(rows.at(-1))} className="mt-3 font-semibold text-accent-pressed">다시 시도</button>
      </div>}
      {more && !error && <button disabled={busy} onClick={() => load(rows.at(-1))}
        className="mt-5 w-full rounded-xl border border-line py-3 text-sm disabled:opacity-40">더 보기</button>}
    </section>
  );
}
