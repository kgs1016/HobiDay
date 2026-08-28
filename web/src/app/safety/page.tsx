"use client";

/* 안전 설정 — 차단 목록 확인·해제.
   차단은 사람 찾기·채팅·관심·모임 전부에서 양방향으로 막힌다. */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import {
  currentUser,
  fetchMyBlocks,
  hasSupabase,
  unblockUser,
  type BlockedPerson,
} from "@/lib/supabase";

export default function Safety() {
  const router = useRouter();
  const [blocks, setBlocks] = useState<BlockedPerson[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBlocks((await fetchMyBlocks()) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) return setBlocks([]);
      if (!(await currentUser())) return router.replace("/login");
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unblock = async (b: BlockedPerson) => {
    if (!confirm(`${b.nickname}님 차단을 해제할까요?\n다시 서로 보이게 돼요.`))
      return;
    setBusy(b.blocked_id);
    const r = await unblockUser(b.blocked_id);
    setBusy(null);
    if (r.error) return alert(`해제하지 못했어요: ${r.error}`);
    await load();
  };

  return (
    <main className="px-4">
      <header className="flex items-center gap-2 pt-4 pb-4">
        <BackButton fallback="/me" />
        <h1 className="text-[18px] font-bold tracking-tight">안전 설정</h1>
      </header>

      <section>
        <p className="text-[15px] font-bold">차단한 사람</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          차단하면 사람 찾기·채팅·관심·모임 어디에서도 서로 보이지 않아요.
          상대에게는 알려지지 않아요.
        </p>
      </section>

      {blocks === null ? (
        <p className="pt-12 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : blocks.length === 0 ? (
        <p className="px-6 pt-12 text-center text-[13px] leading-relaxed text-muted">
          차단한 사람이 없어요.
          <br />
          불편한 일이 있으면 프로필이나 채팅에서 신고해주세요.
        </p>
      ) : (
        <div className="mt-4 flex flex-col divide-y divide-line">
          {blocks.map((b) => (
            <div key={b.blocked_id} className="flex items-center gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">{b.nickname}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">
                  {b.age} · {b.home_gym}
                </p>
              </div>
              <button
                onClick={() => unblock(b)}
                disabled={busy === b.blocked_id}
                className="shrink-0 rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-muted disabled:opacity-50"
              >
                {busy === b.blocked_id ? "해제 중…" : "차단 해제"}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-8 px-2 text-center text-[11.5px] leading-relaxed text-faint">
        신고가 접수되면 24시간 안에 확인하고 조치해요.
      </p>
    </main>
  );
}
