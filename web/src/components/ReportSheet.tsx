"use client";

/* 신고 시트 — 사람 찾기·채팅 어디서든 같은 화면을 쓴다.
   신고하면 차단까지 함께 걸린다(서버 처리). 두 번 누르게 하지 않고,
   신고해놓고 계속 보이는 상태도 만들지 않는다. */

import { useState } from "react";
import {
  REPORT_REASONS,
  reportUser,
  type ReportContext,
  type ReportReason,
} from "@/lib/supabase";

export default function ReportSheet({
  targetId,
  nickname,
  context = "profile",
  refId,
  onClose,
  onDone,
}: {
  targetId: string;
  nickname: string;
  context?: ReportContext;
  refId?: string;
  onClose: () => void;
  /** 신고가 접수된 뒤 — 목록에서 빼는 등 화면 갱신에 쓴다 */
  onDone?: () => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    const r = await reportUser(targetId, reason, detail, context, refId);
    setBusy(false);
    if (r.error) {
      alert(`신고를 접수하지 못했어요: ${r.error}`);
      return;
    }
    /* 같은 모임에 얽혀 있었다면 서버가 이미 갈라놨다. 신청비를 그
       자리에서 돌려주지 않는 건 신고 내용을 봐야 하기 때문이라, 그
       말을 안 하면 돈만 떼인 것처럼 보인다. */
    alert(
      `신고가 접수됐어요.\n${nickname}님은 차단되어 서로 보이지 않아요.` +
        (r.left_sessions
          ? `\n\n같이 가기로 한 모임 ${r.left_sessions}개에서도 빠졌어요.` +
            `\n신고 내용을 확인한 뒤 신청비를 돌려드릴게요.`
          : "") +
        `\n\n24시간 안에 확인하고 조치할게요.`
    );
    onDone?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[17px] font-extrabold">{nickname}님 신고하기</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          어떤 점이 문제였는지 알려주세요. 신고하면 <b className="text-ink">차단도
          함께</b> 되어 서로 보이지 않게 돼요.
        </p>

        <div className="mt-4 flex flex-col gap-1.5">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setReason(r.id)}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                reason === r.id
                  ? "border-accent bg-accent/10"
                  : "border-line bg-bg"
              }`}
            >
              <p className="text-[14px] font-bold">{r.label}</p>
              {r.hint && (
                <p className="mt-0.5 text-[12px] text-muted">{r.hint}</p>
              )}
            </button>
          ))}
        </div>

        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="자세한 내용을 적어주시면 확인에 도움이 돼요 (선택)"
          rows={3}
          /* iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 */
          className="mt-3 w-full resize-none rounded-xl border border-line bg-bg px-3.5 py-3 text-[16px] text-ink placeholder:text-muted/60"
        />

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-line py-3.5 text-[14px] font-bold disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={busy || !reason}
            className="flex-1 rounded-xl border border-danger py-3.5 text-[14px] font-bold text-danger disabled:opacity-40"
          >
            {busy ? "접수 중…" : "신고하고 차단"}
          </button>
        </div>
      </div>
    </div>
  );
}
