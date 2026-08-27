"use client";

/* 매칭 기록 — 성사돼서 끝난 모임만 모아 본다.
   홈 목록은 시작 3시간 뒤부터 감추고 모임 채팅도 확정된 방만 띄워서,
   끝나고 나면 "누구랑 어디 갔었지" 를 확인할 데가 없었다.
   호스트로 연 모임과 참가자로 간 모임이 같이 온다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

function Mate({ m, url }: { m: MatchMate; url?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-bg py-1 pl-1 pr-3">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] ${
            m.gender === "f" ? "bg-female/15" : "bg-male/15"
          }`}
        >
          🧗
        </span>
      )}
      <span className="text-[12.5px] font-bold">
        {m.nickname}
        {m.is_host && <span className="ml-1 text-muted">· 호스트</span>}
      </span>
    </div>
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
  return (
    <Link
      href={`/session?id=${r.id}`}
      className="block rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-extrabold">{r.gym}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {when(r.starts_at)} · {capacityLabel(r.capacity, r.gender_mode)}
          </p>
        </div>
        {r.i_am_host && (
          <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[11.5px] font-bold text-accent">
            내가 연 모임
          </span>
        )}
      </div>

      {r.people.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.people.map((m) => (
            <Mate key={m.id} m={m} url={m.photo ? photos[m.photo] : undefined} />
          ))}
        </div>
      ) : (
        /* 전원이 탈퇴했거나 전부 차단한 경우. 모임 자체는 있었으니 기록은 남긴다 */
        <p className="mt-3 text-[12.5px] text-muted">
          함께한 분들의 프로필을 볼 수 없어요
        </p>
      )}
    </Link>
  );
}

export default function MatchHistory() {
  const router = useRouter();
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
      <header className="flex items-center gap-3 pt-5 pb-4">
        <button onClick={() => router.back()} className="text-lg text-muted">
          ←
        </button>
        <h1 className="text-[19px] font-extrabold tracking-tight">매칭 기록</h1>
      </header>

      {authed === false ? (
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 기록이 보여요</p>
          <Link
            href="/login"
            className="rounded-xl bg-accent px-6 py-2.5 text-[14px] font-bold text-white"
          >
            로그인 하기
          </Link>
        </div>
      ) : list === null ? (
        <p className="pt-14 text-center text-muted">불러오는 중…</p>
      ) : list.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <span className="text-4xl">🧗</span>
          <p className="text-[15px] font-bold">아직 끝난 모임이 없어요</p>
          <p className="text-[12.5px] leading-relaxed text-muted">
            성사된 모임이 끝나면 여기에 쌓여요
          </p>
          <Link
            href="/"
            className="mt-2 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-bold text-white"
          >
            모임 보러 가기
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-muted">
            함께한 모임 <b className="text-ink">{list.length}</b>번 · 만난 사람{" "}
            <b className="text-ink">{metCount}</b>명
          </p>
          <div className="flex flex-col gap-2">
            {list.map((r) => (
              <Card key={r.id} r={r} photos={photos} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
