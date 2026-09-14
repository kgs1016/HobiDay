/** Bound waiting even when a transport ignores abort. Never retry writes implicitly. */
export function withDeadline<T>(task: (signal: AbortSignal) => PromiseLike<T>, ms = 15_000, parent?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancel);
      if (error) reject(error); else resolve(value as T);
    };
    const cancel = () => {
      controller.abort();
      finish(new DOMException("요청이 취소됐어요", "AbortError"));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(new Error("연결이 지연되고 있어요. 다시 시도해주세요"));
    }, ms);
    if (parent?.aborted) { cancel(); return; }
    parent?.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => task(controller.signal)).then(value => finish(null, value), finish);
  });
}

/** Supabase REST/auth requests share a deadline; large uploads use TUS separately. */
export const requestFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const signal = init?.signal ?? (typeof Request !== "undefined" && input instanceof Request ? input.signal : undefined);
  return withDeadline(s => fetch(input, { ...init, signal: s }), url.includes("/storage/") ? 60_000 : 15_000, signal ?? undefined);
};
