"use client";

/* 매칭 기록 — 성사돼서 끝난 모임만 모아 본다.
   홈 목록은 시작 3시간 뒤부터 감추고 모임 채팅도 확정된 방만 띄워서,
   끝나고 나면 "누구랑 어디 갔었지" 를 확인할 데가 없었다.
   호스트로 연 모임과 참가자로 간 모임이 같이 온다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { AvatarFallback } from "@/components/icons";
import { HoldIllust } from "@/components/illustrations";
import {
  currentUser,
  fetchMatchHistory,
  hasSupabase,
  signedPhotoUrls,
  type MatchRecord,
  type MatchMate,
} from "@/lib/supabase";
import { capacityLabel } from "@/lib/capacity";

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
      href={`/session/host?id=${sessionId}&u=${m.id}`}
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

function Card({
  r,
  photos,
}: {
  r: MatchRecord;
  photos: Record<string, string>;
}) {
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
            {when(r.starts_at)} · {capacityLabel(r.capacity, r.gender_mode)}
          </p>
        </div>
        {r.i_am_host && (
          <span className="shrink-0 rounded-md bg-surface2 px-2.5 py-1 text-[11.5px] font-medium text-muted">
            내가 연 모임
          </span>
        )}
      </Link>

      {r.people.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.people.map((m) => (
            <Mate
              key={m.id}
              m={m}
              sessionId={r.id}
              url={m.photo ? photos[m.photo] : undefined}
            />
          ))}
        </div>
      ) : (
        /* 전원이 탈퇴했거나 전부 차단한 경우. 모임 자체는 있었으니 기록은 남긴다 */
        <p className="mt-3 text-[12.5px] text-muted">
          함께한 분들의 프로필을 볼 수 없어요
        </p>
      )}
    </div>
  );
}

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
        <BackButton fallback="/me" />
        <h1 className="text-[18px] font-bold tracking-tight">매칭 기록</h1>
      </header>

      {authed === false ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 기록이 보여요</p>
          <Link
            href="/login"
            className="rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
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
          <p className="text-[12.5px] leading-relaxed text-muted">
            성사된 모임이 끝나면 여기에 쌓여요
          </p>
          <Link
            href="/"
            className="mt-3 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
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
              <Card key={r.id} r={r} photos={photos} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
