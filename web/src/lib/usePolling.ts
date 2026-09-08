"use client";

import { useCallback, useEffect, useRef } from "react";
import { startPolling } from "./polling";

export function usePolling(task: (signal: AbortSignal) => Promise<void>, intervalMs = 5_000) {
  const poller = useRef<ReturnType<typeof startPolling> | null>(null);
  useEffect(() => {
    const current = startPolling(task, intervalMs);
    poller.current = current;
    return () => {
      current.stop();
      poller.current = null;
    };
  }, [task, intervalMs]);
  return useCallback(() => poller.current?.refresh(), []);
}
