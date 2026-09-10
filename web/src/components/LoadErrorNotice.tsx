export default function LoadErrorNotice({ message, loading, onRetry, hasPrevious = false }: {
  message: string;
  loading: boolean;
  onRetry: () => void;
  hasPrevious?: boolean;
}) {
  return <div role="alert" className="my-4 rounded-xl bg-surface2 px-4 py-5 text-center">
    <p className="text-[14px] font-semibold">{message}</p>
    {hasPrevious && <p className="mt-1.5 text-[12px] text-muted">이전에 불러온 목록을 표시하고 있어요</p>}
    <button type="button" onClick={onRetry} disabled={loading}
      className="button-secondary mt-3 min-h-11 rounded-lg px-5 text-[13px] font-semibold">
      {loading ? "다시 불러오는 중…" : "다시 시도"}
    </button>
  </div>;
}
