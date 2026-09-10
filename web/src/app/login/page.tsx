"use client";

/* 로그인 — 회원가입은 /signup 별도 화면이다.
   전에는 한 화면에서 제목·버튼 글자만 바뀌어서, 지금 로그인 중인지
   가입 중인지 알아차리기 어려웠다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { useHydrated } from "@/lib/browserState";
import { readRememberedEmail, rememberEmail } from "@/lib/loginPreferences";
import OAuthButtons from "@/components/OAuthButtons";
import { ChevronLeftIcon } from "@/components/icons";

const inputCls =
  // iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 — 16px 유지
  "w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none";

function EmailLoginForm() {
  const router = useRouter();
  const [initialEmail] = useState(readRememberedEmail);
  const [remember, setRemember] = useState(Boolean(initialEmail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const sb = getSupabase();
    if (!sb) return;

    // 자동완성은 React change 이벤트 없이 값을 채우기도 한다.
    // 제출 시 실제 입력값을 읽고, 로그인 성공 시에만 이메일을 기억한다.
    const form = new FormData(e.currentTarget);
    const email = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await sb.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(
          authError.message.includes("Email not confirmed")
            ? "이메일 인증이 아직이에요. 회원가입 화면에서 같은 이메일로 다시 진행하면 인증번호를 새로 받을 수 있어요."
            : "이메일 또는 비밀번호가 맞지 않아요."
        );
        setBusy(false);
        return;
      }
      rememberEmail(remember ? email : null);
      // 비밀번호 관리자가 성공한 로그인을 감지하도록 폼의 값은 유지한 채 이동한다.
      router.replace("/me");
    } catch {
      setError("로그인하지 못했어요. 연결을 확인하고 다시 시도해주세요.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} autoComplete="on" aria-label="이메일 로그인" className="flex flex-col gap-2.5">
      <label htmlFor="login-email" className="sr-only">이메일</label>
      <input
        id="login-email"
        name="username"
        type="email"
        defaultValue={initialEmail}
        placeholder="이메일"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        readOnly={busy}
        className={inputCls}
      />
      <label htmlFor="login-password" className="sr-only">비밀번호</label>
      <input
        id="login-password"
        name="password"
        type="password"
        placeholder="비밀번호"
        autoComplete="current-password"
        required
        minLength={6}
        readOnly={busy}
        className={inputCls}
      />
      <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-[13px] text-muted">
        <input
          type="checkbox"
          checked={remember}
          disabled={busy}
          onChange={(e) => {
            setRemember(e.target.checked);
            if (!e.target.checked) rememberEmail(null);
          }}
          className="h-4 w-4 accent-ink"
        />
        이메일 기억하기
      </label>
      {error && <p role="alert" className="text-[13px] leading-relaxed text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="button-primary rounded-xl py-3.5 text-[15px] font-semibold"
      >
        {busy ? "처리 중…" : "로그인"}
      </button>
      <Link
        href="/reset"
        className="mt-1 text-center text-[12.5px] font-medium text-muted underline underline-offset-4"
      >
        비밀번호를 잊으셨나요?
      </Link>
    </form>
  );
}

export default function Login() {
  const router = useRouter();
  const sb = getSupabase();
  const hydrated = useHydrated();

  useEffect(() => {
    // 이전 소개 페이지에서 배포한 가입 주소(?mode=signup)도 계속 지원한다.
    // useSearchParams 를 쓰면 이 페이지가 Suspense 를 요구해서 window 로 읽는다.
    if (new URLSearchParams(window.location.search).get("mode") === "signup") {
      router.replace("/signup");
    }
  }, [router]);

  if (!sb) {
    return (
      <main className="px-4 pt-16 text-center">
        <p className="text-[15px] font-bold">Supabase 설정이 필요해요</p>
        <p className="mt-2 text-[13px] text-muted">
          web/.env.local 에 프로젝트 키를 넣어주세요
        </p>
      </main>
    );
  }

  return (
    <main className="px-4">
      {/* 로그아웃이 replace 로 와서 히스토리가 꼬여 있을 수 있다 —
          항상 첫 화면(하비데이가 뭔가요? 가 있는)으로 보낸다 */}
      <div className="pt-5">
        <Link
          href="/"
          aria-label="처음으로"
          className="-ml-2 flex h-10 w-10 items-center justify-center text-ink"
        >
          <ChevronLeftIcon size={22} />
        </Link>
      </div>
      <header className="pt-3 pb-6 text-center">
        <p className="text-[14px] font-bold tracking-[2px] text-accent">
          HOBIDAY
        </p>
        <h1 className="mt-3 text-[21px] font-bold tracking-tight">
          로그인
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          취미로 시작해서, 사람으로 끝나는 하루
        </p>
      </header>

      <OAuthButtons />

      {hydrated ? <EmailLoginForm /> : <div className="h-[256px]" aria-busy="true" />}

      {/* 애플 심사 1.2 — UGC 앱은 약관 동의가 가입 흐름에 보여야 한다.
          소셜 로그인은 이 화면에서 바로 가입될 수 있어서 여기에도 둔다. */}
      <p className="mt-4 text-center text-[11.5px] leading-relaxed text-faint">
        가입하면 하비데이의{" "}
        <Link href="/terms" className="underline underline-offset-2 text-muted">
          이용약관
        </Link>
        과{" "}
        <Link href="/privacy" className="underline underline-offset-2 text-muted">
          개인정보처리방침
        </Link>
        에 동의하는 것으로 봅니다.
      </p>

      <Link
        href="/signup"
        className="mt-5 block w-full text-center text-[13px] font-medium text-muted"
      >
        계정이 없으신가요?{" "}
        <span className="font-semibold text-accent-strong">회원가입</span>
      </Link>
    </main>
  );
}
