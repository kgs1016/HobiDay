import Link from "next/link";
import type { MyProfile } from "@/lib/myProfile";
import { missingFields } from "@/lib/profileGate";
import { ChevronRightIcon } from "@/components/icons";

/* 사람 찾기를 공개한 회원에게만 빠진 공개 프로필 항목을 안내한다. */
export default function ProfileTodo({ profile }: { profile: MyProfile }) {
  if (!profile.isPublic) return null;
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
      </div>
      <ChevronRightIcon size={16} className="shrink-0 text-accent" />
    </Link>
  );
}
