"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ClimbingShoe from "@/components/ClimbingShoe";
import { resetStartingShoe, setStartingShoe } from "@/lib/climbingAscents";
import { SHOE_STAGES, type ClimbingProgress, type ShoeColorId } from "@/lib/shoeProgress";

/** 가입 마지막 단계와 기존 회원의 설정 창이 같은 선택·저장 규칙을 쓴다. */
export default function StartingShoePicker({ onboarding = false, reset = false, onSkip, onSaved, onBusyChange }: {
  onboarding?: boolean;
  reset?: boolean;
  onSkip: () => void;
  onSaved: (progress: ClimbingProgress) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const submitting = useRef(false);
  const [selected, setSelected] = useState<ShoeColorId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stage = SHOE_STAGES.find(item => item.id === selected);

  const save = async () => {
    if (!selected || submitting.current) return;
    submitting.current = true;
    setBusy(true); onBusyChange?.(true); setError("");
    try {
      const progress = await (reset ? resetStartingShoe(selected) : setStartingShoe(selected));
      onSaved(progress);
    } catch (e) {
      setError(e instanceof Error ? e.message : "설정하지 못했어요");
      submitting.current = false;
      setBusy(false); onBusyChange?.(false);
    }
  };

  return <>
    {onboarding && <div className="py-3 text-center">
      <ClimbingShoe color={selected ?? "white"} className="mx-auto h-40 w-40 bg-white" />
      <p className="text-[21px] font-bold" style={stage ? { color: stage.ink } : undefined}>
        {stage ? `${stage.name} 암벽화` : "나의 시작 암벽화"}
      </p>
    </div>}
    <div className="mt-4 grid grid-cols-3 gap-2" aria-label="시작 색 선택">
      {SHOE_STAGES.map(item => <button key={item.id} type="button" disabled={busy}
        aria-label={item.name} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}
        className={`flex items-center justify-center rounded-xl border text-[13px] font-semibold ${onboarding ? "min-h-12 gap-2 px-2 py-2" : "min-h-20 flex-col px-2 py-1.5"} ${selected === item.id ? "border-action bg-surface2" : "border-line bg-surface"}`}>
        {onboarding ? <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: item.base }} />
          : <ClimbingShoe color={item.id} className="h-14 w-14" />}
        {item.name}
      </button>)}
    </div>
    <p aria-live="polite" className="mt-3 min-h-9 text-center text-[12px] text-muted">
      {stage ? stage.minLevel ? `유지 기준 H${stage.minLevel} 이상 ${stage.required}개 · ${stage.points.toLocaleString()}점` : "기록과 함께 시작하는 흰색 암벽화" : "평소 완등하는 난이도를 참고해 선택해주세요"}
    </p>
    {onboarding && <div className="mb-4 text-center">
      {busy ? <span className="text-[13px] font-semibold text-ink">전체 단계 기준 보기</span> :
        <Link href={`/me/grades${selected ? `?stage=${selected}` : ""}`} className="inline-flex min-h-11 items-center text-[13px] font-semibold text-ink underline underline-offset-4">전체 단계 기준 보기</Link>}
    </div>}
    {error && <p role="alert" className="mb-3 text-[13px] text-danger">{error}</p>}
    <button type="button" onClick={save} disabled={!selected || busy} className="button-primary min-h-12 w-full rounded-xl text-[14px] font-semibold">
      {busy ? "설정하는 중…" : stage ? reset ? "이 색으로 다시 시작하기" : "이 색으로 시작하기" : "색을 선택해주세요"}
    </button>
    <button type="button" onClick={onSkip} disabled={busy} className="mt-1 min-h-11 w-full text-[13px] text-muted">{reset ? "취소" : "나중에 설정"}</button>
  </>;
}
