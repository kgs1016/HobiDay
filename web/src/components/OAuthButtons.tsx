"use client";

/* 소셜 로그인 버튼 묶음 — 로그인·회원가입 화면이 같은 걸 쓴다.
   대시보드에서 켠 공급자만 노출된다.
   버튼 색은 각 서비스의 브랜드 가이드 그대로 둔다 (우리 accent 가 아니다). */

import { useEffect, useState } from "react";
import { enabledOAuthProviders } from "@/lib/supabase";
import { signInWithProvider } from "@/lib/nativeAuth";

function KakaoLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#191600"
        d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.65l-.95 3.52c-.08.3.26.54.52.37l4.18-2.78c.52.07 1.05.11 1.59.11 5.52 0 10-3.54 10-7.87S17.52 3 12 3Z"
      />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}

const OAUTH = {
  kakao: {
    label: "카카오로 시작하기",
    cls: "bg-[#FEE500] text-[#191600]",
    Logo: KakaoLogo,
  },
  google: {
    label: "구글로 시작하기",
    cls: "border border-line bg-white text-[#1f1f1f]",
    Logo: GoogleLogo,
  },
} as const;

type Provider = keyof typeof OAUTH;

export default function OAuthButtons() {
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    enabledOAuthProviders().then((list) =>
      setProviders(list.filter((p): p is Provider => p in OAUTH))
    );
  }, []);

  if (providers.length === 0) return null;

  const oauth = async (provider: Provider) => {
    // 웹은 주소 이동, 앱은 시스템 브라우저 — 갈림은 nativeAuth 가 맡는다
    const { error } = await signInWithProvider(provider);
    if (error) alert(`${OAUTH[provider].label} 실패: ${error}`);
  };

  return (
    <div className="mb-5 flex flex-col gap-2">
      {providers.map((p) => {
        const { label, cls, Logo } = OAUTH[p];
        return (
          <button
            key={p}
            onClick={() => oauth(p)}
            className={`flex items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold ${cls}`}
          >
            <Logo />
            {label}
          </button>
        );
      })}
      <div className="my-1 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-[12px] text-faint">또는 이메일로</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
