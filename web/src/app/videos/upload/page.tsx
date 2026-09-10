"use client";
import { requireParticipationProfile, handleParticipationError } from "@/lib/participation";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import { POST_BODY_MAX } from "@/lib/community";
import { hasSupabase } from "@/lib/supabase";
import { publishFeedbackVideo, uploadFeedbackMedia, videoThumbnail, type VideoDraft } from "@/lib/feedbackVideo";

const FEED = "/videos";

export default function UploadVideo() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [body, setBody] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<VideoDraft | null>(null);
  const selection = useRef(0);
  const submitting = useRef(false);

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const choose = async (next: File | undefined) => {
    if (!next) return;
    const version = ++selection.current;
    setPreparing(true);
    setError("");
    setFile(null);
    setThumbnail(null);
    try {
      const thumb = await videoThumbnail(next);
      if (version !== selection.current) return;
      setPreview(URL.createObjectURL(next));
      setFile(next);
      setThumbnail(thumb);
    } catch (e) {
      if (version === selection.current) setError(e instanceof Error ? e.message : "영상을 확인하지 못했어요");
    } finally {
      if (version === selection.current) setPreparing(false);
    }
  };

  const submit = async () => {
    if (!file || !thumbnail || !body.trim() || submitting.current) return;
    if (!hasSupabase()) return setError("로그인 후 영상을 올릴 수 있어요");
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await requireParticipationProfile(router))) return;
      const media = draft ?? await uploadFeedbackMedia(file, thumbnail);
      setDraft(media);
      const id = await publishFeedbackVideo(media, body.trim());
      router.replace(`/videos/post?id=${id}`);
    } catch (e) {
      if (!handleParticipationError(e instanceof Error ? e.message : undefined, router))
        setError(e instanceof Error ? e.message : "영상을 올리지 못했어요");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-4">
        {!busy && <BackButton fallback={FEED} />}
        <h1 className="flex-1 text-[18px] font-bold">영상 올리기</h1>
        <button onClick={submit} disabled={!file || !thumbnail || !body.trim() || busy || preparing}
          className="button-primary rounded-lg px-4 py-2 text-sm font-semibold">
          {busy ? "올리는 중…" : "올리기"}
        </button>
      </header>
      {file && preview ? (
        <video key={preview} src={preview} controls playsInline preload="metadata" className="max-h-[420px] w-full rounded-2xl bg-black" />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-line bg-surface text-sm text-muted">
          {preparing ? "영상 확인 중…" : "공유하고 싶은 등반 영상"}
        </div>
      )}
      <label className={`mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-line px-4 py-3 text-sm font-semibold ${busy || draft || preparing ? "opacity-40" : ""}`}>
        {file ? "영상 다시 선택" : "영상 선택"}
        <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only"
          disabled={busy || !!draft || preparing} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <p className="mt-2 text-xs text-faint">MP4 · MOV · WebM / 최대 50MB</p>
      <label className="mt-6 block text-sm font-semibold" htmlFor="video-body">영상 이야기</label>
      <textarea id="video-body" value={body} maxLength={POST_BODY_MAX} disabled={busy || !!draft}
        onChange={(e) => setBody(e.target.value)} rows={5} placeholder="완등 자랑, 등반 이야기, 궁금한 점을 자유롭게 남겨주세요."
        className="mt-2 w-full resize-none rounded-xl border border-line bg-surface p-3 text-[16px] leading-relaxed focus:border-accent focus:outline-none" />
      <p className="mt-1 text-right text-xs text-faint">{body.length} / {POST_BODY_MAX}</p>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
    </main>
  );
}
