export type DeliveryResult = true | false | "dead";
export async function sendWithRetry(send: () => Promise<DeliveryResult>, wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await send().catch(() => false);
    if (result !== false || attempt === 2) return result;
    await wait(attempt === 0 ? 250 : 1000);
  }
  return false;
}
export function fcmTokenIsDead(payload: { error?: { details?: { "@type"?: string; errorCode?: string }[] } }): boolean {
  // HTTP 400/404 can also mean a bad payload or a missing project, not an expired device token.
  return !!payload.error?.details?.some(d => d["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" && d.errorCode === "UNREGISTERED");
}
export interface PendingNotification {
  id: string; user_id: string; title: string; body: string | null; url: string | null;
  lease: string; delivered_tokens: string[];
}
export async function deliverPending(
  row: PendingNotification,
  tokens: { token: string; platform: string }[],
  send: (token: { token: string; platform: string }) => Promise<DeliveryResult>,
) {
  const delivered = new Set(row.delivered_tokens ?? []);
  let sent = 0, failed = false;
  await Promise.all(tokens.map(async token => {
    if (delivered.has(token.token)) return;
    const result = await send(token).catch(() => false);
    if (result === true) { delivered.add(token.token); sent++; }
    else if (result !== "dead") failed = true;
  }));
  // No registered device is terminal for this event; don't replay old alerts after a later login.
  return { delivered: [...delivered], complete: !failed, sent };
}
export function safePushUrl(url: unknown) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") ? url : "/";
}
