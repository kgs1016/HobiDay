"use client";

/* 내 프로필 — 남이 보는 내 모습 그대로: 사진·이름·메일, 클라이밍화(단계 기준),
   플레이어 리뷰. 설정 성격(프로필 수정~탈퇴·약관)은 아래 "내 정보" 한 줄로 뺐다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProfileShoe from "@/components/ProfileShoe";
import PlayerReviews from "@/components/PlayerReviews";
import { AvatarFallback, ChevronRightIcon } from "@/components/icons";
import type { MyProfile } from "@/lib/myProfile";
import { loadMyProfile } from "@/lib/myProfile";
import { visitFrequencyLabel } from "@/lib/visitFrequency";
import {
  hasSupabase,
  currentUser,
  fetchMyProfileDb,
  fetchUserProfile,
  signedPhotoUrls,
} from "@/lib/supabase";

export default function Me() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  /* 내 프로필을 남이 보는 모양 그대로 — 추천 수·리뷰 수 */
  const [mine, setMine] = useState<{ id: string; likes: number; reviews: number } | null>(null);
  const [loading, setLoading] = useState(true);

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
      setEmail(user.email ?? null);
      const [prof, me] = await Promise.all([fetchMyProfileDb(), fetchUserProfile(user.id)]);
      setProfile(prof);
      if (me.profile)
        setMine({ id: me.profile.id, likes: me.profile.likes, reviews: me.profile.reviews });
      setLoading(false);
      if (prof?.photo)
        setPhotoUrl((await signedPhotoUrls([prof.photo]))[prof.photo] ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading)
    return (
      <main className="px-4 pt-24 text-center text-[13.5px] text-faint">
        불러오는 중…
      </main>
    );

  return (
    <main>
      <header className="px-4 pt-6 pb-4">
        <h1 className="text-[20px] font-bold tracking-tight">내 프로필</h1>
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
            <AvatarFallback size={64} gender={profile?.gender} />
          )}
          <div className="min-w-0 flex-1">
            {profile ? (
              <p className="text-[17px] font-bold">{profile.nickname}</p>
            ) : (
              <>
                <p className="text-[15px] font-semibold">프로필이 아직 없어요</p>
                <Link
                  href="/profile/new"
                  className="mt-1 inline-block text-[13px] font-semibold text-accent-strong"
                >
                  프로필 만들기
                </Link>
              </>
            )}
            {email && (
              <p className="mt-0.5 truncate text-[11.5px] text-faint">{email}</p>
            )}
            {visitFrequencyLabel(profile?.visitFrequency) && <p className="mt-1 text-[12px] text-muted">클라이밍 {visitFrequencyLabel(profile?.visitFrequency)}</p>}
          </div>
        </div>
      </section>

      <ProfileShoe />

      {/* 내가 받은 리뷰 — 남의 프로필과 같은 칸 */}
      {mine && (
        <section className="px-4 pb-2">
          <PlayerReviews userId={mine.id} count={mine.reviews} likes={mine.likes} />
        </section>
      )}

      {/* 설정은 전부 한 줄 뒤에 — 눈에 띄게 테두리 버튼으로 */}
      <section className="mx-4 mt-3 border-t border-line pt-4 pb-2">
        <Link
          href="/me/settings"
          className="button-secondary flex items-center justify-between rounded-xl px-4 py-3.5 text-[15px] font-medium transition-colors active:bg-surface2"
        >
          내 정보
          <ChevronRightIcon size={16} className="text-muted" />
        </Link>
      </section>
    </main>
  );
}
