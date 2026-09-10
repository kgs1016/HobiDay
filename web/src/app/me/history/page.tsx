"use client";

/* 매칭 기록 — 성사돼서 끝난 모임만 모아 본다.
   홈 목록은 시작 3시간 뒤부터 감추고 모임 채팅도 확정된 방만 띄워서,
   끝나고 나면 "누구랑 어디 갔었지" 를 확인할 데가 없었다.
   호스트로 연 모임과 참가자로 간 모임이 같이 온다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import MatchHistoryCard from "@/components/MatchHistoryCard";
import { HoldIllust } from "@/components/illustrations";
import {
  currentUser,
  fetchMatchHistory,
  hasSupabase,
  signedPhotoUrls,
  type MatchRecord,
} from "@/lib/supabase";

export default function MatchHistory() {
  const [list, setList] = useState<MatchRecord[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) return setAuthed(false);
      const user = await currentUser();
      setAuthed(!!user);
      if (!user) return;

      const rows = (await fetchMatchHistory()) ?? [];
      setList(rows);

      // 사진은 비공개 버킷이라 서명 URL 이 필요하다. 카드마다 부르면
      // 요청이 기록 수만큼 나가니 한 번에 모아서 받는다.
      const paths = rows
        .flatMap((r) => r.people.map((m) => m.photo))
        .filter(Boolean) as string[];
      if (paths.length > 0) setPhotos(await signedPhotoUrls(paths));
    })();
  }, []);

  // 같은 사람을 여러 모임에서 만났으면 한 명으로 센다
  const metCount = new Set(
    (list ?? []).flatMap((r) => r.people.map((m) => m.id))
  ).size;

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-2">
        <BackButton fallback="/me/settings" />
        <h1 className="text-[18px] font-bold tracking-tight">함께한 모임</h1>
      </header>

      {authed === false ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 기록이 보여요</p>
          <Link
            href="/login"
            className="button-primary rounded-xl px-6 py-2.5 text-[14px] font-semibold"
          >
            로그인 하기
          </Link>
        </div>
      ) : list === null ? (
        <p className="pt-16 text-center text-[13.5px] text-faint">불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-1.5 text-center">
          <HoldIllust size={64} />
          <p className="mt-3 text-[15px] font-semibold">아직 끝난 모임이 없어요</p>
          <Link
            href="/"
            className="button-primary mt-3 rounded-xl px-6 py-2.5 text-[14px] font-semibold"
          >
            모임 보러 가기
          </Link>
        </div>
      ) : (
        <>
          <p className="pt-2 text-[12.5px] text-muted">
            함께한 모임 <b className="font-semibold text-ink">{list.length}</b>번 ·
            만난 사람 <b className="font-semibold text-ink">{metCount}</b>명
          </p>
          <div className="mt-1 flex flex-col divide-y divide-line">
            {list.map((r) => (
              <MatchHistoryCard key={r.id} r={r} photos={photos} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
