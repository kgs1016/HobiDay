"use client";

/* 플레이어 리뷰 상세 — /user/reviews?id=<사람>. 프로필 칸의 "상세보기". */

import { useEffect, useState } from "react";
import { useQueryId } from "@/lib/queryId";
import BackButton from "@/components/BackButton";
import { ReviewCard } from "@/components/PlayerReviews";
import {
  fetchProfileReviews,
  fetchUserProfile,
  hasSupabase,
  signedPhotoUrls,
  type Review,
} from "@/lib/supabase";
import { ThumbIcon } from "@/components/icons";

const PAGE = 20;

export default function UserReviews() {
  const id = useQueryId();
  const [name, setName] = useState<string | null>(null);
  const [likes, setLikes] = useState(0);
  const [list, setList] = useState<Review[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const addPhotos = async (rows: Review[]) => {
    const paths = rows.map((r) => r.author_photo).filter(Boolean) as string[];
    if (!paths.length) return;
    const urls = await signedPhotoUrls(paths);
    setPhotos((p) => ({ ...p, ...urls }));
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      if (!hasSupabase()) {
        setList([]);
        setDone(true);
        return;
      }
      const [p, rows] = await Promise.all([
        fetchUserProfile(id),
        fetchProfileReviews(id, undefined, PAGE),
      ]);
      if (p.profile) {
        setName(p.profile.nickname);
        setLikes(p.profile.likes);
      }
      const r = rows ?? [];
      setList(r);
      setDone(r.length < PAGE);
      addPhotos(r);
    })();
  }, [id]);

  const more = async () => {
    if (!id || !list?.length || busy) return;
    setBusy(true);
    const rows = (await fetchProfileReviews(id, list[list.length - 1].created_at, PAGE)) ?? [];
    setList((l) => [...(l ?? []), ...rows]);
    setDone(rows.length < PAGE);
    addPhotos(rows);
    setBusy(false);
  };

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-3">
        <BackButton fallback={id ? `/user?id=${id}` : "/"} />
        <h1 className="flex-1 text-[18px] font-bold tracking-tight">
          {name ? `${name}님의 리뷰` : "플레이어 리뷰"}
        </h1>
        {likes > 0 && (
          <span className="flex items-center gap-1 text-[13px] font-semibold text-accent-pressed">
            <ThumbIcon size={15} /> {likes}
          </span>
        )}
      </header>

      {list === null ? (
        <p className="pt-16 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : list.length === 0 ? (
        <p className="pt-16 text-center text-[13.5px] text-muted">아직 리뷰가 없어요</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {list.map((r) => (
            <ReviewCard key={r.id} r={r} full photoUrl={r.author_photo ? photos[r.author_photo] : undefined} />
          ))}
          {!done && (
            <button
              onClick={more}
              disabled={busy}
              className="mt-2 w-full rounded-xl border border-line py-3 text-[13.5px] font-medium text-muted disabled:opacity-50"
            >
              {busy ? "불러오는 중…" : "더 보기"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
