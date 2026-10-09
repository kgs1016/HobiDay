"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { currentUser, deleteAccount } from "@/lib/supabase";

/** Account deletion remains accessible while the rest of the service is paused. */
export default function DeleteAccount() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    let alive = true;
    void currentUser({ throwOnError: true }).then(user => { if (alive) setSignedIn(!!user); }).catch(() => { if (alive) setError("로그인 상태를 확인하지 못했어요. 다시 접속해주세요."); });
    return () => { alive = false; };
  }, []);
  const leave = async () => {
    if (busy || confirm.trim() !== "탈퇴") return;
    setBusy(true); setError("");
    try {
      const result = await deleteAccount();
      if (result.error) throw new Error(result.error);
      setDeleted(true);
    } catch {
      setError("탈퇴하지 못했어요. 다시 시도하거나 고객센터로 문의해주세요.");
    } finally { setBusy(false); }
  };
  return <main className="px-6 pt-16">
    <Link href="/" className="text-sm text-muted underline underline-offset-4">돌아가기</Link>
    <h1 className="mt-8 text-[23px] font-bold">회원 탈퇴</h1>
    {deleted ? <p className="mt-5 text-sm" role="status">탈퇴가 완료됐어요.</p> : signedIn === false ? <Link href="/login" className="button-primary mt-6 inline-block rounded-xl px-6 py-3">로그인</Link> : signedIn && <>
      <p className="mt-4 text-sm leading-relaxed text-muted">프로필과 사진·영상, 대화 및 모임 참여 정보가 삭제돼요. 탈퇴 후에는 되돌릴 수 없어요.</p>
      <label htmlFor="delete-confirm" className="mt-6 block text-sm">계속하려면 ‘탈퇴’를 입력해주세요.</label>
      <input id="delete-confirm" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} autoComplete="off" className="mt-3 w-full rounded-xl border border-line p-3 text-[16px]" />
      <button type="button" onClick={() => void leave()} disabled={busy || confirm.trim() !== "탈퇴"} className="mt-4 w-full rounded-xl border border-danger py-3 text-sm font-semibold text-danger disabled:opacity-40">{busy ? "처리 중…" : "탈퇴하기"}</button>
    </>}
    {error && <p className="mt-4 text-sm text-danger" role="alert">{error}</p>}
    <Link href="/support" className="mt-6 inline-block text-sm text-muted underline underline-offset-4">고객센터</Link>
  </main>;
}
