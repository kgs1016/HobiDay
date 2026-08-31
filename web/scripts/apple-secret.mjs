/* Supabase Apple provider 용 client secret(JWT) 생성기.
 *
 * Supabase 는 .p8 키 파일이 아니라, 그 키로 서명한 JWT 를 받는다.
 * 온라인 생성기에 .p8 을 붙여넣는 건 키 유출이라 이 스크립트로 로컬에서 만든다.
 *
 *   node scripts/apple-secret.mjs <AuthKey_XXXX.p8 경로> <Team ID> <Key ID> <Services ID>
 *
 *   Team ID     — developer.apple.com > Membership (10자리)
 *   Key ID      — Keys 에서 만든 키의 ID (10자리)
 *   Services ID — 예: kr.hobiday.app.signin
 *
 * 출력된 JWT 를 Supabase > Authentication > Providers > Apple 의
 * Secret Key 칸에 붙여넣는다.
 *
 * ⚠️ 유효기간은 애플이 허용하는 최대치인 6개월이다. 만료되면 Apple
 *    로그인이 조용히 죽는다 — 만료 전에 이 스크립트로 다시 만들어
 *    갈아끼울 것 (아래에 만료일을 찍어준다).
 */

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const [, , p8Path, teamId, keyId, clientId] = process.argv;
if (!clientId) {
  console.error(
    "사용법: node scripts/apple-secret.mjs <AuthKey.p8 경로> <Team ID> <Key ID> <Services ID>"
  );
  process.exit(1);
}

const b64u = (v) => Buffer.from(v).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const exp = now + 15777000; // 애플 허용 최대 6개월

const header = b64u(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
const payload = b64u(
  JSON.stringify({
    iss: teamId,
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: clientId,
  })
);

const key = createPrivateKey(readFileSync(p8Path, "utf8"));
// JWT ES256 은 DER 이 아니라 r‖s 원시 서명을 쓴다
const sig = sign("sha256", Buffer.from(`${header}.${payload}`), {
  key,
  dsaEncoding: "ieee-p1363",
});

console.log(`${header}.${payload}.${b64u(sig)}`);
console.error(
  `\n만료일: ${new Date(exp * 1000).toLocaleDateString("ko-KR")} — ` +
    "그 전에 다시 생성해서 Supabase 에 갈아끼울 것"
);
