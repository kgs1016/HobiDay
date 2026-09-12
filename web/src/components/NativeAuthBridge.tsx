"use client";

/* 앱에서 소셜 로그인을 마치고 돌아왔을 때를 받아주는 자리.
   화면을 그리지 않고 듣기만 한다. 로그인 화면이 아니라 레이아웃에 두는 이유는,
   로그인 창이 떠 있는 동안 앱이 뒤로 밀렸다가 돌아오면서 로그인 화면이
   사라져 있을 수 있기 때문이다. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { onNativeAuthReturn } from "@/lib/nativeAuth";
import { isNativePush, onPushTap, watchPushRegistration } from "@/lib/nativePush";

export default function NativeAuthBridge() {
  const router = useRouter();

  useEffect(
    () =>
      onNativeAuthReturn(async (ok) => {
        if (!ok) {
          alert("로그인을 완료하지 못했어요. 다시 시도해주세요.");
          router.replace("/login");
          return;
        }
        // 로그인이 막 성립한 순간 — 푸시 권한을 묻기 제일 자연스러운 때다
        // 주소를 직접 바꾸지 않고 라우터로 옮긴다 — 앱에는 서버가 없어서
        // 주소로 이동하면 파일을 찾는 단계를 다시 타게 된다.
        router.replace("/");
      }),
    [router]
  );

  // 이미 로그인된 채로 앱을 연 경우 — 토큰이 바뀌었을 수 있어 매번 갱신한다
  useEffect(() => {
    if (!isNativePush()) return;
    const stopRegistration = watchPushRegistration();
    const stopTap = onPushTap((url) => router.push(url));
    return () => { stopRegistration(); stopTap(); };
  }, [router]);

  // 네이티브 웹뷰의 파일 서버는 /login 같은 확장자 없는 주소를 만나면
  // 무조건 첫 화면 파일(index.html)로 대체한다. 그러면 주소는 /login 인데
  // 화면은 첫 화면인 꼬인 상태가 된다 — intro.html 의 "지금 가입하기",
  // 약관·방침 링크가 전부 이렇게 샜다. 여기서 주소를 읽어 라우터로
  // 제 화면까지 다시 걸어간다 (라우터 이동은 파일 서버를 안 탄다).
  useEffect(() => {
    if (!isNativePush()) return;
    const { pathname, search, hash } = window.location;
    const clean = pathname.replace(/\/+$/, "");
    if (clean && clean !== "" && !clean.includes(".")) {
      router.replace(clean + search + hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
