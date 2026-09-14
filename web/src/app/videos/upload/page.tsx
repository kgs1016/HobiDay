"use client";
import { requireParticipationProfile, handleParticipationError } from "@/lib/participation";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryId } from "@/lib/queryId";
import EditVideo from "@/components/EditVideo";
import BackButton from "@/components/BackButton";
import UploadStatus from "@/components/UploadStatus";
import { POST_BODY_MAX } from "@/lib/community";
import { currentUser, hasSupabase } from "@/lib/supabase";
import { clearVideoDraft, readVideoDraft, saveVideoDraft } from "@/lib/videoDraft";
import { imageThumbnail, publishFeedbackVideo, uploadFeedbackMedia, videoFileError, videoThumbnail, type VideoUploadPlan } from "@/lib/feedbackVideo";

const FEED = "/videos";
export default function UploadVideo() {
  const id = useQueryId();
  if (id === undefined) return <main className="pt-24 text-center text-sm text-muted">불러오는 중…</main>;
  return id ? <EditVideo key={id} id={id} /> : <NewVideo />;
}

function NewVideo() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [thumbPreview, setThumbPreview] = useState("");
  const [body, setBody] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [owner, setOwner] = useState("");
  const [plan, setPlan] = useState<VideoUploadPlan>();
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const selection = useRef(0);
  const submitting = useRef(false);
  const completed = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const locked = busy || preparing || !!plan || !ready;

  useEffect(() => {
    let alive = true;
    const activeSelection = selection;
    void (async () => {
      try {
        const user = await currentUser({ throwOnError: true });
        if (!alive || !user) return;
        setOwner(user.id);
        const draft = await readVideoDraft(user.id);
        if (!alive || !draft) return;
        setBody(draft.body); setPlan(draft.plan);
        if (draft.file && draft.thumbnail) {
          setFile(draft.file); setThumbnail(draft.thumbnail);
          setPreview(URL.createObjectURL(draft.file)); setThumbPreview(URL.createObjectURL(draft.thumbnail));
        }
      } catch { if (alive) setStorageError(true); }
      finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; activeSelection.current++; controller.current?.abort(); };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (thumbPreview) URL.revokeObjectURL(thumbPreview); }, [thumbPreview]);
  useEffect(() => {
    if (!ready || !owner || busy || completed.current) return;
    const timer = setTimeout(() => { void saveVideoDraft(owner, { body }).catch(() => setStorageError(true)); }, 500);
    return () => clearTimeout(timer);
  }, [body, owner, ready, busy]);

  const choose = async (next: File | undefined, kind: "video" | "thumbnail") => {
    if (!next || locked) return;
    const version = ++selection.current;
    setPreparing(true); setError("");
    try {
      if (kind === "video") {
        const invalid = videoFileError(next);
        if (invalid) throw new Error(invalid);
        setFile(next); setThumbnail(null); setThumbPreview(""); setPreview(URL.createObjectURL(next));
      }
      const thumb = await (kind === "video" ? videoThumbnail(next) : imageThumbnail(next));
      if (version !== selection.current) return;
      setThumbnail(thumb); setThumbPreview(URL.createObjectURL(thumb));
      const selectedFile = kind === "video" ? next : file;
      if (owner && selectedFile) await saveVideoDraft(owner, { body, plan: undefined }, { file: selectedFile, thumbnail: thumb })
        .catch(() => setStorageError(true));
    } catch (e) {
      if (version === selection.current) setError(e instanceof Error ? e.message : "파일을 확인하지 못했어요");
    } finally { if (version === selection.current) setPreparing(false); }
  };

  const submit = async () => {
    if (!file || !thumbnail || !body.trim() || submitting.current) return;
    if (!hasSupabase()) return setError("로그인 후 영상을 올릴 수 있어요");
    submitting.current = true;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setStage("회원 정보 확인 중");
    try {
      if (!(await requireParticipationProfile(router, undefined, abort.signal))) return;
      if (abort.signal.aborted) throw new DOMException("취소됐어요", "AbortError");
      let mediaCheckpointed = !!plan;
      const media = await uploadFeedbackMedia(file, thumbnail, {
        plan, signal: abort.signal, onProgress: setProgress, onStage: setStage,
        onCheckpoint: async next => {
          setPlan({ ...next });
          const userId = next.video.split("/")[0];
          await saveVideoDraft(userId, { body: body.trim(), plan: next }, !mediaCheckpointed ? { file, thumbnail } : undefined)
            .then(() => { mediaCheckpointed = true; }).catch(() => setStorageError(true));
        },
      });
      if (abort.signal.aborted) throw new DOMException("취소됐어요", "AbortError");
      setStage("게시하는 중");
      const id = await publishFeedbackVideo(media, body.trim());
      completed.current = true;
      await clearVideoDraft(media.video.split("/")[0]).catch(() => {});
      router.replace(`/videos/post?id=${id}`);
    } catch (e) {
      if (abort.signal.aborted) setError("업로드를 멈췄어요. 다시 누르면 이어서 올려요");
      else if (!handleParticipationError(e instanceof Error ? e.message : undefined, router))
        setError(e instanceof Error ? e.message : "영상을 올리지 못했어요");
    } finally { submitting.current = false; setBusy(false); controller.current = null; }
  };

  const discard = async () => {
    if (busy || !confirm("임시 저장한 영상을 지우고 다시 선택할까요?")) return;
    if (owner) await clearVideoDraft(owner).catch(() => {});
    setPlan(undefined); setFile(null); setThumbnail(null); setPreview(""); setThumbPreview(""); setError(""); setProgress(0);
  };

  return <main className="px-4 pb-10">
    <header className="flex items-center gap-2 pt-4 pb-4">
      {!busy && <BackButton fallback={FEED} />}
      <h1 className="flex-1 text-[18px] font-bold">영상 올리기</h1>
      <button onClick={submit} disabled={!ready || !file || !thumbnail || !body.trim() || busy || preparing}
        className="button-primary rounded-lg px-4 py-2 text-sm font-semibold">
        {busy ? "올리는 중…" : plan ? "다시 시도" : "올리기"}</button>
    </header>
    {file && preview ? <video key={preview} src={preview} poster={thumbPreview} controls playsInline preload="metadata" className="max-h-[420px] w-full rounded-2xl bg-black" />
      : <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-dashed border-line bg-surface text-sm text-muted">
        {!ready ? "임시 저장 확인 중…" : preparing ? "영상 확인 중…" : "공유하고 싶은 등반 영상"}</div>}
    <label className={`mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-line px-4 py-3 text-sm font-semibold ${locked ? "opacity-40" : ""}`}>
      {file ? "영상 다시 선택" : "영상 선택"}
      <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" disabled={locked}
        onChange={e => { void choose(e.target.files?.[0], "video"); e.target.value = ""; }} />
    </label>
    <p className="mt-2 text-xs text-faint">MP4 · MOV · WebM / 최대 50MB</p>
    {file && <label className={`mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold ${locked ? "opacity-40" : ""}`}>
      썸네일 사진 선택<input aria-label="썸네일 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={locked}
        onChange={e => { void choose(e.target.files?.[0], "thumbnail"); e.target.value = ""; }} /></label>}
    <label className="mt-6 block text-sm font-semibold" htmlFor="video-body">영상 이야기</label>
    <textarea id="video-body" value={body} maxLength={POST_BODY_MAX} disabled={busy || !!plan || !ready}
      onChange={e => setBody(e.target.value)} rows={5} placeholder="완등 자랑, 등반 이야기, 궁금한 점을 자유롭게 남겨주세요."
      className="mt-2 w-full resize-none rounded-xl border border-line bg-surface p-3 text-[16px] leading-relaxed focus:border-accent focus:outline-none" />
    <p className="mt-1 text-right text-xs text-faint">{body.length} / {POST_BODY_MAX}</p>
    {busy && <UploadStatus stage={stage} progress={progress} onPause={stage !== "게시하는 중" ? () => controller.current?.abort() : undefined} />}
    {preparing && <p role="status" className="mt-4 text-sm text-muted">파일 확인 중…</p>}
    {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
    {storageError && <p className="mt-3 text-xs text-muted">임시 저장을 사용할 수 없어요. 이 화면에서 업로드를 완료해주세요.</p>}
    {plan && !busy && <button type="button" onClick={() => void discard()} className="mt-4 min-h-11 text-sm font-semibold text-muted underline">다른 영상으로 시작</button>}
  </main>;
}
