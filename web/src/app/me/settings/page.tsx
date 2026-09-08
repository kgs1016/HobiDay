"use client";

/* 내 정보 — 내 프로필 화면 아래 한 줄로 들어온다.
   프로필 수정부터 회원 탈퇴, 약관까지 "설정" 성격은 전부 여기. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import { resetProfileGate } from "@/components/RequireProfile";
import { ChevronRightIcon } from "@/components/icons";
import { unregisterPush } from "@/lib/nativePush";
import {
  getSupabase,
  hasSupabase,
  currentUser,
  deleteAccount,
  fetchAppFlags,
  fetchMyVideoCount,
} from "@/lib/supabase";

/* 설정 화면의 한 줄 — 카드를 만들지 않고 행 + divider 로 쌓는다 */
function MenuRow({ href, label, count }: { href: string; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border-b border-line py-3.5 text-[15px] last:border-b-0"
    >
      {label}
      <span className="flex items-center gap-1.5">
        {count !== undefined && <span className="font-semibold">{count}</span>}
        <ChevronRightIcon size={16} className="text-faint" />
      </span>
    </Link>
  );
}

export default function Settings() {
  const router = useRouter();
  // 카카오 계정은 이메일이 없을 수 있다 — 로그아웃·탈퇴는 로그인 여부로 판단한다
  const [authed, setAuthed] = useState(false);
  const [videoCount, setVideoCount] = useState(0);
  const [locked, setLocked] = useState(false); // 오픈 전 잠금 (테스터는 false)
  const [leaving, setLeaving] = useState(false); // 탈퇴 확인 패널
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!hasSupabase()) return;
      const user = await currentUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setAuthed(true);
      const [flags, vids] = await Promise.all([fetchAppFlags(), fetchMyVideoCount()]);
      if (flags) setLocked(!flags.sessions_open && !flags.people_open);
      setVideoCount(vids);
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

  return (
    <main>
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <BackButton fallback="/me" />
        <h1 className="text-[18px] font-bold tracking-tight">내 정보</h1>
      </header>

      <section className="px-4">
        <MenuRow href="/profile/new" label="프로필 수정" />
        {/* 커뮤니티에 올린 내 영상 */}
        <MenuRow href="/me/videos" label="내 영상" count={videoCount} />
        {/* 오픈 전 잠금 중엔 모임 화면이 닫혀 있어 눌러도 홈으로 튕긴다 — 숨긴다 */}
        {!locked && <MenuRow href="/session/mine" label="내가 만든 모임" />}
        {/* 끝난 모임은 홈에서도 채팅에서도 사라진다 — 여기가 유일한 통로 */}
        {!locked && <MenuRow href="/me/history" label="함께한 모임" />}
        {/* 끝난 모임의 리뷰 — 알림을 놓쳐도 일주일 동안 여기서 쓴다 */}
        {!locked && <MenuRow href="/me/reviews" label="리뷰 작성" />}
        <MenuRow href="/safety" label="안전 설정 · 차단 목록" />
        <MenuRow href="/support" label="고객센터 · 문의" />
      </section>

      <section className="border-t-8 border-surface2 px-4">
        <MenuRow href="/terms" label="이용약관" />
        <MenuRow href="/privacy" label="개인정보처리방침" />
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
            <li>· 주고받은 대화와 모임 기록이 사라져요 (상대방 쪽에서도)</li>
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
              className="button-secondary flex-1 rounded-xl py-3 text-[13.5px] font-medium"
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

      <p className="mt-8 pb-4 text-center text-[11.5px] text-faint">
        HOBIDAY — 취미로 시작해서, 사람으로 끝나는 하루
      </p>
    </main>
  );
}
