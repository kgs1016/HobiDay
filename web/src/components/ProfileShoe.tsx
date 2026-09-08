"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ClimbingShoe from "@/components/ClimbingShoe";
import { ChevronRightIcon } from "@/components/icons";
import { fetchClimbingProgress } from "@/lib/climbingAscents";
import { SHOE_STAGES, shoeProgress, type ClimbingProgress } from "@/lib/shoeProgress";

export default function ProfileShoe() {
  const [progress, setProgress] = useState<ClimbingProgress | null>(null);
  const [error, setError] = useState("");
  const [showCriteria, setShowCriteria] = useState(false);
  const load = async () => {
    try { const data = await fetchClimbingProgress(); setProgress(data); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "기록을 불러오지 못했어요"); }
  };
  useEffect(() => {
    let active = true;
    fetchClimbingProgress().then(
      data => { if (active) setProgress(data); },
      () => { if (active) setError("완등 기록을 불러오지 못했어요"); },
    );
    return () => { active = false; };
  }, []);

  const result = progress ? shoeProgress(progress) : null;
  const current = result?.current;
  const next = result?.next;

  return (
    <section className="border-t border-line px-4 pb-6 pt-5" aria-labelledby="profile-shoe-title">
      <div className="flex items-center justify-between">
        <h2 id="profile-shoe-title" className="text-[15px] font-semibold">내 암벽화</h2>
        <span className="text-[12px] text-faint">완등 기록 기준</span>
      </div>
      {error ? (
        <div role="alert" className="py-8 text-center">
          <p className="text-sm text-muted">{error}</p>
          <button onClick={load} className="mt-2 px-3 py-2 text-sm font-semibold text-accent-pressed">다시 불러오기</button>
        </div>
      ) : !current ? (
        <p role="status" className="py-12 text-center text-sm text-faint">기록 불러오는 중…</p>
      ) : (
        <>
          <ClimbingShoe color={current.id} className="mx-auto mt-2 w-full max-w-[240px] bg-white" />
          <div className="text-center">
            <p className="text-[18px] font-bold" style={{ color: current.ink }}>{current.name}</p>
            <p className="mt-1 text-[12px] text-muted">
              {current.minV === null ? "첫 단계" : `V${current.minV} 이상 ${current.count}개 완등`}
            </p>
          </div>
          <div className="mt-5 rounded-xl bg-surface2 px-4 py-3.5">
            {next ? (
              <>
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <p className="font-semibold">{next.name}까지 {next.required - next.count}개</p>
                  <p className="text-muted"><span className="font-semibold text-ink">{next.count}</span> / {next.required}</p>
                </div>
                <progress aria-label={`${next.name} 단계 완등 진행률`} value={next.count} max={next.required}
                  className="mt-2 block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent" />
                <p className="mt-2 text-[12px] text-muted">V{next.minV} 이상 · 서로 다른 문제</p>
              </>
            ) : <p className="text-[13px] font-semibold">최고 단계 달성 · 완등 기록은 계속</p>}
          </div>
          <Link href="/me/ascents" className="mt-2 flex min-h-12 items-center justify-between text-[13px]">
            <span>전체 완등 <b className="ml-1 font-semibold">{progress!.total}개</b></span>
            <span className="flex items-center gap-1 font-semibold text-accent-pressed">완등 기록 <ChevronRightIcon size={14} /></span>
          </Link>
        </>
      )}

      <button type="button" aria-expanded={showCriteria} aria-controls="shoe-criteria"
        onClick={() => setShowCriteria(v => !v)}
        className="flex min-h-12 w-full items-center justify-between border-t border-line text-[13px] font-semibold">
        단계 기준표
        <ChevronRightIcon size={15} className={`text-faint transition-transform ${showCriteria ? "rotate-90" : ""}`} />
      </button>
      <div id="shoe-criteria" hidden={!showCriteria}>
        <table className="w-full table-fixed text-left text-[12px]">
          <caption className="sr-only">암벽화 색상별 난이도와 필요 완등 개수</caption>
          <thead className="text-faint"><tr>
            <th scope="col" className="w-[32%] py-2 font-normal">단계</th>
            <th scope="col" className="w-[40%] py-2 font-normal">난이도</th>
            <th scope="col" className="py-2 text-right font-normal">완등</th>
          </tr></thead>
          <tbody>
            {SHOE_STAGES.map(stage => (
              <tr key={stage.id} aria-current={current?.id === stage.id ? "step" : undefined}
                className={`border-t border-line ${current?.id === stage.id ? "bg-surface2 font-semibold" : ""}`}>
                <th scope="row" className="py-3 font-medium">
                  <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: stage.base }} />{stage.name}</span>
                </th>
                <td className="py-3">{stage.minV === null ? "시작 단계" : `V${stage.minV} 이상`}</td>
                <td className="py-3 text-right">{stage.required === 0 ? "—" : `${stage.required}개`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-3 space-y-1 text-[11.5px] leading-relaxed text-muted">
          <li>같은 문제는 한 번 · 높은 난이도는 하위 조건에도 포함</li>
          <li>기간 제한 없이 누적 · 충족한 가장 높은 단계 적용</li>
          <li>직접 입력한 완등 기준 · 기록 수정·삭제 시 다시 계산</li>
        </ul>
      </div>
    </section>
  );
}
