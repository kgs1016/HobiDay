"use client";

/* 회원가입 — 로그인과 한 화면에서 글자만 바뀌던 것을 분리했다.
   같은 입력칸에 제목만 바뀌면 지금 뭘 하는 중인지 알아차리기 어렵고,
   비밀번호 확인칸이 없으면 오타 난 채로 가입되어 다시 못 들어온다
   (비밀번호 재설정 흐름이 아직 없다). */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import BackButton from "@/components/BackButton";
import OAuthButtons from "@/components/OAuthButtons";

/* 인증번호 대기 상태를 저장해 둔다 — 메일 앱에 갔다 오는 게 이 흐름에서
   가장 흔한 동작인데, 그때마다 처음부터 다시 시작하면 안 된다. */
const OTP_KEY = "hobiday.signup.otp";
const OTP_TTL = 30 * 60 * 1000; // 인증번호 수명보다 넉넉히

const saveOtpState = (email: string) =>
  localStorage.setItem(OTP_KEY, JSON.stringify({ email, at: Date.now() }));
const clearOtpState = () => localStorage.removeItem(OTP_KEY);
const loadOtpState = (): string | null => {
  try {
    const raw = localStorage.getItem(OTP_KEY);
    if (!raw) return null;
    const { email, at } = JSON.parse(raw);
    if (typeof email !== "string" || Date.now() - at > OTP_TTL) {
      clearOtpState();
      return null;
    }
    return email;
  } catch {
    return null;
  }
};

const inputCls =
  // iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 — 16px 유지
  "w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export default function Signup() {
  const router = useRouter();
  const sb = getSupabase();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState(""); // 가입 확인 인증번호 (메일의 6자리)
  const [sentMail, setSentMail] = useState(false);

  // 메일 확인하러 나갔다 돌아와도(앱 재시작 포함) 인증번호 화면을 복원한다
  useEffect(() => {
    const saved = loadOtpState();
    if (saved) {
      setEmail(saved);
      setSentMail(true);
    }
  }, []);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return alert("이메일을 확인해주세요");
    if (pw.length < 6) return alert("비밀번호는 6자 이상으로 해주세요");
    if (pw !== pw2) return alert("비밀번호가 서로 달라요. 다시 확인해주세요.");

    setBusy(true);
    // 링크 대신 인증번호로 확인한다 — 메일 템플릿이 {{ .Token }} 을 보여주고,
    // 사용자는 이 화면에 남아 번호만 입력한다. 메일 앱으로 넘어갔다가
    // 낯선 브라우저에서 이어지는 흐름보다 끊김이 없고, 네이티브 앱에서는
    // 링크가 앱 밖으로 나가버려서 사실상 이 방식만 성립한다.
    const { data, error } = await sb.auth.signUp({ email, password: pw });
    setBusy(false);
    if (error) {
      // Supabase 원문은 영어다 — 사용자가 고칠 수 있는 말로 바꿔서 보여준다
      const m = error.message.toLowerCase();
      return alert(
        m.includes("already registered")
          ? "이미 가입된 이메일이에요. 로그인해주세요."
          : m.includes("password")
            ? "비밀번호는 6자 이상으로 해주세요."
            : m.includes("email")
              ? "이메일 주소를 다시 확인해주세요."
              : m.includes("rate") || m.includes("seconds")
                ? "요청이 너무 잦아요. 잠시 후 다시 시도해주세요."
                : "가입하지 못했어요. 잠시 후 다시 시도해주세요."
      );
    }
    // 이메일 확인이 켜져 있으면 세션 없이 확인 메일이 발송됨
    if (!data.session) {
      saveOtpState(email);
      setSentMail(true);
      return;
    }
    router.push("/profile/new");
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = otp.trim();
    // 자릿수는 프로젝트 설정(Email OTP Length)을 따른다 — 범위로 받아
    // 설정이 바뀌어도 화면이 깨지지 않게 한다
    if (!/^\d{6,8}$/.test(token)) return alert("메일의 인증번호를 입력해주세요");

    setBusy(true);
    const { error } = await sb.auth.verifyOtp({ email, token, type: "signup" });
    setBusy(false);
    if (error) {
      return alert(
        error.message.includes("expired")
          ? "인증번호가 만료됐어요. 다시 받아주세요."
          : "인증번호가 맞지 않아요. 메일을 다시 확인해주세요."
      );
    }
    // 인증과 동시에 로그인된다
    clearOtpState();
    router.push("/profile/new");
  };

  const resendCode = async () => {
    setBusy(true);
    const { error } = await sb.auth.resend({ type: "signup", email });
    setBusy(false);
    if (error) {
      // SMTP 의 사용자당 최소 간격(20초)에 걸리면 여기로 온다
      return alert("잠시 후 다시 시도해주세요.");
    }
    alert("인증번호를 다시 보냈어요.");
  };

  if (sentMail) {
    return (
      <main className="px-4 pt-20 text-center">
        <h1 className="text-[20px] font-bold">인증번호를 보냈어요</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          <b className="font-semibold text-ink">{email}</b> 메일함을 확인해주세요.
          <br />
          메일에 적힌 6자리 번호를 입력하면 가입이 완료돼요.
        </p>
        <form onSubmit={verifyCode} className="mx-auto mt-6 max-w-[280px]">
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            // 숫자뿐이라 크게 — iOS 확대(16px 미만) 걱정도 없다
            className="w-full rounded-lg border border-line bg-surface px-4 py-3.5 text-center text-[22px] font-semibold tracking-[0.3em] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || otp.length < 6}
            className="mt-3 w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-white active:bg-accent-pressed disabled:opacity-40"
          >
            {busy ? "확인 중…" : "인증하고 가입 완료"}
          </button>
        </form>
        <button
          onClick={resendCode}
          disabled={busy}
          className="mt-5 text-[13px] font-medium text-muted underline underline-offset-4 disabled:opacity-50"
        >
          인증번호 다시 받기
        </button>
        <br />
        <Link
          href="/login"
          onClick={clearOtpState}
          className="mt-3 inline-block text-[13px] font-medium text-faint"
        >
          로그인으로 돌아가기
        </Link>
      </main>
    );
  }

  return (
    <main className="px-4">
      <div className="pt-5">
        <BackButton fallback="/" />
      </div>
      <header className="pt-3 pb-6 text-center">
        <p className="text-[14px] font-bold tracking-[2px] text-accent">
          HOBIDAY
        </p>
        <h1 className="mt-3 text-[21px] font-bold tracking-tight">
          회원가입
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          취미로 시작해서, 사람으로 끝나는 하루
        </p>
      </header>

      <OAuthButtons />

      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          className={inputCls}
        />
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="비밀번호 (6자 이상)"
          autoComplete="new-password"
          className={inputCls}
        />
        <input
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          placeholder="비밀번호 확인"
          autoComplete="new-password"
          className={inputCls}
        />
        {pw2.length > 0 && pw !== pw2 && (
          <p className="text-[12px] font-medium text-danger">
            비밀번호가 서로 달라요
          </p>
        )}
        <button
          disabled={busy}
          className="mt-1 rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-white active:bg-accent-pressed disabled:opacity-50"
        >
          {busy ? "처리 중…" : "가입하기"}
        </button>
      </form>

      {/* 애플 심사 1.2 — UGC 앱은 약관 동의가 가입 흐름에 보여야 한다.
          소셜·이메일 어느 쪽으로 가입하든 이 화면을 지나므로 여기 둔다. */}
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
        href="/login"
        className="mt-5 block w-full text-center text-[13px] font-medium text-muted"
      >
        이미 계정이 있으신가요?{" "}
        <span className="font-semibold text-accent-pressed">로그인</span>
      </Link>
    </main>
  );
}
