"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isBasicProfileComplete } from "@/lib/profileGate";
import { currentUser, fetchMyProfileDb, hasSupabase } from "@/lib/supabase";
import { ShoeIllust } from "@/components/illustrations";

/* 앱 이용에는 대표 사진을 포함한 기본 회원 정보가 필요하다.
   구력과 사람 찾기 공개 여부로 둘러보기를 막지 않는다.
   모임 만들기·신청 등의 참여 조건은 해당 동작에서 확인한다. */

/* 막으면 안 되는 길:
   로그인·가입·프로필 작성은 당연하고, 내 정보(/me)와 약관·안전 설정도
   열어야 한다 — 안 그러면 프로필을 만들기 싫은 사람이 로그아웃·탈퇴를
   못 하고(애플 5.1.1), 가입 직후 약관을 눌러도 게이트에 막힌다(애플 1.2). */
const OPEN_PATHS = [
  "/login",
  "/signup",
  "/reset",
  "/auth/callback",
  "/profile/new",
  "/me",
  "/safety",
  "/terms",
  "/privacy",
];

/* 한 번 완성한 사람에게 화면을 옮길 때마다 다시 묻지 않는다.
   완성 전(false)은 캐시하지 않는다 — 방금 채웠을 수 있다.
   누구의 완성인지(uid)를 같이 들고 있는다 — 같은 폰에서 로그아웃 후
   다른 계정으로 들어오면 남의 캐시로 게이트가 뚫리기 때문. */
let completeUid: string | null = null;

/** 로그아웃·탈퇴 때 부른다 — SPA 라 페이지 리로드가 없어 모듈 상태가 남는다 */
export function resetProfileGate() {
  completeUid = null;
}

export default function RequireProfile({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const open = OPEN_PATHS.some((p) => pathname.startsWith(p));

  // null = 확인 중. 깜빡임을 막으려고 이때는 아무것도 그리지 않는다.
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    // 공개 경로 여부는 렌더에서 판단한다. 프로필 확인 결과를 덮어쓰지 않는다.
    if (!hasSupabase() || open) return;
    let alive = true;
    (async () => {
      const user = await currentUser();
      // 비로그인은 각 화면이 알아서 로그인 안내를 띄운다
      if (!user) {
        if (alive) setOk(true);
        return;
      }
      // 캐시는 같은 사람일 때만 믿는다
      if (completeUid === user.id) {
        if (alive) setOk(true);
        return;
      }
      const p = await fetchMyProfileDb();
      if (!alive) return;
      if (isBasicProfileComplete(p)) {
        completeUid = user.id;
        setOk(true);
      } else {
        completeUid = null; // 캐시가 다른 계정 것이었다면 지운다
        setOk(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [pathname, open]);

  if (!hasSupabase() || open) return <>{children}</>;
  if (ok === null) return null;
  if (ok) return <>{children}</>;

  return (
    <main className="px-4">
      <header className="flex flex-col items-center pt-16 text-center">
        <ShoeIllust size={72} />
        <h1 className="mt-5 text-[20px] font-bold leading-snug tracking-tight">
          기본 정보를 입력해주세요
        </h1>
      </header>

      <div className="mx-auto mt-5 max-w-sm">
        <Link
          href="/profile/new"
          className="button-primary block rounded-xl py-3.5 text-center text-[15px] font-semibold"
        >
          기본 정보 입력
        </Link>
      </div>

      <p className="mt-5 text-center text-[12px] text-faint">
        사람 찾기에 프로필을 공개하는 것은 선택입니다.
      </p>
    </main>
  );
}
