"use client";

/* 상대 프로필 — /user?id=<사람>[&s=<모임>][&m=<1:1 방>][&from=chat]
   id 는 사람 id 다 (모임 id 가 아니다). 화면은 UserProfile 하나다. */

import { useQueryId, useQueryParam } from "@/lib/queryId";
import UserProfile from "@/components/UserProfile";

export default function UserPage() {
  const id = useQueryId();
  const s = useQueryParam("s");
  const m = useQueryParam("m");
  const from = useQueryParam("from");
  const request = useQueryParam("request");
  // 첫 렌더는 주소를 아직 안 읽었다
  if (id === undefined || s === undefined || m === undefined || from === undefined || request === undefined)
    return <main className="px-4 pt-24 text-center text-[13.5px] text-faint">불러오는 중…</main>;
  return <UserProfile userId={id} sessionId={s} matchId={m} from={from} initialRequest={request === "1"} />;
}
