"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AvatarFallback } from "@/components/icons";
import { ago, boardTopicLabel, mockPostSummaries, POST_PAGE, type PostCategory, type PostSummary } from "@/lib/community";
import { fetchPosts, hasSupabase, signedPhotoUrls } from "@/lib/supabase";

export function PostRow({ p, photo }: { p: PostSummary; photo?: string }) {
  return (
    <Link
      href={`/community/post?id=${p.id}`}
      className="block py-3.5 transition-colors active:bg-surface2"
    >
      {p.category !== "gear" && <p className="mb-1.5 text-[11.5px] font-medium text-muted">{boardTopicLabel(p.topic)}</p>}
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 line-clamp-2 text-[15px] font-semibold leading-relaxed">{p.title}</p>
        {p.comment_count > 0 && (
          <span className="shrink-0 text-[12px] font-medium text-accent-strong">
            💬 {p.comment_count}
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
        {p.preview.replace(/(^|\s)##\s/g, "$1")}
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-faint">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-4 w-4 rounded-full object-cover" />
        ) : (
          <AvatarFallback size={16} />
        )}
        {p.nickname ?? "탈퇴한 회원"} · {ago(p.created_at)}
      </p>
    </Link>
  );
}

/** 분류마다 새로 마운트해 이전 목록·페이지 요청이 다른 게시판에 섞이지 않게 한다. */
export default function BoardFeed({ category }: { category: PostCategory }) {
  const mock = !hasSupabase();
  const [rows, setRows] = useState<PostSummary[] | null>(mock ? mockPostSummaries(category) : null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(!mock);
  const [error, setError] = useState("");
  const fetching = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (mock) return () => { mounted.current = false; };
    let alive = true;
    fetchPosts(category).then(async (next) => {
      if (!next) throw new Error("글을 불러오지 못했어요");
      const urls = await signedPhotoUrls(next.map(p => p.photo).filter(Boolean) as string[]);
      if (!alive) return;
      setRows(next); setMore(next.length === POST_PAGE); setPhotos(urls);
    }).catch(() => { if (alive) setError("글을 불러오지 못했어요. 다시 시도해주세요"); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; mounted.current = false; };
  }, [category, mock]);

  const load = async () => {
    if (fetching.current || busy) return;
    fetching.current = true;
    setBusy(true); setError("");
    try {
      const next = await fetchPosts(category, rows?.at(-1));
      if (!next) throw new Error("load_failed");
      const urls = await signedPhotoUrls(next.map(p => p.photo).filter(Boolean) as string[]);
      if (!mounted.current) return;
      setRows(prev => [...(prev ?? []), ...next.filter(p => !prev?.some(old => old.id === p.id))]);
      setPhotos(prev => ({ ...prev, ...urls }));
      setMore(next.length === POST_PAGE);
    } catch {
      if (mounted.current) setError("글을 불러오지 못했어요. 다시 시도해주세요");
    } finally {
      fetching.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <section aria-label={category === "gear" ? "장비 추천 목록" : "자유게시판 목록"} className="pb-6">
    <div className="flex flex-col divide-y divide-line">
      {rows?.map(p => <PostRow key={p.id} p={p} photo={p.photo ? photos[p.photo] : undefined} />)}
    </div>
    {rows?.length === 0 && !error && <div className="py-16 text-center">
      <p className="text-[15px] font-semibold">아직 글이 없어요</p>
      <Link href={`/community/write?category=${category}`} className="mt-3 inline-block text-sm font-semibold text-accent-strong">
        {category === "gear" ? "첫 장비 추천 남기기" : "첫 이야기 남기기"}
      </Link>
    </div>}
    {busy && <p role="status" className="py-8 text-center text-sm text-faint">불러오는 중…</p>}
    {error && <div role="alert" className="py-8 text-center text-sm">
      <p className="text-danger">{error}</p>
      <button onClick={load} disabled={busy} className="mt-3 font-semibold text-accent-strong">다시 시도</button>
    </div>}
    {more && !error && <button onClick={load} disabled={busy} className="button-secondary mt-3 w-full rounded-xl py-3 text-sm">더 보기</button>}
  </section>;
}
