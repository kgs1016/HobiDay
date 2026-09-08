/** 느린 요청이 겹치지 않도록 완료 뒤에 다음 조회를 예약한다. */
export function startPolling(task: (signal: AbortSignal) => Promise<void>, intervalMs: number) {
  let stopped = false;
  let running = false;
  let refreshQueued = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  const visible = () => document.visibilityState !== "hidden";
  const schedule = (delay: number) => {
    clearTimeout(timer);
    if (!stopped && visible()) timer = setTimeout(run, delay);
  };

  async function run() {
    if (stopped || !visible()) return;
    if (running) {
      refreshQueued = true;
      return;
    }
    running = true;
    refreshQueued = false;
    controller = new AbortController();
    try {
      await task(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) console.error("채팅 조회 실패", error);
    } finally {
      running = false;
      schedule(refreshQueued ? 0 : intervalMs);
    }
  }

  const refresh = () => {
    clearTimeout(timer);
    void run();
  };
  const visibilityChanged = () => {
    if (visible()) refresh();
    else {
      clearTimeout(timer);
      controller?.abort();
    }
  };

  document.addEventListener("visibilitychange", visibilityChanged);
  schedule(0);
  return {
    refresh,
    stop() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
    },
  };
}

/** 같은 응답이면 이전 배열을 유지해 메시지 목록 재렌더링을 피한다. */
export function sameRows<T extends object>(previous: T[] | null, next: T[]) {
  return previous !== null && previous.length === next.length && next.every((row, i) => {
    const before = previous[i];
    const keys = Object.keys(row) as (keyof T)[];
    return Object.keys(before).length === keys.length && keys.every(key => before[key] === row[key]);
  });
}
