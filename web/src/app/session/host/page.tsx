"use client";

/* 예전 주소 — /session/host?id=<모임>[&u=<사람>][&from=chat]
   이미 폰에 깔린 앱이 이 주소를 부르고 있어서 남긴다. 새 화면은
   /user?id=<사람>&s=<모임> 이고, 여기서는 같은 화면을 그대로 그린다. */

import { useQueryId, useQueryParam } from "@/lib/queryId";
import UserProfile from "@/components/UserProfile";

export default function SessionHost() {
  const id = useQueryId();
  const u = useQueryParam("u");
  const from = useQueryParam("from");
  if (id === undefined || u === undefined || from === undefined)
    return <main className="px-4 pt-24 text-center text-[13.5px] text-faint">불러오는 중…</main>;
  return <UserProfile userId={u} sessionId={id} matchId={null} from={from} />;
}
