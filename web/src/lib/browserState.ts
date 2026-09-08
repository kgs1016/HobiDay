"use client";

import { useSyncExternalStore } from "react";

const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** 브라우저 값으로 폼을 초기화할 때 서버 HTML과 첫 렌더를 맞춘다. */
export function useHydrated() {
  return useSyncExternalStore(subscribeHydration, clientReady, serverReady);
}

let now = 0;
const listeners = new Set<() => void>();
let stopClock: (() => void) | undefined;

function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      now = Date.now();
      listeners.forEach(notify => notify());
    };
    const resume = () => {
      clearInterval(timer);
      if (document.visibilityState === "hidden") return;
      update();
      timer = setInterval(update, 30_000);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    resume();
    stopClock = () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopClock?.();
      stopClock = undefined;
      now = 0;
    }
  };
}

/** 화면을 보는 동안 30초마다 갱신하고, 복귀 즉시 현재 시각을 읽는다. */
export function useNow() {
  return useSyncExternalStore(subscribeClock, () => now, () => 0);
}
