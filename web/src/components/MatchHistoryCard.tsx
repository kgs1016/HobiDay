"use client";

import Link from "next/link";
import { AvatarFallback } from "@/components/icons";
import { headcountLabel } from "@/lib/capacity";
import type { MatchRecord, MatchMate } from "@/lib/supabase";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const when = (iso: string) => {
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}(${
    DAYS[d.getDay()]
  }) ${hm}`;
};

function Mate({
  m,
  url,
  sessionId,
}: {
  m: MatchMate;
  url?: string;
  sessionId: string;
}) {
  return (
    <Link
      href={`/user?id=${m.id}&s=${sessionId}`}
      className="flex items-center gap-2 rounded-full bg-surface2 py-1 pl-1 pr-3 transition-colors active:bg-line"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <AvatarFallback size={28} />
      )}
      <span className="text-[12.5px] font-medium">
        {m.nickname}
        {m.is_host && <span className="ml-1 font-normal text-faint">· 호스트</span>}
      </span>
    </Link>
  );
}
export default function MatchHistoryCard({
  r,
  photos,
}: {
  r: MatchRecord;
  photos: Record<string, string>;
}) {
  const departed = r.departed_members ?? 0;
  /* 모임 정보로 들어가는 마지막 통로다. 채팅방은 끝나고 24시간,
     신청함은 시작하고 24시간이면 사라진다. 알림도 읽고 24시간이면
     없어진다. 확정으로 참가한 사람에게는 서버가 계속 문을 열어두므로,
     여기서만은 언제든 다시 볼 수 있게 한다. */
  /* 예전엔 카드 전체가 하나의 링크였다. 함께 간 사람을 눌러 프로필로
     갈 수 있게 되면서 링크가 링크를 품게 되는데, 겹친 링크는 브라우저가
     어느 쪽으로 갈지 정하지 못한다. 윗줄(모임 정보)만 링크로 남긴다. */
  return (
    <div className="py-4">
      <Link
        href={`/session?id=${r.id}`}
        className="-mx-2 flex items-start justify-between gap-2 rounded-lg px-2 py-1 transition-colors active:bg-surface2"
      >
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold">{r.gym}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {when(r.starts_at)} · {headcountLabel(r.members)}
          </p>
        </div>
        {r.i_am_host && (
          <span className="shrink-0 rounded-md bg-surface2 px-2.5 py-1 text-[11.5px] font-medium text-muted">
            내가 연 모임
          </span>
        )}
      </Link>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.people.map(m => <Mate key={m.id} m={m} sessionId={r.id} url={m.photo ? photos[m.photo] : undefined} />)}
        {departed > 0 && <span className="flex items-center gap-2 rounded-full bg-surface2 py-1 pl-1 pr-3 text-[12.5px] text-muted">
          <AvatarFallback size={28} />
          탈퇴한 사용자{departed > 1 ? ` ${departed}명` : ""}
        </span>}
      </div>
    </div>
  );
}
