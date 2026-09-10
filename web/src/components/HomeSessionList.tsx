import Link from "next/link";
import SessionCard from "@/components/SessionCard";
import LoadErrorNotice from "@/components/LoadErrorNotice";
import { HoldIllust } from "@/components/illustrations";
import type { Session } from "@/lib/mock";

export default function HomeSessionList({ sessions, shown, error, loading, photoUrls, onRetry, onReset }: {
  sessions: Session[];
  shown: Session[];
  error: boolean;
  loading: boolean;
  photoUrls: Record<string, string>;
  onRetry: () => void;
  onReset: () => void;
}) {
  return <>
    {error && <LoadErrorNotice message="모임을 불러오지 못했어요" loading={loading} onRetry={onRetry} hasPrevious={sessions.length > 0} />}
    {loading && !error && !sessions.length && <p role="status" className="py-16 text-center text-sm text-muted">모임 불러오는 중…</p>}
    {!error && !loading && sessions.length === 0 ? (
      <div className="flex flex-col items-center py-16 text-center">
        <HoldIllust size={68} />
        <p className="mt-4 text-[15px] font-semibold">아직 열린 모임이 없어요</p>
        <Link href="/session/new" className="button-primary mt-4 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold">모임 만들기</Link>
      </div>
    ) : !error && !loading && shown.length === 0 ? (
      <div className="py-16 text-center">
        <p className="text-[14px] font-medium">조건에 맞는 모임이 없어요</p>
        <button type="button" onClick={onReset} className="mt-3 text-[13px] font-medium text-accent-strong">전체 모임 보기</button>
      </div>
    ) : shown.length > 0 ? (
      <div className="flex flex-col divide-y divide-line pb-6" aria-label="모임 목록">
        {shown.map(s => <SessionCard key={s.id} session={s}
          hostPhotoUrl={s.host?.photo ? photoUrls[s.host.photo] : undefined} gymPhotoUrl={s.gymThumb} />)}
      </div>
    ) : null}
  </>;
}
