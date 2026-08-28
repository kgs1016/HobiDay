"use client";

/* 비밀번호 재설정 — 이메일 가입자의 유일한 복구 수단.
   가입과 같은 인증번호(OTP) 방식이다: 링크는 네이티브 앱에서 앱 밖으로
   나가버려서, 메일의 6자리 번호를 이 화면에 입력하는 흐름만 성립한다.

   1. 이메일 입력 → 재설정 메일 발송
   2. 메일의 인증번호 입력 → 본인 확인 (이 순간 로그인된다)
   3. 새 비밀번호 2번 입력 → 변경 완료 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import BackButton from "@/components/BackButton";

const inputCls =
  // iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 — 16px 유지
  "w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none";

type Step = "email" | "otp" | "password";

export default function Reset() {
  const router = useRouter();
  const sb = getSupabase();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  if (!sb) {
    return (
      <main className="px-4 pt-16 text-center">
        <p className="text-[15px] font-bold">일시적인 오류예요</p>
        <p className="mt-2 text-[13px] text-muted">잠시 후 다시 시도해주세요.</p>
      </main>
    );
  }

  const sendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return alert("이메일을 확인해주세요");
    setBusy(true);
    const { error } = await sb.auth.resetPasswordForEmail(email);
    setBusy(false);
    // 존재하지 않는 이메일이어도 성공처럼 진행한다 — 실패를 알려주면
    // "이 이메일이 가입돼 있는지" 를 아무나 조회할 수 있게 된다
    if (error && !error.message.includes("rate limit")) {
      return alert("메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.");
    }
    setStep("otp");
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = otp.trim();
    if (!/^\d{6,8}$/.test(token)) return alert("메일의 인증번호를 입력해주세요");
    setBusy(true);
    const { error } = await sb.auth.verifyOtp({ email, token, type: "recovery" });
    setBusy(false);
    if (error) {
      return alert(
        error.message.includes("expired")
          ? "인증번호가 만료됐어요. 처음부터 다시 받아주세요."
          : "인증번호가 맞지 않아요. 메일을 다시 확인해주세요."
      );
    }
    setStep("password");
  };

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return alert("비밀번호는 6자 이상으로 해주세요");
    if (pw !== pw2) return alert("비밀번호가 서로 달라요. 다시 확인해주세요.");
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      return alert(
        error.message.includes("different from the old")
          ? "이전과 같은 비밀번호예요. 다른 비밀번호로 해주세요."
          : "변경하지 못했어요. 잠시 후 다시 시도해주세요."
      );
    }
    alert("비밀번호가 바뀌었어요!");
    // verifyOtp 로 이미 로그인된 상태다
    router.replace("/");
  };

  return (
    <main className="px-4">
      <div className="pt-5">
        <BackButton fallback="/login" />
      </div>
      <header className="pt-3 pb-6 text-center">
        <p className="text-[14px] font-bold tracking-[2px] text-accent">
          HOBIDAY
        </p>
        <h1 className="mt-3 text-[21px] font-bold tracking-tight">
          비밀번호 재설정
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {step === "email" && "가입한 이메일로 인증번호를 보내드려요"}
          {step === "otp" && "메일함의 6자리 번호를 입력해주세요"}
          {step === "password" && "새 비밀번호를 정해주세요"}
        </p>
      </header>

      {step === "email" && (
        <form onSubmit={sendMail} className="flex flex-col gap-2.5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            autoComplete="email"
            className={inputCls}
          />
          <button
            disabled={busy}
            className="mt-1 rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-white active:bg-accent-pressed disabled:opacity-50"
          >
            {busy ? "보내는 중…" : "인증번호 받기"}
          </button>
          <p className="mt-2 text-center text-[12px] leading-relaxed text-muted">
            카카오·구글로 가입하셨다면 비밀번호가 없어요.
            <br />
            로그인 화면에서 소셜 버튼으로 들어와주세요.
          </p>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={verifyCode} className="mx-auto max-w-[280px]">
          <p className="mb-3 text-center text-[13px] text-muted">
            <b className="font-semibold text-ink">{email}</b> 메일함을 확인해주세요
          </p>
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="w-full rounded-lg border border-line bg-surface px-4 py-3.5 text-center text-[22px] font-semibold tracking-[0.3em] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || otp.length < 6}
            className="mt-3 w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-white active:bg-accent-pressed disabled:opacity-40"
          >
            {busy ? "확인 중…" : "확인"}
          </button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="mt-4 w-full text-center text-[13px] font-medium text-muted"
          >
            메일이 안 왔나요? 다시 보내기
          </button>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={changePw} className="flex flex-col gap-2.5">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="새 비밀번호 (6자 이상)"
            autoComplete="new-password"
            className={inputCls}
          />
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="새 비밀번호 확인"
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
            {busy ? "변경 중…" : "비밀번호 바꾸기"}
          </button>
        </form>
      )}

      <Link
        href="/login"
        className="mt-6 block w-full text-center text-[13px] font-medium text-muted"
      >
        로그인으로 돌아가기
      </Link>
    </main>
  );
}
