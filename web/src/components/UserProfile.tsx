"use client";

/* 상대 프로필 — 어디서 열든 이 화면 하나다 (2026-09 결정).
   사람 찾기·1:1 채팅·단체 채팅·참가 현황·매칭 기록이 전부 /user?id= 로
   온다. 들어온 길(from)에 따라 돌아갈 곳과 아래 버튼만 달라진다.

   사진 → 이름 → 참여 횟수 → 소개 → 완등 성취 → 나머지 정보 순서. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { careerLabel, level } from "@/lib/levels";
import { MOCK_PEOPLE, MOCK_SESSIONS } from "@/lib/mock";
import BackButton from "@/components/BackButton";
import ChatRequestSheet from "@/components/ChatRequestSheet";
import PlayerReviews from "@/components/PlayerReviews";
import PublicShoe from "@/components/PublicShoe";
import ReportSheet from "@/components/ReportSheet";
import { AvatarFallback, ThumbIcon } from "@/components/icons";
import { ShoeIllust } from "@/components/illustrations";
import {
  currentUser,
  fetchSentRequests,
  fetchUserProfile,
  hasSupabase,
  signedPhotoUrls,
  type UserProfile as Profile,
} from "@/lib/supabase";

const ERRORS: Record<string, string> = {
  auth: "로그인이 필요해요",
  not_found: "프로필을 볼 수 없어요",
  left: "탈퇴해서 프로필을 볼 수 없어요",
};

/** 목데이터 폴백 — Supabase 키가 없을 때 화면만 확인한다 */
function mockProfile(userId: string | null, sessionId: string | null): Profile | null {
  const s = sessionId ? MOCK_SESSIONS.find((x) => x.id === sessionId) : undefined;
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
    is_public: true,
    is_host: s ? s.host?.id === p.id : null,
    joined: MOCK_SESSIONS.filter((x) => x.host?.id === p.id).length,
    likes: 0,
    reviews: 0,
    achievement: p.achievement,
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

export default function UserProfile({
  userId,
  sessionId,
  matchId,
  from,
}: {
  /** 없으면 sessionId 의 호스트 — 예전 주소(/session/host?id=)가 그렇게 온다 */
  userId: string | null;
  /** 모임 맥락 — 참가 현황·단체 채팅에서 왔을 때. 열람 판정에도 쓴다 */
  sessionId: string | null;
  /** 1:1 채팅방에서 왔을 때 그 방 — 돌아갈 곳 */
  matchId: string | null;
  from: string | null;
}) {
  const router = useRouter();
  /* 채팅방은 상태로만 열려 있어 router.back() 으로는 목록에 떨어진다.
     방 주소를 들고 있다가 그리로 돌려보낸다. */
  const backTo =
    from === "chat" && sessionId
      ? `/chat?room=${sessionId}#session`
      : from === "chat" && matchId
        ? `/chat?thread=${matchId}`
        : undefined;

  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [photo, setPhoto] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  /* 답을 기다리는 중이거나 이미 열린 채팅 신청이 있으면 버튼을 잠근다 */
  const [sent, setSent] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!userId && !sessionId) {
        setErr("not_found");
        setProfile(null);
        return;
      }
      if (!hasSupabase()) {
        setProfile(mockProfile(userId, sessionId));
        return;
      }
      const [r, u] = await Promise.all([fetchUserProfile(userId, sessionId), currentUser()]);
      setMe(u?.id ?? null);
      if (r.error || !r.profile) {
        setErr(r.error ?? "not_found");
        setProfile(null);
        return;
      }
      setProfile(r.profile);
      if (r.profile.photo)
        setPhoto((await signedPhotoUrls([r.profile.photo]))[r.profile.photo] ?? null);
      if (r.profile.is_public && u && u.id !== r.profile.id) {
        const list = await fetchSentRequests();
        setSent(
          !!list?.some((x) => x.to_id === r.profile!.id && x.status !== "declined")
        );
      }
    })();
  }, [userId, sessionId]);

  if (profile === undefined)
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-faint">
        불러오는 중…
      </main>
    );

  if (!profile)
    return (
      <main className="flex flex-col items-center px-4 pt-24 text-center">
        <ShoeIllust size={64} />
        <p className="mt-4 text-[15px] font-semibold">
          {(err && ERRORS[err]) ?? "프로필을 볼 수 없어요"}
        </p>
        <button
          onClick={() => (backTo ? router.push(backTo) : router.back())}
          className="button-primary mt-6 rounded-xl px-6 py-2.5 text-[14px] font-semibold"
        >
          돌아가기
        </button>
      </main>
    );

  const lv = profile.level ? level(profile.level) : null;
  const isMe = me === profile.id;
  const title = sessionId
    ? profile.is_host
      ? "호스트 프로필"
      : "참여자 프로필"
    : "프로필";
  const canRequest = !isMe && profile.is_public && !matchId;

  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-4">
        <BackButton to={backTo} />
        <h1 className="flex-1 text-[18px] font-bold tracking-tight">{title}</h1>
        {!isMe && (
          <button
            onClick={() => setReporting(true)}
            className="px-2 py-1 text-[12px] font-medium text-faint"
          >
            신고
          </button>
        )}
      </header>

      {/* 사진과 이름 — 카드 없이 문서처럼 */}
      <section className="flex flex-col items-center pt-2 text-center">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <AvatarFallback size={96} />
        )}
        <p className="mt-3 text-[19px] font-bold">
          {profile.nickname}
          <span className="ml-1.5 text-[14px] font-normal text-muted">{profile.age}</span>
        </p>
        {/* 받은 추천 — 플레이어 리뷰의 누적 */}
        <p className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-accent-strong">
          <ThumbIcon size={15} /> 추천 {profile.likes}
        </p>
        {profile.joined > 0 && (
          <span className="mt-2.5 rounded-md bg-surface2 px-2.5 py-1 text-[11.5px] font-medium text-muted">
            모임 {profile.joined}번 참여했어요
          </span>
        )}
        {profile.intro && (
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink/85">
            &ldquo;{profile.intro}&rdquo;
          </p>
        )}
      </section>

      {!hasSupabase() && (
        <p className="mt-4 text-center text-[11.5px] text-faint">
          미리보기 데이터 · 암벽화 성취도 예시예요
        </p>
      )}
      <PublicShoe achievement={profile.achievement} />

      {hasSupabase() && <PlayerReviews userId={profile.id} count={profile.reviews} />}

      <section className="mt-6 border-t border-line pt-2">
        {lv && <Row label="등반 수준" value={`${lv.name} · 직접 선택`} />}
        {profile.career && <Row label="구력" value={careerLabel(profile.career) ?? "-"} />}
        <Row label="홈짐" value={profile.home_gym} />
        <Row label="사는 동네" value={profile.area} />
        {profile.height && <Row label="키" value={`${profile.height}cm`} />}
        {profile.mbti && <Row label="MBTI" value={profile.mbti} />}
      </section>

      {canRequest && (
        <button
          disabled={sent}
          onClick={() => setRequesting(true)}
          className={`mt-6 w-full rounded-xl py-3.5 text-[14.5px] font-semibold ${
            sent ? "bg-surface2 text-muted" : "button-primary"
          }`}
        >
          {sent ? "채팅을 보냈어요" : "채팅 보내기"}
        </button>
      )}

      {sessionId && (
        <Link
          /* 채팅에서 왔으면 모임 정보의 뒤로가기도 채팅으로 이어지게 한다 */
          href={backTo ? `/session?id=${sessionId}&from=chat` : `/session?id=${sessionId}`}
          className={`block rounded-xl border border-line bg-surface py-3.5 text-center text-[14px] font-medium text-ink ${
            canRequest ? "mt-2" : "mt-6"
          }`}
        >
          모임 정보로 돌아가기
        </Link>
      )}

      {requesting && (
        <ChatRequestSheet
          target={{ id: profile.id, nickname: profile.nickname, homeGym: profile.home_gym }}
          onClose={() => setRequesting(false)}
          onSent={() => setSent(true)}
        />
      )}

      {reporting && (
        <ReportSheet
          targetId={profile.id}
          nickname={profile.nickname}
          context={sessionId ? "session" : matchId ? "chat" : "profile"}
          refId={sessionId ?? matchId ?? undefined}
          onClose={() => setReporting(false)}
          // 차단까지 걸렸으니 이 프로필은 더 볼 수 없다 — 온 곳으로 돌려보낸다
          onDone={() => (backTo ? router.push(backTo) : router.back())}
        />
      )}
    </main>
  );
}
