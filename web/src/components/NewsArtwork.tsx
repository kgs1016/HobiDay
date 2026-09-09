"use client";

import { useState } from "react";
import editorial from "@/content/editorial-2026-09-09.json";
import type { Article } from "@/lib/community";

export default function NewsArtwork({ article, thumbnail = false }: { article: Article; thumbnail?: boolean }) {
  const [failed, setFailed] = useState<string>();
  const artwork = editorial.news.find(a => a.id === article.id && (
    article.image_url === a.image_url || article.image_url === `https://hobiday-eight.vercel.app${a.image_url}`
  ));
  // 동봉한 이미지는 네이티브에서도 로컬 파일로 읽는다. 이후 등록되는 외부 사진도 지원한다.
  const src = artwork?.image_url ?? article.image_url;
  if (!src || failed === src || !/^(https:\/\/|\/images\/news\/)/.test(src)) return null;
  return (
    <figure className={thumbnail ? "relative w-24 shrink-0 overflow-hidden rounded-xl" : "mt-5"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={thumbnail ? "" : artwork?.image_alt ?? article.title}
        width={1200} height={800} loading={thumbnail ? "lazy" : "eager"}
        onError={() => setFailed(src)}
        className={thumbnail ? "aspect-[4/3] w-full object-cover" : "aspect-[3/2] w-full rounded-2xl object-cover"} />
      {artwork && <figcaption className={thumbnail
        ? "absolute right-1 bottom-1 rounded bg-ink/75 px-1 text-[9px] leading-4 text-white"
        : "mt-2 text-right text-[11px] text-faint"}>AI 생성 이미지</figcaption>}
    </figure>
  );
}
