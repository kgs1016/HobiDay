"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProfileTodo from "@/components/ProfileTodo";
import { resetProfileGate } from "@/components/RequireProfile";
import { careerLabel, level } from "@/lib/levels";
import type { MyProfile } from "@/lib/myProfile";
import { loadMyProfile } from "@/lib/myProfile";
import { unregisterPush } from "@/lib/nativePush";
import {
  CREDIT_LABELS,
  CREDIT_SESSION_VIDEO,
  REQUEST_COST,
  getSupabase,
  hasSupabase,
  currentUser,
  deleteAccount,
  fetchAppFlags,
  fetchCredits,
  fetchMyProfileDb,
  fetchMyVideos,
  signedPhotoUrls,
  type Credits,
} from "@/lib/supabase";

export default function Me() {
  const router = useRouter();
  // 카카오 계정은 이메일이 없을 수 있다. 이메일은 "표시용" 일 뿐이라
  // 로그아웃·탈퇴는 로그인 여부(authed)로 판단해야 한다.
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [videoCount, setVideoCount] = useState(0);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [showCredits, setShowCredits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false); // 탈퇴 확인 패널
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false); // 오픈 전 잠금 (테스터는 false)

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) {
        setProfile(loadMyProfile());
        setLoading(false);
        return;
      }
      const user = await currentUser();
      if (!user) {
        // 비로그인 상태면 곧바로 로그인 화면으로
        router.replace("/login");
        return;
      }
      setAuthed(true);
      setEmail(user.email ?? null);
      const [prof, vids, cr, flags] = await Promise.all([
        fetchMyProfileDb(),
        fetchMyVideos(),
        fetchCredits(),
        fetchAppFlags(),
      ]);
      if (flags) setLocked(!flags.sessions_open && !flags.people_open);
      setProfile(prof);
      setVideoCount(vids?.length ?? 0);
      setCredits(cr);
      setLoading(false);
      if (prof?.photo)
        setPhotoUrl((await signedPhotoUrls([prof.photo]))[prof.photo] ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    // 토큰을 먼저 지운다 — 로그아웃하면 세션이 없어 RPC 가 안 통한다.
    // 안 지우면 이 폰에 알림이 계속 온다.
    await unregisterPush();
    await getSupabase()?.auth.signOut();
    // SPA 라 리로드가 없다 — 프로필 게이트 캐시를 지워야 다음 계정에 안 샌다
    resetProfileGate();
    router.replace("/login");
  };

  const leave = async () => {
    setBusy(true);
    const r = await deleteAccount();
    setBusy(false);
    if (r.error) {
      alert("탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    resetProfileGate();
    alert("탈퇴가 완료됐어요. 그동안 함께해줘서 고마워요.");
    router.replace("/login");
  };

  if (loading)
    return <main className="px-4 pt-20 text-center text-muted">불러오는 중…</main>;

  return (
    <main className="px-4">
      <header className="pt-6 pb-4">
        <h1 className="text-[19px] font-extrabold tracking-tight">내 정보</h1>
      </header>

      <>
          <section className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="내 프로필 사진"
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-2xl">
                🧗
              </div>
            )}
            <div className="min-w-0 flex-1">
              {profile ? (
                <>
                  <p className="text-[17px] font-extrabold">{profile.nickname}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {[
                      `L${profile.level} ${level(profile.level).name} (${level(profile.level).colors})`,
                      profile.homeGym,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {[
                      careerLabel(profile.careerId) &&
                        `구력 ${careerLabel(profile.careerId)}`,
                      profile.height && `${profile.height}cm`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-extrabold">프로필이 아직 없어요</p>
                  <Link
                    href="/profile/new"
                    className="mt-1 inline-block text-[13px] font-bold text-accent"
                  >
                    프로필 만들기 →
                  </Link>
                </>
              )}
              {email && (
                <p className="mt-0.5 truncate text-[11.5px] text-muted">{email}</p>
              )}
            </div>
          </section>

          {profile && (
            <div className="mt-3">
              <ProfileTodo profile={profile} />
            </div>
          )}

          <section className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowCredits((v) => !v)}
              className="rounded-2xl border border-line bg-surface p-4 text-left"
            >
              <p className="text-[12px] font-semibold text-muted">
                크레딧 {credits && credits.history.length > 0 && (showCredits ? "▾" : "▸")}
              </p>
              <p className="mt-1 text-[19px] font-extrabold text-mint">
                {credits?.balance ?? 0}
              </p>
            </button>
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-[12px] font-semibold text-muted">내 영상</p>
              <p className="mt-1 text-[19px] font-extrabold">🎥 {videoCount}</p>
            </div>
          </section>

          {showCredits && credits && (
            <section className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface">
              {credits.history.length === 0 ? (
                <p className="px-4 py-4 text-[12.5px] leading-relaxed text-muted">
                  아직 내역이 없어요. 모임에서 등반 영상을 올리면 쌓여요.
                </p>
              ) : (
                credits.history.map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b border-line px-4 py-2.5 last:border-b-0"
                  >
                    <span className="text-[13px]">
                      {CREDIT_LABELS[h.reason] ?? h.reason}
                    </span>
                    <span
                      className={`text-[13px] font-extrabold ${
                        h.delta > 0 ? "text-mint" : "text-muted"
                      }`}
                    >
                      {h.delta > 0 ? `+${h.delta}` : h.delta}
                    </span>
                  </div>
                ))
              )}
              <p className="border-t border-line px-4 py-2.5 text-[11.5px] leading-relaxed text-muted">
                관심 보내기 1회에 {REQUEST_COST}크레딧을 써요. 보내는 순간
                쓰는 거라 수락 여부와 상관없이 돌려드리지 않아요. 모임 신청은
                같은 {REQUEST_COST}크레딧이지만, 호스트가 받지 않거나 모임이
                취소되거나 내가 나가면 돌려드려요. 모임에서 등반 영상을 올리면 한 번에{" "}
                {CREDIT_SESSION_VIDEO}크레딧이 쌓여요.
              </p>
            </section>
          )}

          <section className="mt-4 flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            <Link
              href="/profile/new"
              className="flex items-center justify-between border-b border-line px-4 py-3.5 text-left text-[14px] font-semibold last:border-b-0"
            >
              프로필 수정
              <span className="text-muted">›</span>
            </Link>
            {/* 오픈 전 잠금 중엔 모임 화면이 닫혀 있어 눌러도 홈으로 튕긴다 — 숨긴다 */}
            {!locked && (
              <Link
                href="/session/mine"
                className="flex items-center justify-between border-b border-line px-4 py-3.5 text-left text-[14px] font-semibold last:border-b-0"
              >
                내가 만든 모임
                <span className="text-muted">›</span>
              </Link>
            )}
            {/* 끝난 모임은 홈에서도 채팅에서도 사라진다 — 여기가 유일한 통로 */}
            {!locked && (
              <Link
                href="/me/history"
                className="flex items-center justify-between border-b border-line px-4 py-3.5 text-left text-[14px] font-semibold last:border-b-0"
              >
                매칭 기록
                <span className="text-muted">›</span>
              </Link>
            )}
            <Link
              href="/safety"
              className="flex items-center justify-between border-b border-line px-4 py-3.5 text-left text-[14px] font-semibold last:border-b-0"
            >
              안전 설정 · 차단 목록
              <span className="text-muted">›</span>
            </Link>
          </section>

          {authed && (
            <button
              onClick={logout}
              className="mt-4 w-full rounded-xl border border-line py-3 text-[13.5px] font-bold text-muted"
            >
              로그아웃
            </button>
          )}

          {authed &&
            (!leaving ? (
              <button
                onClick={() => setLeaving(true)}
                className="mt-3 w-full py-2 text-[12.5px] font-semibold text-muted/70 underline underline-offset-4"
              >
                회원 탈퇴
              </button>
            ) : (
              <section className="mt-3 rounded-2xl border border-line bg-surface p-5">
                <p className="text-[15px] font-extrabold">정말 탈퇴할까요?</p>
                <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-muted">
                  <li>· 프로필과 사진·영상이 모두 지워져요</li>
                  <li>· 주고받은 대화와 매칭이 사라져요 (상대방 쪽에서도)</li>
                  <li>
                    · 남은 크레딧 {(credits?.balance ?? 0).toLocaleString()}은
                    복구되지 않아요
                  </li>
                  <li>· 신청한 모임에서 자동으로 빠져요</li>
                </ul>
                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  되돌릴 수 없어요. 계속하려면 아래에{" "}
                  <b className="text-ink">탈퇴</b>를 입력해주세요.
                </p>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="탈퇴"
                  /* iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 */
                  className="mt-2 w-full rounded-xl border border-line bg-bg px-3.5 py-3 text-[16px] text-ink placeholder:text-muted/50"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setLeaving(false);
                      setConfirmText("");
                    }}
                    disabled={busy}
                    className="flex-1 rounded-xl border border-line py-3 text-[13.5px] font-bold disabled:opacity-50"
                  >
                    계속 이용할래요
                  </button>
                  <button
                    onClick={leave}
                    disabled={busy || confirmText.trim() !== "탈퇴"}
                    className="flex-1 rounded-xl border border-danger py-3 text-[13.5px] font-bold text-danger disabled:opacity-40"
                  >
                    {busy ? "처리 중…" : "탈퇴하기"}
                  </button>
                </div>
              </section>
            ))}
        </>

      <p className="mt-6 text-center text-[11.5px] text-muted">
        HOBIDAY — 취미로 시작해서, 사람으로 끝나는 하루
      </p>
      <p className="mt-2 pb-2 text-center text-[11px] text-muted/70">
        <Link href="/terms" className="underline underline-offset-2">
          이용약관
        </Link>
        {" · "}
        <Link href="/privacy" className="underline underline-offset-2">
          개인정보처리방침
        </Link>
      </p>
    </main>
  );
}
