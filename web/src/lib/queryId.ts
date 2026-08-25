"use client";

import { useEffect, useState } from "react";

/** 주소의 ?id= 를 읽는다.
 *
 *  정적 내보내기(next.config 의 output: 'export')는 /room/[id] 같은 동적
 *  경로를 만들지 못한다 — 빌드 시점에 id 목록을 알 수 없기 때문이다.
 *  네이티브 앱은 서버 없이 파일만 들고 도는 구조라 정적 내보내기가 필수라,
 *  경로 대신 쿼리로 받는다.
 *
 *  useSearchParams 를 쓰면 페이지 전체를 Suspense 로 감싸야 해서
 *  window 에서 직접 읽는다 (로그인 화면의 ?mode= 처리와 같은 방식).
 *
 *  반환값: undefined = 아직 못 읽음(첫 렌더), null = 없음, string = id
 */
export function useQueryId(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);

  return id;
}

/** 같은 방식으로 아무 쿼리 값이나 읽는다 (?room=, ?from= 등) */
export function useQueryParam(name: string): string | null | undefined {
  const [v, setV] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setV(new URLSearchParams(window.location.search).get(name));
  }, [name]);

  return v;
}
