"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StartingShoePicker from "@/components/StartingShoePicker";
import { fetchClimbingProgress, isAscentPreview } from "@/lib/climbingAscents";
import { currentUser, fetchMyProfileDb, hasSupabase, setMyProfileVisibility } from "@/lib/supabase";
import { loadMyProfile, saveMyProfile } from "@/lib/myProfile";
import { isBasicProfileComplete } from "@/lib/profileGate";
import { useQueryParam } from "@/lib/queryId";
import { PROFILE_REQUIRED_MESSAGE, participationProfileHref, safeParticipationReturn } from "@/lib/participation";

export default function ProfileShoeSetup() {
  const router = useRouter();
  const returnParam = useQueryParam('returnTo');
  const publishParam = useQueryParam('publish');
  const destination = safeParticipationReturn(returnParam) ?? '/me';
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const finish = useCallback(async () => {
    if (publishParam === '1') {
      if (hasSupabase()) {
        const r = await setMyProfileVisibility(true);
        if (r.error) throw new Error('공개 설정을 저장하지 못했어요. 다시 시도해주세요');
      } else {
        const profile = loadMyProfile();
        if (profile) saveMyProfile({...profile, isPublic: true});
      }
    }
    router.replace(destination);
  }, [publishParam, destination, router]);
  useEffect(() => {
    if (returnParam === undefined || publishParam === undefined) return;
    let active = true;
    (async () => {
      try {
        await Promise.resolve();
        if (!active) return;
        if (hasSupabase() ? !(await currentUser()) : !isAscentPreview()) {
          if (active) router.replace("/login");
          return;
        }
        const profile = hasSupabase() ? await fetchMyProfileDb() : loadMyProfile();
        if (!active) return;
        if (hasSupabase() && !profile) throw new Error('회원 정보를 불러오지 못했어요');
        if (!isBasicProfileComplete(profile)) {
          alert(PROFILE_REQUIRED_MESSAGE);
          router.replace(participationProfileHref(destination));
          return;
        }
        const progress = await fetchClimbingProgress();
        if (!active) return;
        if (progress.starting_shoe) { await finish(); return; }
        if (progress.can_set_start !== true) throw new Error("설정 정보를 불러오지 못했어요");
        setReady(true);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "설정 정보를 불러오지 못했어요");
      }
    })();
    return () => { active = false; };
  }, [attempt, router, returnParam, publishParam, destination, finish]);
  const saved = async () => {
    setReady(false);
    try { await finish(); }
    catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했어요'); }
  };
  const leave = () => router.replace('/');
  return <main className="px-5 pb-4">
    <header className="pt-6">
      <p className="text-[12px] font-medium text-muted">클라이밍화 설정 · 필수</p>
      <h1 className="mt-2 text-[22px] font-bold tracking-tight">시작 클라이밍화를 골라주세요</h1>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">최근 완등 기록에 따라 바뀌어요</p>
    </header>
    {ready ? <StartingShoePicker onboarding skipLabel="홈으로" onSkip={leave} onSaved={saved} /> : error ? <div role="alert" className="py-10 text-center">
      <p className="text-[13px] text-muted">{error}</p>
      <button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}
        className="button-secondary mt-4 min-h-12 w-full rounded-xl text-[14px] font-semibold">다시 불러오기</button>
      <button type="button" onClick={leave} className="mt-2 min-h-11 w-full text-[13px] text-muted">홈으로</button>
    </div> : <p role="status" className="py-12 text-center text-[13px] text-muted">설정 정보 불러오는 중…</p>}
  </main>;
}
