import ClimbingShoe from "@/components/ClimbingShoe";
import ShoeCriteria from "@/components/ShoeCriteria";
import { SHOE_STAGES, type PublicShoeAchievement } from "@/lib/shoeProgress";

/** 목록의 프로필 버튼 안에 넣는다. 누르면 성취를 포함한 프로필이 열린다. */
export function ShoeBadge({ achievement }: { achievement?: PublicShoeAchievement }) {
  if (!achievement) return null;
  const stage = SHOE_STAGES.find(stage => stage.id === achievement.stage)!;
  return <span title={`${stage.name} 암벽화 · 완등 성취`} className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white">
    <ClimbingShoe color={stage.id} className="h-6 w-6" />
  </span>;
}

export default function PublicShoe({ achievement }: { achievement?: PublicShoeAchievement }) {
  if (!achievement) return <section className="mt-4 border-t border-line pt-4">
    <h2 className="text-[13px] font-semibold">완등 성취</h2>
    <p className="mt-2 text-[12px] text-muted">성취 정보를 불러오지 못했어요</p>
  </section>;
  const stage = SHOE_STAGES.find(stage => stage.id === achievement.stage)!;
  return <section className="mt-4 border-t border-line pt-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-semibold">완등 성취</h2>
      <span className="text-[11px] text-muted">본인이 기록한 완등 기준</span>
    </div>
    <div className="mt-2 flex items-center gap-3">
      <ClimbingShoe color={stage.id} className="h-20 w-20 shrink-0 bg-white" />
      <div className="min-w-0">
        <p className="text-[17px] font-bold" style={{ color: stage.ink }}>
          {stage.name} 암벽화
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {stage.minV === null ? "시작 단계" : `획득 기준 · V${stage.minV} 이상 ${stage.required}개`}
        </p>
        <p className="mt-1 text-[12px] text-muted">누적 완등 <b className="font-semibold tabular-nums text-ink">{achievement.total.toLocaleString()}개</b></p>
      </div>
    </div>
    <ShoeCriteria current={stage.id} />
  </section>;
}
