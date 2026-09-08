"use client";

/* 채팅 보내기 시트 — 사람 찾기 목록과 프로필 화면이 같이 쓴다.
   한 줄 메시지를 붙이면 받는 쪽이 맥락을 보고 판단한다. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { notifyPush } from "@/lib/nativePush";
import { fetchMyProfileDb, hasSupabase, sendRequest } from "@/lib/supabase";
import { isProfileComplete } from "@/lib/profileGate";

/* already 는 두 경우뿐이다 — 답을 기다리는 중이거나, 이미 채팅이
   열려 있거나. 거절당한 상대에게는 다시 보낼 수 있다(request_send 가
   거절된 행을 치운다). */
const REQ_ERRORS: Record<string, string> = {
  self: "나에게는 보낼 수 없어요",
  not_public: "상대가 프로필을 내렸어요",
  no_profile: "먼저 내 프로필을 만들어주세요",
};

export default function ChatRequestSheet({
  target,
  onClose,
  onSent,
}: {
  target: { id: string; nickname: string; homeGym?: string | null };
  onClose: () => void;
  /** 보내진 뒤 — "보냈어요" 상태로 바꾸는 데 쓴다 */
  onSent?: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const send = async () => {
    if (busy) return;
    setBusy(true);
    if (hasSupabase() && !isProfileComplete(await fetchMyProfileDb())) {
      setBusy(false);
      alert("채팅을 보내려면 대표 사진과 구력을 입력해주세요. 사람 찾기 공개는 선택입니다.");
      router.push("/profile/new");
      return;
    }
    const r = await sendRequest(target.id, msg);
    setBusy(false);

    if (r.error === "already")
      return alert(
        r.status === "accepted"
          ? "이미 채팅이 열려 있어요"
          : "이미 보낸 채팅 신청이 답을 기다리고 있어요"
      );
    if (r.error) return alert(REQ_ERRORS[r.error] ?? `실패: ${r.error}`);

    notifyPush(
      target.id,
      "💬 새 채팅 신청이 왔어요",
      msg.trim() || "신청함에서 프로필을 확인해보세요",
      "/inbox"
    );
    onSent?.();
    onClose();
    alert(`${target.nickname}님에게 채팅을 보냈어요!\n수락하면 채팅이 열려요.`);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/50" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-md rounded-t-2xl bg-surface p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[16.5px] font-bold">{target.nickname}님에게 채팅 보내기</p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value.slice(0, 200))}
          rows={3}
          placeholder={
            target.homeGym
              ? `예: 같은 ${target.homeGym} 다니네요! 주말에 같이 타요`
              : "예: 주말에 같이 타요"
          }
          /* iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 */
          className="mt-3 w-full resize-none rounded-lg bg-surface2 px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:outline-none"
        />
        <p className="mt-1 text-right text-[11.5px] text-faint">{msg.length}/200</p>
        <button
          disabled={busy}
          onClick={send}
          className="button-primary mt-2 w-full rounded-xl py-3.5 text-[15px] font-semibold"
        >
          {busy ? "보내는 중…" : "채팅 보내기"}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full py-2 text-[13px] font-medium text-muted"
        >
          취소
        </button>
      </div>
    </div>
  );
}
