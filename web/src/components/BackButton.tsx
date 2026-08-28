"use client";

/* 뒤로 가기 — 네이티브 앱은 브라우저 뒤로가기가 없어서, 화면에 없으면
   그 화면에 갇힌다 (약관을 열었다가 못 돌아오는 식).
   히스토리가 있으면 온 길로, 없으면(딥링크·새 세션) fallback 으로 간다. */

import { useRouter } from "next/navigation";
import { ChevronLeftIcon } from "@/components/icons";

export default function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      aria-label="뒤로 가기"
      className="-ml-2 flex h-10 w-10 items-center justify-center text-ink"
    >
      <ChevronLeftIcon size={22} />
    </button>
  );
}
