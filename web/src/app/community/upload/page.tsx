"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 예전에 저장한 업로드 주소도 새 영상 탭으로 연결한다. */
export default function LegacyVideoUpload() {
  const router = useRouter();
  useEffect(() => { router.replace("/videos/upload"); }, [router]);
  return <main className="px-4 pt-16 text-center text-sm text-faint" role="status">영상 올리기로 이동 중…</main>;
}
