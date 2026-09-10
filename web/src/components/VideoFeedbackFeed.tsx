"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PlayIcon } from "@/components/icons";
import { ago, VIDEO_PAGE, type VideoSummary } from "@/lib/community";
import { feedbackMediaUrls, fetchFeedbackVideos, fetchMyFeedbackVideos } from "@/lib/feedbackVideo";
import { createThumbnailRecovery, initialThumbnailState } from "@/lib/thumbnailRecovery";

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
      const thumbnails = await feedbackMediaUrls(next.map((r) => r.thumbnail_path)).catch(() => ({}));
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
      const thumbnails = await feedbackMediaUrls(next.map((r) => r.thumbnail_path)).catch(() => ({}));
      if (!alive) return;
      setRows(next); setUrls(thumbnails); setMore(next.length === VIDEO_PAGE); setLoaded(true);
    }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : "불러오지 못했어요"); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine]);

  return (
    <section className="pb-8 pt-4" aria-label="등반 영상 목록">
      {rows.length > 0 && <div className="grid grid-cols-2 gap-x-3 gap-y-5">
        {rows.map(p => <VideoFeedCard key={p.id} video={p} thumbnail={urls[p.thumbnail_path]} mine={mine} />)}
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

type VideoFeedCardProps = { video: VideoSummary; thumbnail?: string; mine?: boolean };

export function VideoFeedCard(props: VideoFeedCardProps) {
  // 경로 또는 최초 주소가 바뀌면 이전 요청·재시도 상태를 함께 정리한다.
  return <VideoCard key={JSON.stringify([props.video.thumbnail_path, props.thumbnail])} {...props} />;
}

function VideoCard({ video: p, thumbnail, mine = false }: VideoFeedCardProps) {
  const [image, setImage] = useState(() => initialThumbnailState(thumbnail));
  const imageElement = useRef<HTMLImageElement>(null);
  const recovery = useRef<ReturnType<typeof createThumbnailRecovery> | null>(null);
  useEffect(() => {
    const current = createThumbnailRecovery(thumbnail, async () => {
      const urls = await feedbackMediaUrls([p.thumbnail_path]);
      return urls[p.thumbnail_path];
    }, setImage);
    recovery.current = current;
    current.start();
    // 캐시된 이미지 오류가 effect보다 먼저 발생한 경우에도 복구한다.
    if (thumbnail && imageElement.current?.complete) {
      if (imageElement.current.naturalWidth) current.imageLoaded(0);
      else current.imageFailed(0);
    }
    return () => { current.stop(); recovery.current = null; };
  }, [p.thumbnail_path, thumbnail]);

  return <article className="relative min-w-0">
    <Link href={`/videos/post?id=${p.id}${mine ? "&from=mine" : ""}`} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-ink">
        {image.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={imageElement} key={image.attempt} src={image.url} alt="" loading="lazy"
            onLoad={() => recovery.current?.imageLoaded(image.attempt)}
            onError={() => recovery.current?.imageFailed(image.attempt)}
            className="h-full w-full object-contain" />
        )}
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur-sm"><PlayIcon size={16} /></span>
        </span>
      </div>
      <div className="pt-2">
        <p className="line-clamp-2 break-words text-[13px] font-semibold leading-snug">{p.preview}</p>
        <p className="mt-1 truncate text-[11px] text-muted">{p.nickname ?? "탈퇴한 회원"} · {ago(p.created_at)}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
          <span>좋아요 {p.like_count}</span><span>댓글 {p.comment_count}</span>
        </div>
      </div>
    </Link>
    {image.status === "failed" && <button type="button" onClick={() => recovery.current?.retry()}
      aria-label={`${p.preview} 썸네일 다시 불러오기`}
      className="absolute right-2 top-2 flex min-h-11 items-center rounded-lg bg-white px-3 text-[11px] font-semibold text-ink shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
      다시 불러오기
    </button>}
  </article>;
}
