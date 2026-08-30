/* 푸시 발송 — 앱이 "이 사람에게 알림 보내줘" 라고 부르는 서버.
 *
 *  왜 서버가 따로 필요한가: 발송 비밀키(FCM 서비스 계정, APNs .p8)를 앱에
 *  넣으면 누구나 꺼내서 아무에게나 알림을 쏠 수 있다. 키는 여기에만 둔다.
 *
 *  플랫폼별로 경로가 다르다:
 *    android → FCM (Firebase)
 *    ios     → APNs 직접 (Firebase 안 거침 — iOS 앱에 Firebase SDK 를
 *              심지 않아도 되고, 네이티브 코드 수정이 0 이 된다)
 *
 *  부르는 길이 둘이다.
 *
 *    ① 앱 (유저 JWT) → 이 함수
 *        → can_notify() 로 관계 검사 (매칭·관심·같은 모임만, 차단 거부)
 *        → push_tokens 에서 상대 기기 토큰 조회
 *        → 플랫폼별 발송, 죽은 토큰은 그 자리에서 정리
 *
 *    ② 크론 (service role) → 이 함수 { drain: true }
 *        → notifications 에서 아직 안 보낸 줄을 집어 그대로 발송
 *
 *  ②가 있는 이유: DB 는 밖으로 HTTP 를 못 쏜다. 크론이 남기는 알림
 *  ("오늘 모임이 있어요" 등)은 알림함에만 쌓이고 폰은 조용했다.
 *  notifications 를 발송 대기열로 쓰고, 밖에서 그걸 비운다.
 *  대기열의 줄은 넣을 때 이미 누가 받을지 정해진 것이라 관계 검사를
 *  다시 하지 않는다 — 서버가 "이 사람이 알아야 한다" 고 판단한 결과다.
 *
 *  필요한 secret (supabase secrets set):
 *    FIREBASE_SERVICE_ACCOUNT  Firebase > 프로젝트 설정 > 서비스 계정 JSON (android)
 *    APNS_KEY                  애플 .p8 파일 내용 통째로            (ios)
 *    APNS_KEY_ID               키 발급 화면의 Key ID (10자리)        (ios)
 *    APPLE_TEAM_ID             개발자 계정 Team ID                  (ios)
 *  없는 쪽은 조용히 건너뛴다 (앱 동작을 막지 않는다).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@5";

const APNS_TOPIC = "kr.hobiday.app"; // 번들 ID 와 같아야 한다

type Body = {
  to: string[]; // 받는 사람 user id (최대 8명 — 모임 채팅용)
  title: string;
  body: string;
  url?: string; // 탭하면 열 앱 내 경로 (예: /chat)
};

/* ── FCM (android) ── */

let fcmCached: { value: string; exp: number } | null = null;

async function fcmAccessToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  if (fcmCached && fcmCached.exp > now + 60) return fcmCached.value;

  const key = await importPKCS8(sa.private_key, "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`fcm token exchange failed: ${JSON.stringify(j)}`);
  fcmCached = { value: j.access_token, exp: now + 3500 };
  return j.access_token;
}

/** 성공 true · 죽은 토큰 "dead" · 그 외 실패 false */
async function sendFcm(
  sa: { project_id: string; client_email: string; private_key: string },
  token: string,
  title: string,
  body: string,
  url: string
): Promise<true | false | "dead"> {
  const access = await fcmAccessToken(sa);
  const r = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { url },
          android: { priority: "high" },
        },
      }),
    }
  );
  if (r.ok) return true;
  if (r.status === 404 || r.status === 400) return "dead";
  return false;
}

/* ── APNs (ios) ── */

let apnsCached: { value: string; exp: number } | null = null;

async function apnsJwt(p8: string, keyId: string, teamId: string) {
  const now = Math.floor(Date.now() / 1000);
  // 애플은 20~60분짜리 토큰을 요구한다 — 40분마다 갱신
  if (apnsCached && apnsCached.exp > now + 60) return apnsCached.value;

  const key = await importPKCS8(p8, "ES256");
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .sign(key);
  apnsCached = { value: jwt, exp: now + 2400 };
  return jwt;
}

async function apnsPost(host: string, jwt: string, token: string, payload: unknown) {
  return fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify(payload),
  });
}

async function sendApns(
  p8: string,
  keyId: string,
  teamId: string,
  token: string,
  title: string,
  body: string,
  url: string
): Promise<true | false | "dead"> {
  const jwt = await apnsJwt(p8, keyId, teamId);
  const payload = { aps: { alert: { title, body }, sound: "default" }, url };

  let r = await apnsPost("https://api.push.apple.com", jwt, token, payload);
  if (r.status === 400) {
    // 개발용 빌드(Xcode 직접 설치)는 sandbox 토큰이라 운영 서버가 거부한다
    const reason = (await r.json().catch(() => ({})))?.reason;
    if (reason === "BadDeviceToken") {
      r = await apnsPost("https://api.sandbox.push.apple.com", jwt, token, payload);
    }
  }
  if (r.ok) return true;
  if (r.status === 410) return "dead"; // 앱 삭제됨
  return false;
}

/* ── 기기 하나에 한 건 보내기 ──
   두 경로(앱·대기열)가 같은 방식으로 보내야 해서 따로 뺐다.
   죽은 토큰은 쌓아두면 매번 실패만 반복하므로 그 자리에서 지운다. */
type Sender = {
  sa: { project_id: string; client_email: string; private_key: string } | null;
  apnsKey?: string;
  apnsKeyId?: string;
  teamId?: string;
};

async function deliver(
  // deno-lint-ignore no-explicit-any
  admin: any,
  s: Sender,
  tok: { token: string; platform: string },
  title: string,
  text: string,
  url: string
): Promise<boolean> {
  let result: true | false | "dead" = false;
  try {
    if (tok.platform === "android" && s.sa) {
      result = await sendFcm(s.sa, tok.token, title, text, url);
    } else if (tok.platform === "ios" && s.apnsKey && s.apnsKeyId && s.teamId) {
      result = await sendApns(s.apnsKey, s.apnsKeyId, s.teamId, tok.token, title, text, url);
    } else {
      return false; // 이 플랫폼의 발송 경로가 아직 미설정
    }
  } catch {
    result = false;
  }
  if (result === "dead") {
    await admin.from("push_tokens").delete().eq("token", tok.token);
    return false;
  }
  return result === true;
}

/* ── 본체 ── */

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  /* 대기열을 비우러 온 것인가. service role 키로만 들어올 수 있다 —
     이 모드는 관계 검사를 건너뛰므로 유저가 흉내낼 수 있으면 안 된다. */
  const draining = authHeader === `Bearer ${serviceKey}`;

  let me: string | undefined;
  if (!draining) {
    // 호출자 확인 — verify_jwt 로 서명은 이미 검증됐고, 여기서 uid 를 꺼낸다
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supa.auth.getUser();
    me = userData?.user?.id;
    if (!me) return Response.json({ error: "no_auth" }, { status: 401 });
  }

  let body: Body = {} as Body;
  try {
    body = await req.json();
  } catch {
    // 대기열 비우기는 본문이 없어도 된다 — 보낼 것은 DB 가 안다
    if (!draining) return Response.json({ error: "bad_json" }, { status: 400 });
  }

  let to: string[] = [];
  let title = "";
  let text = "";
  let url = "/";
  if (!draining) {
    to = [...new Set(body.to ?? [])].filter((x) => x && x !== me).slice(0, 8);
    title = (body.title ?? "").slice(0, 80);
    text = (body.body ?? "").slice(0, 200);
    url = body.url && body.url.startsWith("/") ? body.url : "/";
    if (!to.length || !title) {
      return Response.json({ error: "bad_input" }, { status: 400 });
    }
  }

  const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  const sa = saRaw ? JSON.parse(saRaw) : null;
  const apnsKey = Deno.env.get("APNS_KEY");
  const apnsKeyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APPLE_TEAM_ID");
  const apnsReady = !!(apnsKey && apnsKeyId && teamId);
  if (!sa && !apnsReady) {
    // 아무 발송 경로도 설정 전 — 알림은 부가 기능이라 앱을 막지 않는다
    return Response.json({ ok: true, sent: 0, reason: "not_configured" });
  }

  // 관계 검사·토큰 조회는 service role 로 (RLS 밖 — 남의 토큰을 읽어야 한다)
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const sender: Sender = { sa, apnsKey, apnsKeyId, teamId };

  /* ── ② 대기열 비우기 ──
     DB 가 남긴 알림 중 아직 폰에 안 간 것을 집어 보낸다. */
  if (draining) {
    const { data: rows } = await admin.rpc("notifications_pending", { p_limit: 200 });
    const list = (rows ?? []) as {
      id: string; user_id: string; title: string; body: string | null; url: string | null;
    }[];
    if (!list.length) return Response.json({ ok: true, sent: 0, drained: 0 });

    const users = [...new Set(list.map((r) => r.user_id))];
    const { data: tokens } = await admin
      .from("push_tokens")
      .select("token, platform, user_id")
      .in("user_id", users);

    const byUser = new Map<string, { token: string; platform: string }[]>();
    for (const t of tokens ?? []) {
      const arr = byUser.get(t.user_id) ?? [];
      arr.push({ token: t.token, platform: t.platform });
      byUser.set(t.user_id, arr);
    }

    let sent = 0;
    for (const r of list) {
      for (const tok of byUser.get(r.user_id) ?? []) {
        if (
          await deliver(admin, sender, tok, (r.title ?? "").slice(0, 80),
            (r.body ?? "").slice(0, 200),
            r.url && r.url.startsWith("/") ? r.url : "/")
        ) sent++;
      }
    }

    /* 기기가 없는 사람 것까지 전부 보낸 것으로 찍는다. 폰을 안 쓰는
       사람(웹만 쓰는 사람)의 알림을 대기열에 남겨두면 영원히 안 빠지고,
       매번 다시 시도하다가 대기열이 그 줄로만 채워진다. 알림함에는
       이미 남아 있어서 그 사람이 잃는 것은 없다. */
    await admin.rpc("notifications_mark_pushed", { p_ids: list.map((r) => r.id) });
    return Response.json({ ok: true, sent, drained: list.length });
  }

  /* ── ① 앱이 부른 길 ── */
  const allowed: string[] = [];
  for (const target of to) {
    const { data: ok } = await admin.rpc("can_notify", { p_from: me, p_to: target });
    if (ok === true) allowed.push(target);
  }
  if (!allowed.length) return Response.json({ ok: true, sent: 0 });

  const { data: tokens } = await admin
    .from("push_tokens")
    .select("token, platform")
    .in("user_id", allowed);
  if (!tokens?.length) return Response.json({ ok: true, sent: 0 });

  let sent = 0;
  for (const tok of tokens) {
    if (await deliver(admin, sender, tok, title, text, url)) sent++;
  }

  return Response.json({ ok: true, sent });
});
