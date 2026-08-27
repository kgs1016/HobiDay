"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { currentUser, fetchMyProfileDb } from "@/lib/supabase";

/** OAuth·이메일 인증 후 돌아오는 지점.
 *  supabase-js 가 URL의 code/토큰을 자동 처리하므로 세션만 확인하고 보낸다. */
export default function AuthCallback() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      // 세션 확립까지 짧게 재시도
      for (let i = 0; i < 8; i++) {
        const user = await currentUser();
        if (!alive) return;
        if (user) {
          const profile = await fetchMyProfileDb();
          router.replace(profile ? "/me" : "/profile/new");
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (alive) setFailed(true);
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <main className="px-4 pt-24 text-center">
      {failed ? (
        <>
          <p className="text-[15px] font-semibold">로그인을 완료하지 못했어요</p>
          <button
            onClick={() => router.replace("/login")}
            className="mt-5 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-semibold text-white active:bg-accent-pressed"
          >
            다시 시도하기
          </button>
        </>
      ) : (
        <p className="text-[14px] text-muted">로그인 중이에요…</p>
      )}
    </main>
  );
}
