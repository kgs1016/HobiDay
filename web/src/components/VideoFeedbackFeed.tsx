"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlayIcon } from "@/components/icons";
import { ago, VIDEO_PAGE, type VideoSummary } from "@/lib/community";
import { feedbackMediaUrls, fetchFeedbackVideos, fetchMyFeedbackVideos } from "@/lib/feedbackVideo";

/** mine 이면 내가 올린 영상만 — 내 정보의 "내 영상" 이 같은 목록을 쓴다 */
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
      <div className="flex items-center justify-between border-b border-line pb-2.5 text-[11.5px] text-faint">
        <span>{mine ? "내가 올린 영상" : "클라이머들의 영상"}</span><span>최신순</span>
      </div>
      {rows.length > 0 && <div className="divide-y divide-line">
        {rows.map(p => <VideoFeedRow key={p.id} video={p} thumbnail={urls[p.thumbnail_path]} mine={mine} />)}
      </div>}
      {loaded && !rows.length && !error && <div className="py-16 text-center">
        <p className="text-[15px] font-semibold">{mine ? "아직 올린 영상이 없어요" : "아직 올라온 영상이 없어요"}</p>
        <Link href="/videos/upload" className="button-primary mt-4 inline-block rounded-xl px-5 py-3 text-sm font-semibold">영상 올리기</Link>
      </div>}
      {busy && <p role="status" className="py-6 text-center text-sm text-faint">불러오는 중…</p>}
      {error && <div role="alert" className="py-6 text-center text-sm">
        <p className="text-danger">{error}</p>
        <button onClick={() => load(rows.at(-1))} className="mt-3 font-semibold text-accent-strong">다시 시도</button>
      </div>}
      {more && !error && <button disabled={busy} onClick={() => load(rows.at(-1))}
        className="button-secondary mt-5 w-full rounded-xl py-3 text-sm">더 보기</button>}
    </section>
  );
}

export function VideoFeedRow({ video: p, thumbnail, mine = false }: { video: VideoSummary; thumbnail?: string; mine?: boolean }) {
  return <Link href={`/videos/post?id=${p.id}${mine ? "&from=mine" : ""}`} className="flex min-w-0 items-start gap-4 py-4 active:bg-surface2">
          <div className="flex min-h-28 min-w-0 flex-1 flex-col">
            <p className="line-clamp-2 break-words text-[14px] font-semibold leading-relaxed">{p.preview}</p>
            <p className="mt-2 truncate text-[11px] text-faint">{p.nickname ?? "탈퇴한 회원"} · {ago(p.created_at)}</p>
            <div className="mt-auto flex gap-3 pt-3 text-[11px] text-muted">
              <span>좋아요 {p.like_count}</span><span>댓글 {p.comment_count}</span>
            </div>
          </div>
          <div className="relative aspect-[3/4] w-[84px] shrink-0 overflow-hidden rounded-xl bg-surface2">
            {thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"><PlayIcon size={16} /></span>
            </span>
          </div>
        </Link>;
}
