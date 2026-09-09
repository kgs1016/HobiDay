const REMEMBERED_EMAIL_KEY = "hobiday:remembered-email";

/** 로그인 편의용 이메일만 저장한다. 비밀번호와 인증 세션은 다루지 않는다. */
export function readRememberedEmail(): string {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    // 서버 렌더링이나 저장소가 차단된 브라우저에서도 로그인은 가능하다.
    return "";
  }
}

export function rememberEmail(email: string | null): void {
  try {
    if (email?.trim()) {
      window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
    } else {
      window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    }
  } catch {
    // 이메일을 기억하지 못해도 로그인 성공 처리는 계속한다.
  }
}
