"use client";

import { useEffect, useRef, useState } from "react";
import StartingShoePicker from "@/components/StartingShoePicker";
import { type ClimbingProgress } from "@/lib/shoeProgress";

export default function StartingShoeDialog({ onClose, onSaved }: {
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
    <h2 id="starting-shoe-title" className="text-[18px] font-bold">시작 암벽화 설정</h2>
    <p id="starting-shoe-terms" className="mt-2 text-[12px] leading-relaxed text-muted">처음 한 번 설정할 수 있어요.<br />3개월 후부터는 최근 완등 기록에 따라 색이 달라져요.</p>
    <StartingShoePicker onSkip={onClose} onSaved={onSaved} onBusyChange={setBusy} />
  </dialog>;
}
