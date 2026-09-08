"use client";

/* 리뷰 작성 — /review?id=<모임>. 알림과 내 정보 > 리뷰 작성에서 온다.
   함께한 사람마다 추천 하나와 한마디. 끝난 뒤 일주일까지, 한 사람에게 한 번. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryId } from "@/lib/queryId";
import BackButton from "@/components/BackButton";
import { AvatarFallback, ThumbIcon } from "@/components/icons";
import { HoldIllust } from "@/components/illustrations";
import {
  fetchReviewSession,
  hasSupabase,
  signedPhotoUrls,
  submitReview,
  type ReviewSession,
  type ReviewTarget,
} from "@/lib/supabase";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const untilLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}까지`;
};

const ERRORS: Record<string, string> = {
  closed: "리뷰 기간이 지났어요",
  not_member: "함께한 모임이 아니에요",
  blocked: "차단한 사람에게는 남길 수 없어요",
  left: "탈퇴한 사람이에요",
  done: "이미 남긴 사람이에요",
  empty: "추천을 누르거나 한마디를 적어주세요",
};

/* 사람 하나 — 남기면 끝이다. 고치지 못하고 목록에서 빠진다 (onDone). */
function PersonForm({
  sessionId,
  p,
  photoUrl,
  open,
  onDone,
}: {
  sessionId: string;
  p: ReviewTarget;
  photoUrl?: string;
  open: boolean;
  onDone: () => void;
}) {
  const [liked, setLiked] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const filled = liked || body.trim().length > 0;

  const save = async () => {
    if (!confirm(`${p.nickname}님에게 리뷰를 남길까요?\n남기면 고칠 수 없어요.`)) return;
    setBusy(true);
    const r = await submitReview(sessionId, p.id, liked, body);
    setBusy(false);
    if (r.error) return alert(ERRORS[r.error] ?? `남기지 못했어요: ${r.error}`);
    onDone();
  };

  return (
    <div className="border-b border-line py-4 last:border-b-0">
      <div className="flex items-center gap-3">
        <Link href={`/user?id=${p.id}&s=${sessionId}`} className="flex min-w-0 flex-1 items-center gap-3">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
          ) : (
            <AvatarFallback size={44} />
          )}
          <p className="min-w-0 truncate text-[15px] font-semibold">
            {p.nickname}
            {p.is_host && <span className="ml-1 text-[12px] font-normal text-faint">· 호스트</span>}
          </p>
        </Link>
        <button
          type="button"
          disabled={!open}
          aria-pressed={liked}
          onClick={() => setLiked((v) => !v)}
          className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-50 ${
            liked
              ? "border-accent bg-accent-soft text-accent-strong"
              : "border-line bg-surface text-muted"
          }`}
        >
          <ThumbIcon size={14} /> 추천
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 300))}
        disabled={!open}
        rows={2}
        placeholder="함께 타보니 어땠나요? (선택)"
        /* iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 */
        className="mt-3 w-full resize-none rounded-lg bg-surface2 px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:outline-none disabled:opacity-60"
      />
      {open && (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11.5px] text-faint">{body.length}/300</span>
          <button
            type="button"
            disabled={busy || !filled}
            onClick={save}
            className="button-primary rounded-lg px-4 py-2 text-[13px] font-semibold"
          >
            {busy ? "남기는 중…" : "남기기"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ReviewPage() {
  const id = useQueryId();
  const [s, setS] = useState<ReviewSession | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    if (id === undefined) return;
    (async () => {
      if (!id || !hasSupabase()) {
        setS(null);
        return;
      }
      const r = await fetchReviewSession(id);
      if (!r.session) {
        setS(null);
        return;
      }
      setS(r.session);
      const paths = r.session.people.map((p) => p.photo).filter(Boolean) as string[];
      if (paths.length) setPhotos(await signedPhotoUrls(paths));
    })();
  }, [id]);

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-3">
        <BackButton fallback="/me/reviews" />
        <h1 className="text-[18px] font-bold tracking-tight">리뷰 작성</h1>
      </header>

      {s === undefined ? (
        <p className="pt-16 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : s === null ? (
        <div className="mt-16 flex flex-col items-center gap-1.5 text-center">
          <HoldIllust size={64} />
          <p className="mt-3 text-[15px] font-semibold">리뷰를 남길 수 없는 모임이에요</p>
          <Link
            href="/me/reviews"
            className="button-primary mt-3 rounded-xl px-6 py-2.5 text-[14px] font-semibold"
          >
            리뷰 작성 목록
          </Link>
        </div>
      ) : (
        <>
          <Link href={`/session?id=${s.id}`} className="block rounded-xl bg-surface2 px-4 py-3">
            <p className="truncate text-[14.5px] font-semibold">{s.gym}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {when(s.starts_at)} ·{" "}
              {s.open ? untilLabel(s.until) : "리뷰 기간이 지났어요"}
            </p>
          </Link>

          {s.people.length === 0 ? (
            <p className="pt-12 text-center text-[13.5px] text-muted">
              이 모임의 리뷰를 다 남겼어요
            </p>
          ) : (
            <div className="mt-2">
              {s.people.map((p) => (
                <PersonForm
                  key={p.id}
                  sessionId={s.id}
                  p={p}
                  open={s.open}
                  photoUrl={p.photo ? photos[p.photo] : undefined}
                  // 남긴 사람은 그 자리에서 빠진다 — 서버 목록과 같은 모양
                  onDone={() =>
                    setS((cur) =>
                      cur ? { ...cur, people: cur.people.filter((x) => x.id !== p.id) } : cur
                    )
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
