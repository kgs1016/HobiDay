"use client";

/* 플레이어 리뷰 — 프로필의 암벽화 성취와 정보 표 사이.
   글이 있는 리뷰가 옆으로 넘기는 카드로 흐르고, 상세보기에서 다 본다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AvatarFallback, ChevronRightIcon, ThumbIcon } from "@/components/icons";
import { fetchProfileReviews, signedPhotoUrls, type Review } from "@/lib/supabase";

export const reviewDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
};

export function ReviewCard({
  r,
  photoUrl,
  full,
}: {
  r: Review;
  photoUrl?: string;
  /** 상세 목록에서는 줄 수를 안 자른다 */
  full?: boolean;
}) {
  if (!r.author_id || !r.body) return null;
  return (
    <div className="rounded-xl bg-surface2 px-4 py-3.5">
      <div className="flex items-center gap-2">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
        ) : (
          <AvatarFallback size={28} />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold">
            {r.author_name ?? "탈퇴한 사용자"}
          </p>
          <p className="truncate text-[11px] text-faint">
            {[r.gym, reviewDate(r.created_at)].filter(Boolean).join(" · ")}
          </p>
        </div>
        {r.liked && (
          <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-accent-strong">
            <ThumbIcon size={13} /> 추천
          </span>
        )}
      </div>
      <p
        className={`mt-2.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink ${
          full ? "" : "line-clamp-3"
        }`}
      >
        {r.body}
      </p>
    </div>
  );
}

export default function PlayerReviews({
  userId,
  count,
  likes,
}: {
  userId: string;
  count: number;
  /** 내 정보에서만 — 남의 프로필은 이름 아래에 이미 있다 */
  likes?: number;
}) {
  const [list, setList] = useState<Review[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const rows = (await fetchProfileReviews(userId, undefined, 10)) ?? [];
      if (!active) return;
      setList(rows);
      const paths = rows.map((r) => r.author_photo).filter(Boolean) as string[];
      if (paths.length) {
        const urls = await signedPhotoUrls(paths);
        if (active) setPhotos(urls);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <section className="mt-2 border-t border-line pt-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          플레이어 리뷰
          {count > 0 && <span className="font-normal text-muted">{count}</span>}
          {likes !== undefined && (
            <span className="ml-1 flex items-center gap-0.5 text-[12px] text-accent-strong">
              <ThumbIcon size={13} /> {likes}
            </span>
          )}
        </h2>
        {count > 0 && (
          <Link
            href={`/user/reviews?id=${userId}`}
            className="flex items-center gap-0.5 text-[12px] font-medium text-muted"
          >
            상세보기 <ChevronRightIcon size={13} />
          </Link>
        )}
      </div>

      {list === null ? (
        <p className="mt-3 text-[12px] text-faint">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">아직 리뷰가 없어요</p>
      ) : (
        /* 옆으로 넘기는 카드 — 화면 여백(px-4)을 뚫고 나가게 -mx-4.
           overflow-x 만 주면 overflow-y 도 auto 가 되어 세로 스크롤 영역이
           하나 더 생긴다 — 소수점 높이 차이로 1px 스크롤이 잡히면 카드 아래에
           스크롤바가 떠다닌다. 세로는 hidden 으로 못박고, 스크롤바는 웹킷까지 감춘다.
           snap 은 mandatory 가 아니라 proximity — iOS 사파리가 mandatory 를
           페이지 세로 스크롤에까지 끌어다 붙이는 버그가 있다. */
        <div className="-mx-4 mt-3 flex snap-x snap-proximity gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {list.map((r) => (
            <div key={r.id} className="w-[78%] shrink-0 snap-start">
              <ReviewCard r={r} photoUrl={r.author_photo ? photos[r.author_photo] : undefined} />
            </div>
          ))}
          {count > list.length && (
            <Link
              href={`/user/reviews?id=${userId}`}
              className="button-secondary flex w-[40%] shrink-0 snap-start items-center justify-center rounded-xl text-[13px] font-medium"
            >
              더 보기
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
