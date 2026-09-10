"use client";

/* 글 하나 — /community/post?id=
   댓글 입력은 화면 아래에 고정하지 않고 댓글 목록 끝에 둔다. 채팅 화면이
   겪은 iOS 키보드-고정요소 문제를 다시 만들 이유가 없다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryId, useQueryParam } from "@/lib/queryId";
import FeedbackVideoPlayer from "@/components/FeedbackVideoPlayer";
import { setVideoLike } from "@/lib/feedbackVideo";
import BackButton from "@/components/BackButton";
import GearPreparing from "@/components/GearPreparing";
import PostBody from "@/components/PostBody";
import ReportSheet from "@/components/ReportSheet";
import { AvatarFallback } from "@/components/icons";
import {
  COMMENT_MAX,
  boardHref,
  boardTopicLabel,
  MOCK_POSTS,
  ago,
  type PostComment,
  type PostDetail,
} from "@/lib/community";
import {
  createComment,
  deleteComment,
  deletePost,
  fetchPost,
  hasSupabase,
  signedPhotoUrls,
} from "@/lib/supabase";



/** 목데이터 — 실제 조회처럼 비동기로 준다 */
const mockPost = async (id: string) => MOCK_POSTS.find((p) => p.id === id) ?? null;

const ERRORS: Record<string, string> = {
  no_auth: "로그인이 필요해요",
  no_profile: "회원 정보를 불러오지 못했어요. 다시 시도해주세요",
  empty: "내용을 적어주세요",
  too_fast: "잠시 후 다시 써주세요",
  not_found: "글이 지워졌어요",
  blocked: "댓글을 남길 수 없는 글이에요",
  not_mine: "내가 쓴 것만 지울 수 있어요",
};

function Avatar({ url, size }: { url?: string; size: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
    />
  ) : (
    <AvatarFallback size={size} />
  );
}

export default function PostPage() {
  const id = useQueryId();
  const from = useQueryParam("from");
  const router = useRouter();
  const pathname = usePathname();
  const [post, setPost] = useState<PostDetail | null | undefined>(undefined);
  const video = !!post?.video_path || from === "video" || pathname.startsWith("/videos");
  const BOARD = video ? (from === "mine" ? "/me/videos" : "/videos") : boardHref(post?.category);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState("");
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  // 신고 대상 — 글쓴이 또는 댓글쓴이
  const [report, setReport] = useState<{
    targetId: string;
    nickname: string;
    context: "post" | "comment";
    refId: string;
  } | null>(null);

  // 댓글을 달거나 지운 뒤 다시 받는다 — tick 을 올리면 아래 effect 가 다시 돈다
  const [tick, setTick] = useState(0);
  const load = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      const p = hasSupabase() ? await fetchPost(id) : await mockPost(id);
      if (!alive) return;
      setPost(p);
      if (!p) return;
      // 예전 댓글 알림의 /community/post 주소도 영상 탭으로 이어준다.
      if (p.video_path && !pathname.startsWith("/videos")) {
        router.replace(`/videos/post?id=${encodeURIComponent(p.id)}${from === "mine" ? "&from=mine" : ""}`);
      } else if (!p.video_path && pathname.startsWith("/videos")) {
        router.replace(`/community/post?id=${encodeURIComponent(p.id)}`);
      }
      const paths = [p.photo, ...p.comments.map((c) => c.photo)].filter(Boolean) as string[];
      if (paths.length) {
        const urls = await signedPhotoUrls(paths);
        if (alive) setPhotos(urls);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, tick, pathname, from, router]);

  const submitComment = async () => {
    if (!post || post.category === "gear" || !comment.trim()) return;
    if (!hasSupabase()) return alert("목데이터 모드에서는 저장되지 않아요");
    setBusy(true);
    const r = await createComment(post.id, comment.trim());
    setBusy(false);
    if (r.error) return alert(ERRORS[r.error] ?? `실패: ${r.error}`);
    setComment("");
    load();
  };

  const like = async () => {
    if (!post || likeBusy) return;
    setLikeBusy(true);
    setLikeError("");
    try {
      const r = await setVideoLike(post.id, !post.liked);
      if (r.error) throw new Error(ERRORS[r.error] ?? "좋아요를 저장하지 못했어요");
      setPost((p) => p ? { ...p, liked: r.liked, like_count: r.like_count } : p);
    } catch (e) { setLikeError(e instanceof Error ? e.message : "다시 시도해주세요"); }
    finally { setLikeBusy(false); }
  };

  const removeComment = async (c: PostComment) => {
    if (!confirm("댓글을 지울까요?")) return;
    const r = await deleteComment(c.id);
    if (r.error) return alert(ERRORS[r.error] ?? `실패: ${r.error}`);
    load();
  };

  const removePost = async () => {
    if (!post || !confirm("글을 지울까요? 되돌릴 수 없어요.")) return;
    setBusy(true);
    const r = await deletePost(post.id);
    setBusy(false);
    if (r.error) return alert(ERRORS[r.error] ?? `실패: ${r.error}`);
    router.replace(BOARD);
  };

  if (id === undefined || (id && post === undefined))
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-faint">불러오는 중…</main>
    );

  if (post?.category === "gear") return (
    <main className="px-4">
      <header className="flex items-center gap-2 pt-4"><BackButton to="/community?tab=gear" /><h1 className="text-[18px] font-bold">장비 추천</h1></header>
      <GearPreparing />
    </main>
  );

  if (!id || !post)
    return (
      <main className="px-4">
        <header className="flex items-center gap-2 pt-4 pb-2">
          <BackButton fallback={BOARD} />
        </header>
        <div className="mt-20 flex flex-col items-center gap-3 text-center">
          <p className="text-[15px] font-semibold">글을 찾을 수 없어요</p>
          <Link href={BOARD} className="mt-2 text-[13.5px] font-semibold text-accent-strong">
            {video ? "영상 목록으로" : "게시판으로"}
          </Link>
        </div>
      </main>
    );

  const authorName = post.nickname ?? "탈퇴한 회원";

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-2">
        <BackButton fallback={BOARD} />
        <div className="flex-1" />
        {post.mine ? (
          <>
            {!post.video_path && <Link
              href={`/community/write?id=${post.id}&category=${post.category ?? "board"}`}
              className="px-2 py-1 text-[13.5px] font-medium text-muted"
            >
              수정
            </Link>}
            <button
              onClick={removePost}
              disabled={busy}
              className="px-2 py-1 text-[13.5px] font-medium text-danger disabled:opacity-50"
            >
              삭제
            </button>
          </>
        ) : (
          post.author_id && (
            <button
              onClick={() =>
                setReport({
                  targetId: post.author_id!,
                  nickname: authorName,
                  context: "post",
                  refId: post.id,
                })
              }
              className="px-2 py-1 text-[13.5px] font-medium text-muted"
            >
              신고
            </button>
          )
        )}
      </header>

      <article>
        {!post.video_path && <p className="mb-2 text-[12px] font-semibold text-accent-strong">
          {post.pinned_rank ? "공지" : boardTopicLabel(post.topic)}
        </p>}
        <h1 className="text-[19px] font-bold leading-snug tracking-tight">{post.video_path ? "등반 영상" : post.title}</h1>
        <div className="mt-3 flex items-center gap-2.5">
          <Avatar url={post.photo ? photos[post.photo] : undefined} size={32} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold">{authorName}</p>
            <p className="text-[12px] text-faint">
              {ago(post.created_at)}
              {post.updated_at !== post.created_at && " · 수정됨"}
            </p>
          </div>
        </div>
        {post.video_path && <FeedbackVideoPlayer key={post.video_path} path={post.video_path} thumbnail={post.thumbnail_path} />}
        <PostBody body={post.body} />
        {post.video_path && <div className="mt-4">
          <button onClick={like} disabled={likeBusy} aria-pressed={!!post.liked}
            className={`rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${post.liked ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-muted"}`}>
            {post.liked ? "♥" : "♡"} 좋아요 {post.like_count ?? 0}
          </button>
          {likeError && <p role="alert" className="mt-2 text-sm text-danger">{likeError}</p>}
        </div>}
      </article>

      <section className="mt-8 border-t border-line pt-5">
        <h2 className="text-[15px] font-bold">
          댓글 <span className="font-normal text-muted">{post.comments.length}</span>
        </h2>

        {post.comments.length > 0 && (
          <div className="mt-1 flex flex-col divide-y divide-line">
            {post.comments.map((c) => {
              const name = c.nickname ?? "탈퇴한 회원";
              return (
                <div key={c.id} className="flex gap-2.5 py-3.5">
                  <Avatar url={c.photo ? photos[c.photo] : undefined} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13px] font-semibold">
                        {name}
                        <span className="ml-1.5 font-normal text-faint">{ago(c.created_at)}</span>
                      </p>
                      {c.mine ? (
                        <button
                          onClick={() => removeComment(c)}
                          className="shrink-0 text-[12px] text-faint"
                        >
                          삭제
                        </button>
                      ) : (
                        c.author_id && (
                          <button
                            onClick={() =>
                              setReport({
                                targetId: c.author_id!,
                                nickname: name,
                                context: "comment",
                                refId: c.id,
                              })
                            }
                            className="shrink-0 text-[12px] text-faint"
                          >
                            신고
                          </button>
                        )
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                      {c.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-end gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
            placeholder="댓글을 남겨보세요"
            rows={2}
            /* iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 */
            className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            onClick={submitComment}
            disabled={busy || !comment.trim()}
            className="button-primary shrink-0 rounded-xl px-4 py-3 text-[14px] font-semibold"
          >
            {busy ? "…" : "등록"}
          </button>
        </div>
      </section>

      {report && (
        <ReportSheet
          targetId={report.targetId}
          nickname={report.nickname}
          context={report.context}
          refId={report.refId}
          onClose={() => setReport(null)}
          /* 신고하면 차단까지 걸려 그 사람의 글·댓글이 사라진다.
             글쓴이를 신고했으면 이 글 자체가 안 보이니 게시판으로. */
          onDone={() => (report.context === "post" ? router.replace(BOARD) : load())}
        />
      )}
    </main>
  );
}
