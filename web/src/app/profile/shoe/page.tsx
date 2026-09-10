"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StartingShoePicker from "@/components/StartingShoePicker";
import { fetchClimbingProgress, isAscentPreview } from "@/lib/climbingAscents";
import { currentUser, hasSupabase } from "@/lib/supabase";
import { isBasicProfileComplete } from "@/lib/profileGate";
import { loadMyProfile } from "@/lib/myProfile";

export default function ProfileShoeSetup() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (hasSupabase() ? !(await currentUser()) : !isAscentPreview()) {
          if (active) router.replace("/login");
          return;
        }
        // 운영에서는 RequireProfile이 기본 정보 완료 여부를 확인한다.
        if (isAscentPreview() && !isBasicProfileComplete(loadMyProfile())) {
          if (active) router.replace("/profile/new");
          return;
        }
        const progress = await fetchClimbingProgress();
        if (!active) return;
        if (progress.starting_shoe || progress.can_set_start === false) {
          router.replace("/me");
          return;
        }
        if (progress.can_set_start !== true) throw new Error("설정 정보를 불러오지 못했어요");
        setReady(true);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "설정 정보를 불러오지 못했어요");
      }
    })();
    return () => { active = false; };
  }, [attempt, router]);

  const finish = () => router.replace("/me");
  return <main className="px-5 pb-4">
    <header className="pt-6">
      <p className="text-[12px] font-medium text-muted">프로필 완성 · 2 / 2</p>
      <h1 className="mt-2 text-[22px] font-bold tracking-tight">시작 암벽화를 골라주세요</h1>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">처음 한 번 설정할 수 있어요.<br />3개월 후부터는 최근 완등 기록에 따라 바뀌어요.</p>
    </header>
    {ready ? <StartingShoePicker onboarding onSkip={finish} onSaved={finish} /> : error ? <div role="alert" className="py-10 text-center">
      <p className="text-[13px] text-muted">{error}</p>
      <button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}
        className="button-secondary mt-4 min-h-12 w-full rounded-xl text-[14px] font-semibold">다시 불러오기</button>
      <button type="button" onClick={finish} className="mt-2 min-h-11 w-full text-[13px] text-muted">나중에 설정</button>
    </div> : <p role="status" className="py-12 text-center text-[13px] text-muted">설정 정보 불러오는 중…</p>}
  </main>;
}
