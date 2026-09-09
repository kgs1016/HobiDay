"use client";

import { useState } from "react";
import editorial from "@/content/editorial-2026-09-09.json";
import photographs from "@/content/news-artwork.json";
import type { Article } from "@/lib/community";

export default function NewsArtwork({ article, thumbnail = false }: { article: Article; thumbnail?: boolean }) {
  const [failed, setFailed] = useState<string>();
  const original = editorial.news.find(a => a.id === article.id);
  const replacement = photographs.find(a => a.article_id === article.id);
  const bundled = original && [original.image_url, replacement?.image_url].some(path => path && (
    article.image_url === path || article.image_url === `https://hobiday-eight.vercel.app${path}`
  ));
  // 기존 DB 이미지 주소만 교체한다. 운영자가 새 외부 사진을 등록하면 그 사진을 우선한다.
  const artwork = bundled ? replacement : undefined;
  const src = artwork?.image_url ?? (bundled ? original.image_url : article.image_url);
  const isPhoto = artwork?.kind === "photo";
  if (!src || failed === src || !/^(https:\/\/|\/images\/news\/)/.test(src)) return null;
  return (
    <figure className={thumbnail ? "w-24 shrink-0" : "mt-5"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={thumbnail ? "" : artwork?.image_alt ?? (bundled ? original.image_alt : article.title)}
        width={artwork?.width ?? 1200} height={artwork?.height ?? 800} loading={thumbnail ? "lazy" : "eager"}
        onError={() => setFailed(src)}
        className={`w-full ${thumbnail ? "rounded-xl" : "rounded-2xl"} ${isPhoto ? "h-auto" : "aspect-[3/2] object-cover"}`} />
      {!thumbnail && (isPhoto ? <figcaption className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted">
        <p>{artwork.caption}</p>
        <a href={artwork.source_url} target="_blank" rel="noopener noreferrer" className="underline decoration-line underline-offset-2">
          사진: {artwork.credit}<span className="sr-only"> (출처, 새 창)</span>
        </a>
      </figcaption> : bundled && <figcaption className="mt-2 text-[11px] leading-relaxed text-muted">[이해를 돕기 위해 AI로 생성한 사진입니다]</figcaption>)}
    </figure>
  );
}
