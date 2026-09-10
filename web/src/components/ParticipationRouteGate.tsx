"use client";
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { requireParticipationProfile } from '@/lib/participation';
const CREATION_PATHS = new Set(['/session/new', '/community/write', '/videos/upload']);
function Check({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void requireParticipationProfile(router, undefined, controller.signal).then(ok => {
      if (!controller.signal.aborted) { setReady(ok); setFailed(!ok); }
    });
    return () => controller.abort();
  }, [router, retry]);
  if (ready) return children;
  return <main className="px-4 pt-24 text-center text-sm text-muted" role="status">
    {failed ? <button type="button" onClick={() => { setFailed(false); setRetry(n => n + 1); }} className="button-secondary rounded-lg px-4 py-3">다시 확인</button> : '회원 정보 확인 중…'}
  </main>;
}
/** 작성 화면만 먼저 확인한다. 목록·상세·설정은 그대로 열어둔다. */
export default function ParticipationRouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return CREATION_PATHS.has(pathname.replace(/\/$/, '')) ? <Check key={pathname}>{children}</Check> : children;
}
