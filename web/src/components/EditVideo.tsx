"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BackButton from "./BackButton";
import FeedbackVideoPlayer from "./FeedbackVideoPlayer";
import { fetchPost } from "@/lib/supabase";
import { POST_BODY_MAX, type PostDetail } from "@/lib/community";
import { requireParticipationProfile, handleParticipationError } from "@/lib/participation";
import { feedbackMediaUrls, imageThumbnail, videoThumbnail, uploadFeedbackReplacement, updateFeedbackVideo, type VideoReplacement } from "@/lib/feedbackVideo";

export default function EditVideo({ id }: { id: string }) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchPost(id, true).then(p => {
      if (!alive) return;
      if (!p?.mine || !p.video_path || !p.thumbnail_path) setError("내가 올린 영상만 수정할 수 있어요");
      else { setPost(p); setError(""); }
    }).catch(() => { if (alive) setError("영상을 불러오지 못했어요"); });
    return () => { alive = false; };
  }, [id, attempt]);
  if (error) return <main className="px-4 py-5"><BackButton fallback={`/videos/post?id=${id}`} />
    <p role="alert" className="mt-8 text-sm">{error}</p><button onClick={() => setAttempt(a => a + 1)} className="button-secondary mt-4 rounded-lg px-4 py-2">다시 시도</button></main>;
  if (!post) return <main className="pt-24 text-center text-sm text-muted">불러오는 중…</main>;
  return <EditVideoForm key={id} post={post} />;
}

function EditVideoForm({ post }: { post: PostDetail }) {
  const router = useRouter();
  const [body, setBody] = useState(post.body);
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const [videoPreview, setVideoPreview] = useState("");
  const [thumbPreview, setThumbPreview] = useState("");
  const [originalThumb, setOriginalThumb] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{ media: VideoReplacement; body: string } | null>(null);
  const selecting = useRef(0);
  const saving = useRef(false);
  const locked = busy || preparing || !!pending;
  const dirty = body.trim() !== post.body || !!file || !!thumbnail;

  useEffect(() => {
    let alive = true;
    feedbackMediaUrls([post.thumbnail_path!]).then(urls => { if (alive) setOriginalThumb(urls[post.thumbnail_path!] ?? ""); }).catch(() => {});
    return () => { alive = false; };
  }, [post.thumbnail_path]);
  useEffect(() => () => { if (videoPreview) URL.revokeObjectURL(videoPreview); }, [videoPreview]);
  useEffect(() => () => { if (thumbPreview) URL.revokeObjectURL(thumbPreview); }, [thumbPreview]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  useEffect(() => () => { selecting.current++; }, []);

  const choose = async (next: File | undefined, kind: "video" | "thumbnail") => {
    if (!next || locked) return;
    const version = ++selecting.current;
    setPreparing(true); setError("");
    try {
      const thumb = await (kind === "video" ? videoThumbnail(next) : imageThumbnail(next));
      if (version !== selecting.current) return;
      if (kind === "video") { setFile(next); setVideoPreview(URL.createObjectURL(next)); }
      setThumbnail(thumb); setThumbPreview(URL.createObjectURL(thumb));
    } catch (e) { if (version === selecting.current) setError(e instanceof Error ? e.message : "파일을 확인하지 못했어요"); }
    finally { if (version === selecting.current) setPreparing(false); }
  };

  const save = async () => {
    if (saving.current || preparing || !body.trim() || !dirty) return;
    saving.current = true; setBusy(true); setError("");
    try {
      if (!(await requireParticipationProfile(router))) return;
      const request = pending ?? { body: body.trim(), media: await uploadFeedbackReplacement(post.id,
        { video: post.video_path!, thumbnail: post.thumbnail_path! }, file, thumbnail) };
      setPending(request);
      await updateFeedbackVideo(post.id, post.updated_at, request.body, request.media);
      router.replace(`/videos/post?id=${post.id}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "저장하지 못했어요";
      if (!handleParticipationError(message, router)) setError(message);
    } finally { saving.current = false; setBusy(false); }
  };

  return <main className="px-4 pb-10">
    <header className="flex items-center gap-2 py-4">
      {!busy && <BackButton fallback={`/videos/post?id=${post.id}`} />}
      <h1 className="flex-1 text-lg font-bold">영상 수정</h1>
      <button onClick={save} disabled={busy || preparing || !body.trim() || !dirty} className="button-primary rounded-lg px-4 py-2 text-sm font-semibold">
        {busy ? "저장 중…" : pending ? "저장 다시 시도" : "저장"}</button>
    </header>
    {videoPreview ? <video src={videoPreview} poster={thumbPreview} controls playsInline className="max-h-[420px] w-full rounded-xl bg-black" />
      : <FeedbackVideoPlayer path={post.video_path!} thumbnail={post.thumbnail_path} />}
    <fieldset disabled={locked} className="mt-4 min-w-0 space-y-6 disabled:opacity-60">
      <div><label className="button-secondary flex cursor-pointer justify-center rounded-xl px-4 py-3 text-sm font-semibold">
        영상 파일 바꾸기<input aria-label="영상 파일 바꾸기" type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only"
          onChange={e => { void choose(e.target.files?.[0], "video"); e.target.value = ""; }} /></label>
        <p className="mt-2 text-xs text-muted">MP4 · MOV · WebM / 최대 50MB</p></div>
      <div><p className="mb-2 text-sm font-semibold">썸네일</p>
        <div className="flex items-center gap-4">
          {/* Local blob previews and short-lived signed URLs bypass image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {thumbPreview || originalThumb ? <img src={thumbPreview || originalThumb} alt="영상 썸네일 미리보기" className="h-24 w-24 rounded-xl bg-surface2 object-cover"
            onError={() => setOriginalThumb("")} /> : <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-surface2 text-xs text-muted">사진 없음</div>}
          <div><label className="button-secondary inline-flex cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold">사진 선택
            <input aria-label="썸네일 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
              onChange={e => { void choose(e.target.files?.[0], "thumbnail"); e.target.value = ""; }} /></label>
            <p className="mt-2 text-xs text-muted">JPG · PNG · WebP / 최대 5MB</p></div>
        </div>
        {(file || thumbnail) && <button type="button" className="mt-3 text-xs font-semibold text-muted underline" onClick={() => {
          setFile(null); setThumbnail(null); setVideoPreview(""); setThumbPreview("");
        }}>원래 영상과 썸네일로 되돌리기</button>}
      </div>
      <div><label htmlFor="edit-video-body" className="text-sm font-semibold">영상 이야기</label>
        <textarea id="edit-video-body" value={body} onChange={e => setBody(e.target.value)} maxLength={POST_BODY_MAX} rows={5}
          className="mt-2 w-full resize-none rounded-xl border border-line bg-surface p-3 text-base leading-relaxed" />
        <p className="mt-1 text-right text-xs text-muted">{body.length} / {POST_BODY_MAX}</p></div>
    </fieldset>
    {preparing && <p role="status" className="mt-4 text-sm text-muted">파일 확인 중…</p>}
    {error && <div role="alert" className="mt-4 text-sm text-danger"><p>{error}</p>
      {pending && <Link href={`/videos/post?id=${post.id}`} className="mt-3 inline-block font-semibold underline">영상으로 돌아가기</Link>}</div>}
    <p className="mt-5 text-xs text-muted">수정해도 댓글과 좋아요는 그대로 유지돼요.</p>
  </main>;
}
