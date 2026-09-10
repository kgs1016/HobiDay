import Link from "next/link";
import ClimbingShoe from "@/components/ClimbingShoe";
import ShoeCriteria from "@/components/ShoeCriteria";
import { PlusIcon } from "@/components/icons";
import { shoeProgress, type ClimbingProgress } from "@/lib/shoeProgress";

/** 실제 성취와 최초 시작 설정을 구분한다. 등반 수준 필드와는 별개다. */
export default function ShoeAchievement({ progress, error = "", onRetry, onStart, onReset }: {
  progress: ClimbingProgress | null;
  error?: string;
  onRetry?: () => void;
  onStart?: () => void;
  onReset?: () => void;
}) {
  const result = progress ? shoeProgress(progress) : null;
  const current = result?.current;
  const next = result?.starting ? result.current : result?.next;

  return (
    <section className="border-t border-line px-4 pb-1 pt-5" aria-labelledby="profile-shoe-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="profile-shoe-title" className="text-[15px] font-semibold">내 암벽화</h2>
        <span className="text-[12px] text-muted">최근 3개월 기준</span>
      </div>

      {error ? <div role="alert" className="py-8 text-center">
        <p className="text-sm text-muted">{error}</p>
        <button type="button" onClick={onRetry} className="mt-2 min-h-11 px-3 text-sm font-semibold text-accent-strong">다시 불러오기</button>
      </div> : !current || !progress ? <p role="status" className="py-12 text-center text-sm text-faint">기록 불러오는 중…</p> : <>
        <div className="grid grid-cols-[minmax(0,144px)_1fr] items-center gap-3 py-3">
          <ClimbingShoe color={current.id} className="w-full bg-white" />
          <div className="min-w-0">
            <p className="text-[22px] font-bold tracking-tight" style={{ color: current.ink }}>{current.name} 암벽화</p>
            {result?.starting && <span className="mt-1 inline-block rounded-md bg-surface2 px-2 py-1 text-[11px] font-medium text-muted">시작 설정</span>}
            <p className="mt-2 text-[11px] text-muted">최근 3개월 성취 점수</p>
            <p className="mt-0.5 text-[20px] font-bold tabular-nums">{result!.points.toLocaleString()}<span className="ml-1 text-[12px] font-medium">점</span></p>
            <p className="mt-3 text-[12px] text-muted">누적 완등 <strong className="ml-1 text-[19px] font-bold tabular-nums text-ink">{progress.total.toLocaleString()}<span className="ml-0.5 text-[12px] font-medium">개</span></strong></p>
          </div>
        </div>

        {progress.can_set_start && onStart && <button type="button" onClick={onStart}
          className="button-secondary mb-3 min-h-12 w-full rounded-xl text-[14px] font-semibold">시작 암벽화 설정</button>}
        {progress.starting_shoe && <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[12px] text-muted">3개월 후부터 최근 완등 기록에 따라 바뀌어요.</p>
          {progress.can_reset_start && onReset && <button type="button" onClick={onReset}
            className="min-h-11 shrink-0 text-[12px] font-semibold text-accent-strong underline underline-offset-4">시작 색 초기화</button>}
        </div>}

        <div className="rounded-xl bg-surface2 px-4 py-3.5">
          {next ? <>
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <p className="font-semibold">{result?.starting ? "기록으로 유지" : "다음"} · {next.name} 암벽화</p>
              <p className="shrink-0 text-[11px] tabular-nums text-muted">{Math.min(result!.points, next.points).toLocaleString()} / {next.points.toLocaleString()}점</p>
            </div>
            <progress aria-label={`${next.name} 암벽화 ${result?.starting ? "유지" : "승급"}에 필요한 성취 점수`} value={Math.min(result!.points, next.points)} max={next.points}
              className="mt-2.5 block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-accent-strong [&::-moz-progress-bar]:bg-accent-strong" />
            <p className="mt-2 text-[12px] text-muted">H{next.minLevel} 이상 완등 {Math.min(next.count, next.required)}/{next.required}개 {next.count >= next.required ? "✓" : ""}</p>
            <p className="mt-1 text-[11px] text-muted">점수와 완등 조건을 모두 채우면 {result?.starting ? "기록 단계로 전환" : "승급"}</p>
          </> : <>
            <p className="text-[13px] font-semibold">최고 단계 달성</p>
            <p className="mt-1 text-[12px] text-muted">현재 3개월 기록으로 달성한 단계</p>
          </>}
        </div>

        {!!progress.undated_total && <p className="mt-3 text-[11px] leading-relaxed text-muted">날짜 없는 기록 {progress.undated_total}개 · 완등 날짜를 입력하면 해당 기간의 성취에 반영됩니다.</p>}

        <Link href="/me/ascents" className="button-primary mt-3 flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold">
          <PlusIcon size={17} />완등 기록하기
        </Link>
      </>}

      <ShoeCriteria current={current?.id} />
    </section>
  );
}
