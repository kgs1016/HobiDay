export default function UploadStatus({ stage, progress, onPause }: { stage: string; progress: number; onPause?: () => void }) {
  return <div role="status" aria-live="polite" className="mt-4 rounded-xl bg-surface2 p-4">
    <div className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span>{stage}{stage === "영상 올리는 중" ? ` ${progress}%` : "…"}</span>
      {onPause && <button type="button" onClick={onPause} className="min-h-11 px-2 text-muted underline">잠시 멈추기</button>}
    </div>
    {stage === "영상 올리는 중" && <progress aria-label="영상 업로드 진행률" max={100} value={progress} className="mt-2 h-2 w-full accent-current" />}
  </div>;
}
