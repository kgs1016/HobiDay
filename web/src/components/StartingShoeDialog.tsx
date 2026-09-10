"use client";

import { useEffect, useRef, useState } from "react";
import StartingShoePicker from "@/components/StartingShoePicker";
import { type ClimbingProgress } from "@/lib/shoeProgress";

export default function StartingShoeDialog({ reset = false, onClose, onSaved }: {
  reset?: boolean;
  onClose: () => void;
  onSaved: (progress: ClimbingProgress) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} aria-labelledby="starting-shoe-title" aria-describedby="starting-shoe-terms"
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 text-ink backdrop:bg-black/40">
    <h2 id="starting-shoe-title" className="text-[18px] font-bold">{reset ? "시작 암벽화 다시 고르기" : "시작 암벽화 설정"}</h2>
    <p id="starting-shoe-terms" className="mt-2 text-[12px] leading-relaxed text-muted">
      최근 완등 기록에 따라 바뀌어요
    </p>
    {reset && <p className="mt-2 text-[12px] leading-relaxed text-muted">초기화는 한 번 가능하며, 새로 선택한 시점부터 기록을 집계해요. 이전 완등 내역은 남아 있어요.</p>}
    <StartingShoePicker reset={reset} onSkip={onClose} onSaved={onSaved} onBusyChange={setBusy} />
  </dialog>;
}
