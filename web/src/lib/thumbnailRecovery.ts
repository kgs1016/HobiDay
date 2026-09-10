export type ThumbnailState = {
  url: string;
  attempt: number;
  status: "loading" | "ready" | "refreshing" | "failed";
};

export function initialThumbnailState(url = ""): ThumbnailState {
  return { url, attempt: 0, status: url ? "loading" : "refreshing" };
}

/** 자동 갱신은 한 번만 한다. 삭제·권한 오류도 무한 재요청하지 않는다. */
export function createThumbnailRecovery(
  initialUrl: string | undefined,
  getUrl: () => Promise<string | undefined>,
  changed: (state: ThumbnailState) => void,
) {
  let state = initialThumbnailState(initialUrl);
  let stopped = false;
  let running = false;
  let autoRetried = false;
  const update = (next: ThumbnailState) => {
    if (stopped) return;
    state = next;
    changed(next);
  };
  const failed = () => update({ ...state, url: "", status: "failed" });

  async function refresh() {
    if (stopped || running) return;
    running = true;
    update({ url: "", attempt: state.attempt + 1, status: "refreshing" });
    try {
      const url = await getUrl();
      if (stopped) return;
      if (url) update({ ...state, url, status: "loading" });
      else failed();
    } catch {
      failed();
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (stopped || state.url || autoRetried) return;
      autoRetried = true;
      void refresh();
    },
    imageFailed(attempt: number) {
      if (stopped || attempt !== state.attempt || !state.url) return;
      if (autoRetried) failed();
      else {
        autoRetried = true;
        void refresh();
      }
    },
    imageLoaded(attempt: number) {
      if (!stopped && attempt === state.attempt && state.url)
        update({ ...state, status: "ready" });
    },
    retry() {
      if (state.status === "failed") void refresh();
    },
    stop() { stopped = true; },
  };
}
