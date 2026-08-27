import Link from "next/link";
import type { MyProfile } from "@/lib/myProfile";
import { missingFields } from "@/lib/profileGate";
import { ChevronRightIcon } from "@/components/icons";

/* 프로필이 이미 완성된 유저에게는 안 뜬다.
   게이트를 통과한 뒤 나중에 사진을 지우는 등의 경우를 위한 안전망. */
export default function ProfileTodo({ profile }: { profile: MyProfile }) {
  const missing = missingFields(profile);
  if (missing.length === 0) return null;

  return (
    <Link
      href="/profile/new"
      className="flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">
          프로필에 {missing.join(" · ")}이 빠졌어요
        </p>
        <p className="mt-0.5 text-[12px] text-muted">
          채워야 사람 찾기에 내 프로필이 보여요
        </p>
      </div>
      <ChevronRightIcon size={16} className="shrink-0 text-accent" />
    </Link>
  );
}
