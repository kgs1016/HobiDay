"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryId, useQueryParam } from "@/lib/queryId";
import { careerLabel, level } from "@/lib/levels";
import { MOCK_PEOPLE, MOCK_SESSIONS } from "@/lib/mock";
import BackButton from "@/components/BackButton";
import { AvatarFallback } from "@/components/icons";
import { ShoeIllust } from "@/components/illustrations";
import {
  hasSupabase,
  fetchSessionHost,
  fetchSessionMember,
  signedPhotoUrls,
  type HostProfile,
} from "@/lib/supabase";

const ERRORS: Record<string, string> = {
  auth: "로그인이 필요해요",
  not_found: "프로필을 볼 수 없어요",
  left: "탈퇴해서 프로필을 볼 수 없어요",
};

/** 목데이터 폴백 — Supabase 키가 없을 때 화면만 확인한다 */
function mockHost(sessionId: string, userId?: string): HostProfile | null {
  const s = MOCK_SESSIONS.find((x) => x.id === sessionId);
  const p = MOCK_PEOPLE.find((x) => x.id === (userId || s?.host?.id));
  if (!p) return null;
  return {
    id: p.id,
    nickname: p.nickname,
    gender: p.gender,
    age: p.age,
    area: p.area,
    level: p.level,
    career: p.careerId ?? null,
    height: p.height ?? null,
    home_gym: p.homeGym,
    mbti: p.mbti,
    intro: null,
    photo: null,
    hosted: MOCK_SESSIONS.filter((x) => x.host?.id === p.id).length,
  };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3 last:border-b-0">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[13.5px] font-medium">{value}</span>
    </div>
  );
}

export default function SessionHost() {
  const qid = useQueryId();
  const id = qid ?? "";
  /* 참여자 명단에서 들어오면 누구인지가 붙는다. 없으면 호스트 —
     이미 폰에 깔린 앱이 u 없이 이 주소를 부르고 있어서 그대로 받는다. */
  const u = useQueryParam("u");
  const from = useQueryParam("from");
  const router = useRouter();
  /* 채팅방에서 들어왔으면 그 방으로 돌려보낸다 — 방은 상태로만 열려 있어
     router.back() 으로는 목록에 떨어진다. /room · /session 과 같은 규칙. */
  const backTo = from === "chat" && id ? `/chat?room=${id}#session` : undefined;
  const [host, setHost] = useState<HostProfile | null | undefined>(undefined);
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // qid 는 첫 렌더에 undefined (주소를 아직 안 읽음)
    if (qid === undefined) return;
    (async () => {
      if (!id) {
        setErr("not_found");
        setHost(null);
        return;
      }
      if (!hasSupabase()) {
        setHost(mockHost(id, u ?? undefined));
        return;
      }
      const r = u ? await fetchSessionMember(id, u) : await fetchSessionHost(id);
      if (r.error || !r.host) {
        setErr(r.error ?? "not_found");
        setHost(null);
        return;
      }
      setHost(r.host);
      if (r.host.photo) {
        setPhoto((await signedPhotoUrls([r.host.photo]))[r.host.photo] ?? null);
      }
    })();
  }, [id, qid, u]);

  if (host === undefined)
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-faint">
        불러오는 중…
      </main>
    );

  if (!host)
    return (
      <main className="flex flex-col items-center px-4 pt-24 text-center">
        <ShoeIllust size={64} />
        <p className="mt-4 text-[15px] font-semibold">
          {(err && ERRORS[err]) ?? "프로필을 볼 수 없어요"}
        </p>
        <button
          onClick={() => (backTo ? router.push(backTo) : router.back())}
          className="mt-6 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
        >
          돌아가기
        </button>
      </main>
    );

  const lv = level(host.level);
  /* session_member 는 is_host 를 함께 준다. u 없이 들어온 예전 주소
     (session_host) 는 그 칸이 없으므로 호스트로 본다. */
  const isHost = (host as HostProfile & { is_host?: boolean }).is_host ?? true;

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-4">
        <BackButton to={backTo} />
        <h1 className="text-[18px] font-bold tracking-tight">
          {isHost ? "호스트 프로필" : "참여자 프로필"}
        </h1>
      </header>

      {/* 사진과 이름 — 카드 없이 문서처럼 */}
      <section className="flex flex-col items-center pt-2 text-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="h-24 w-24 rounded-full object-cover"
          />
        ) : (
          <AvatarFallback size={96} />
        )}
        <p className="mt-3 text-[19px] font-bold">
          {host.nickname}
          <span className="ml-1.5 text-[14px] font-normal text-muted">
            {host.age}
          </span>
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {host.area} · L{host.level} {lv.name}
        </p>
        {host.hosted > 1 && (
          <span className="mt-3 rounded-md bg-surface2 px-2.5 py-1 text-[11.5px] font-medium text-muted">
            모임 {host.hosted}번 열었어요
          </span>
        )}
        {host.intro && (
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink/85">
            &ldquo;{host.intro}&rdquo;
          </p>
        )}
      </section>

      <section className="mt-6 border-t border-line pt-2">
        <Row label="레벨" value={`L${host.level} ${lv.name} (${lv.colors})`} />
        {host.career && (
          <Row label="구력" value={careerLabel(host.career) ?? "-"} />
        )}
        <Row label="홈짐" value={host.home_gym} />
        <Row label="사는 동네" value={host.area} />
        {host.height && <Row label="키" value={`${host.height}cm`} />}
        {host.mbti && <Row label="MBTI" value={host.mbti} />}
      </section>

      <p className="mt-5 text-center text-[11.5px] leading-relaxed text-faint">
        모임에 들어온 사람이라 이 모임 안에서 프로필이 보여요.
        <br />
        사람 찾기 공개 여부와는 별개예요.
      </p>

      <Link
        /* 채팅에서 왔으면 모임 정보의 뒤로가기도 채팅으로 이어지게 한다 */
        href={backTo ? `/session?id=${id}&from=chat` : `/session?id=${id}`}
        className="mt-6 block rounded-xl border border-line bg-surface py-3.5 text-center text-[14px] font-medium text-ink"
      >
        모임 정보로 돌아가기
      </Link>
    </main>
  );
}
