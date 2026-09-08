import Link from "next/link";
import ClimbingShoe from "@/components/ClimbingShoe";
import ShoeCriteria from "@/components/ShoeCriteria";
import { PlusIcon } from "@/components/icons";
import { shoeProgress, type ClimbingProgress } from "@/lib/shoeProgress";

/** 성취 표시는 등반 수준의 자기신고 값과 연결하지 않는다. */
export default function ShoeAchievement({ progress, error = "", onRetry }: {
  progress: ClimbingProgress | null;
  error?: string;
  onRetry?: () => void;
}) {
  const result = progress ? shoeProgress(progress) : null;
  const current = result?.current;
  const next = result?.next;

  return (
    <section className="border-t border-line px-4 pb-1 pt-5" aria-labelledby="profile-shoe-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="profile-shoe-title" className="text-[15px] font-semibold">내 암벽화</h2>
        <span className="text-[12px] text-muted">완등 기록으로 얻는 성취</span>
      </div>

      {error ? <div role="alert" className="py-8 text-center">
        <p className="text-sm text-muted">{error}</p>
        <button type="button" onClick={onRetry} className="mt-2 min-h-11 px-3 text-sm font-semibold text-accent-pressed">다시 불러오기</button>
      </div> : !current || !progress ? <p role="status" className="py-12 text-center text-sm text-faint">기록 불러오는 중…</p> : <>
        <div className="grid grid-cols-[minmax(0,144px)_1fr] items-center gap-3 py-3">
          <ClimbingShoe color={current.id} className="w-full bg-white" />
          <div className="min-w-0">
            <p className="text-[22px] font-bold tracking-tight" style={{ color: current.ink }}>{current.name} 암벽화</p>
            <p className="mt-2 text-[11px] text-muted">{current.minV === null ? "시작 단계" : "획득 기준"}</p>
            {current.minV !== null && <p className="mt-0.5 text-[12px] leading-relaxed text-ink">V{current.minV} 이상 · {current.required}개 완등</p>}
            <p className="mt-3 text-[12px] text-muted">누적 완등 <strong className="ml-1 text-[19px] font-bold tabular-nums text-ink">{progress.total.toLocaleString()}<span className="ml-0.5 text-[12px] font-medium">개</span></strong></p>
          </div>
        </div>

        <div className="rounded-xl bg-surface2 px-4 py-3.5">
          {next ? <>
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <p className="font-semibold">{next.name} 암벽화까지 {next.required - next.count}개</p>
              <p className="shrink-0 tabular-nums text-muted"><b className="font-semibold text-ink">{next.count}</b> / {next.required}</p>
            </div>
            <progress aria-label={`${next.name} 암벽화까지 V${next.minV} 이상 완등`} value={next.count} max={next.required}
              className="mt-2.5 block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-accent-strong [&::-moz-progress-bar]:bg-accent-strong" />
            <p className="mt-2 text-[12px] text-muted">V{next.minV} 이상 · 서로 다른 문제</p>
          </> : <>
            <p className="text-[13px] font-semibold">최고 단계 달성</p>
            <p className="mt-1 text-[12px] text-muted">새로운 완등은 누적 기록에 계속 추가</p>
          </>}
        </div>

        <Link href="/me/ascents" className="mt-3 flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-accent-strong px-4 text-[14px] font-semibold text-white active:brightness-95">
          <PlusIcon size={17} />완등 기록하기
        </Link>
      </>}

      <ShoeCriteria current={current?.id} />
    </section>
  );
}
