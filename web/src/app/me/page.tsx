"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProfileTodo from "@/components/ProfileTodo";
import { resetProfileGate } from "@/components/RequireProfile";
import { AvatarFallback, ChevronRightIcon } from "@/components/icons";
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

/* 설정 화면의 한 줄 — 카드를 만들지 않고 행 + divider 로 쌓는다 */
function MenuRow({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border-b border-line py-3.5 text-[15px] last:border-b-0"
    >
      {label}
      <ChevronRightIcon size={16} className="text-faint" />
    </Link>
  );
}

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
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-faint">
        불러오는 중…
      </main>
    );

  return (
    <main>
      <header className="px-4 pt-6 pb-4">
        <h1 className="text-[20px] font-bold tracking-tight">내 정보</h1>
      </header>

      {/* 프로필 — 카드가 아니라 화면의 첫 번째 섹션 */}
      <section className="px-4 pb-5">
        <div className="flex items-center gap-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt="내 프로필 사진"
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <AvatarFallback size={64} />
          )}
          <div className="min-w-0 flex-1">
            {profile ? (
              <>
                <p className="text-[17px] font-bold">{profile.nickname}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {[
                    `L${profile.level} ${level(profile.level).name}`,
                    careerLabel(profile.careerId) &&
                      `구력 ${careerLabel(profile.careerId)}`,
                    profile.homeGym,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold">프로필이 아직 없어요</p>
                <Link
                  href="/profile/new"
                  className="mt-1 inline-block text-[13px] font-semibold text-accent-pressed"
                >
                  프로필 만들기
                </Link>
              </>
            )}
            {email && (
              <p className="mt-0.5 truncate text-[11.5px] text-faint">{email}</p>
            )}
          </div>
        </div>
        {profile && (
          <div className="mt-3">
            <ProfileTodo profile={profile} />
          </div>
        )}
      </section>

      {/* 크레딧 · 내 영상 — 섹션 사이는 얇은 회색 밴드로 구분한다 */}
      <section className="border-t-8 border-surface2 px-4">
        <button
          onClick={() => setShowCredits((v) => !v)}
          className="flex w-full items-center justify-between border-b border-line py-3.5 text-left"
        >
          <span className="text-[15px]">크레딧</span>
          <span className="flex items-center gap-1.5">
            <span className="text-[15px] font-semibold">
              {(credits?.balance ?? 0).toLocaleString()}
            </span>
            <ChevronRightIcon
              size={15}
              className={`text-faint transition-transform ${
                showCredits ? "rotate-90" : ""
              }`}
            />
          </span>
        </button>

        {showCredits && credits && (
          <div className="border-b border-line py-1">
            {credits.history.length === 0 ? (
              <p className="py-3 text-[12.5px] leading-relaxed text-muted">
                아직 내역이 없어요. 모임에서 등반 영상을 올리면 쌓여요.
              </p>
            ) : (
              credits.history.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-[13px] text-muted">
                    {CREDIT_LABELS[h.reason] ?? h.reason}
                  </span>
                  <span
                    className={`text-[13px] font-semibold ${
                      h.delta > 0 ? "text-accent-pressed" : "text-muted"
                    }`}
                  >
                    {h.delta > 0 ? `+${h.delta}` : h.delta}
                  </span>
                </div>
              ))
            )}
            {/* 반환 규칙이 관심과 모임에서 다르다 — 줄이더라도 이 구분은 지킨다 */}
            <p className="pb-3 pt-1 text-[11.5px] leading-relaxed text-faint">
              관심 보내기 {REQUEST_COST}크레딧 — 보내는 순간 쓰여요 · 모임 신청{" "}
              {REQUEST_COST}크레딧 — 거절되거나 모임이 취소되거나 내가 나가면
              돌려드려요 · 등반 영상 인증 +{CREDIT_SESSION_VIDEO}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between py-3.5">
          <span className="text-[15px]">내 영상</span>
          <span className="text-[15px] font-semibold">{videoCount}</span>
        </div>
      </section>

      {/* 메뉴 */}
      <section className="border-t-8 border-surface2 px-4">
        <MenuRow href="/profile/new" label="프로필 수정" />
        {/* 오픈 전 잠금 중엔 모임 화면이 닫혀 있어 눌러도 홈으로 튕긴다 — 숨긴다 */}
        {!locked && <MenuRow href="/session/mine" label="내가 만든 모임" />}
        {/* 끝난 모임은 홈에서도 채팅에서도 사라진다 — 여기가 유일한 통로 */}
        {!locked && <MenuRow href="/me/history" label="매칭 기록" />}
        <MenuRow href="/safety" label="안전 설정 · 차단 목록" />
        <MenuRow href="/support" label="고객센터 · 문의" />
      </section>

      {/* 계정 */}
      {authed && (
        <section className="border-t-8 border-surface2 px-4">
          <button
            onClick={logout}
            className="flex w-full items-center border-b border-line py-3.5 text-left text-[15px] text-muted last:border-b-0"
          >
            로그아웃
          </button>
          {!leaving && (
            <button
              onClick={() => setLeaving(true)}
              className="flex w-full items-center py-3.5 text-left text-[15px] text-faint"
            >
              회원 탈퇴
            </button>
          )}
        </section>
      )}

      {authed && leaving && (
        <section className="border-t-8 border-surface2 px-4 py-5">
          <p className="text-[15px] font-bold">정말 탈퇴할까요?</p>
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
            <b className="font-semibold text-ink">탈퇴</b>를 입력해주세요.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="탈퇴"
            /* iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 */
            className="mt-2 w-full rounded-lg bg-surface2 px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:outline-none"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setLeaving(false);
                setConfirmText("");
              }}
              disabled={busy}
              className="flex-1 rounded-xl border border-line py-3 text-[13.5px] font-medium disabled:opacity-50"
            >
              계속 이용할래요
            </button>
            <button
              onClick={leave}
              disabled={busy || confirmText.trim() !== "탈퇴"}
              className="flex-1 rounded-xl border border-danger py-3 text-[13.5px] font-semibold text-danger disabled:opacity-40"
            >
              {busy ? "처리 중…" : "탈퇴하기"}
            </button>
          </div>
        </section>
      )}

      <p className="mt-8 text-center text-[11.5px] text-faint">
        HOBIDAY — 취미로 시작해서, 사람으로 끝나는 하루
      </p>
      <p className="mt-2 pb-4 text-center text-[11px] text-faint">
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
