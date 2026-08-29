"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryId } from "@/lib/queryId";
import { careerLabel, level } from "@/lib/levels";
import { MOCK_PEOPLE, MOCK_SESSIONS } from "@/lib/mock";
import BackButton from "@/components/BackButton";
import { AvatarFallback } from "@/components/icons";
import { ShoeIllust } from "@/components/illustrations";
import {
  hasSupabase,
  fetchSessionHost,
  signedPhotoUrls,
  type HostProfile,
} from "@/lib/supabase";

const ERRORS: Record<string, string> = {
  auth: "로그인이 필요해요",
  not_found: "모임을 찾을 수 없어요",
  left: "호스트가 탈퇴해서 프로필을 볼 수 없어요",
};

/** 목데이터 폴백 — Supabase 키가 없을 때 화면만 확인한다 */
function mockHost(sessionId: string): HostProfile | null {
  const s = MOCK_SESSIONS.find((x) => x.id === sessionId);
  const p = MOCK_PEOPLE.find((x) => x.id === s?.host?.id);
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
  const router = useRouter();
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
        setHost(mockHost(id));
        return;
      }
      const r = await fetchSessionHost(id);
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
  }, [id, qid]);

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
          {(err && ERRORS[err]) ?? "호스트 정보를 볼 수 없어요"}
        </p>
        <button
          onClick={() => router.back()}
          className="mt-6 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
        >
          돌아가기
        </button>
      </main>
    );

  const lv = level(host.level);

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-4">
        <BackButton />
        <h1 className="text-[18px] font-bold tracking-tight">호스트 프로필</h1>
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
        모임을 연 사람이라 프로필이 공개돼요.
        <br />
        다른 참가자는 모임이 확정되면 볼 수 있어요.
      </p>

      <Link
        href={`/session?id=${id}`}
        className="mt-6 block rounded-xl border border-line bg-surface py-3.5 text-center text-[14px] font-medium text-ink"
      >
        모임 정보로 돌아가기
      </Link>
    </main>
  );
}
