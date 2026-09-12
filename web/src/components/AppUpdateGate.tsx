"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { fetchAppUpdatePolicy, type AppUpdatePolicy } from "@/lib/supabase";
import {
  STORE_URLS,
  isUpdateSnoozed,
  updateDecision,
  updateSnoozeKey,
  type NativeStore,
  type UpdateDecision,
} from "@/lib/appUpdate";

type Prompt = {
  platform: NativeStore;
  latest: string;
  decision: Exclude<UpdateDecision, "none">;
  policy: AppUpdatePolicy;
};

/** 웹에는 표시하지 않고 설치형 앱의 실제 번들 버전만 운영 정책과 비교한다. */
export default function AppUpdateGate() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let alive = true;
    let checking = false;

    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const platform = Capacitor.getPlatform();
        if (platform !== "ios" && platform !== "android") return;
        const [info, policy] = await Promise.all([App.getInfo(), fetchAppUpdatePolicy()]);
        if (!alive || !policy) return;
        const decision = updateDecision(info.version, platform, policy);
        if (decision === "none") {
          setPrompt(null);
          return;
        }
        const latest = platform === "ios" ? policy.ios_latest_version : policy.android_latest_version;
        if (decision === "available" && isUpdateSnoozed(localStorage.getItem(updateSnoozeKey(platform, latest)))) return;
        setPrompt({ platform, latest, decision, policy });
      } catch {
        // 업데이트 확인 장애로 앱 이용을 막지 않는다.
      } finally {
        checking = false;
      }
    };

    // 첫 로고가 사라진 뒤 표시하고, 스토어에서 돌아오면 설치 버전을 다시 읽는다.
    const timer = window.setTimeout(check, 650);
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void check();
    });
    return () => {
      alive = false;
      window.clearTimeout(timer);
      listener.then(handle => handle.remove()).catch(() => {});
    };
  }, []);

  if (!prompt) return null;
  const required = prompt.decision === "required";

  const later = () => {
    localStorage.setItem(updateSnoozeKey(prompt.platform, prompt.latest), String(Date.now()));
    setPrompt(null);
  };
  const update = async () => {
    await Browser.open({ url: STORE_URLS[prompt.platform], presentationStyle: "popover" }).catch(() => {});
  };

  return <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:items-center"
    role="dialog" aria-modal="true" aria-labelledby="app-update-title" aria-describedby="app-update-message">
    <div className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-2xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-[25px] font-black text-white">H</div>
      <h2 id="app-update-title" className="mt-4 text-[20px] font-bold tracking-tight">{prompt.policy.title}</h2>
      <p id="app-update-message" className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-muted">
        {prompt.policy.message}{required ? "\n계속 이용하려면 업데이트가 필요해요." : ""}
      </p>
      <div className="mt-6 flex gap-2">
        {!required && <button type="button" onClick={later} className="button-secondary min-h-12 flex-1 rounded-xl text-[14px] font-semibold">나중에</button>}
        <button type="button" onClick={update} className="button-primary min-h-12 flex-1 rounded-xl text-[14px] font-semibold">업데이트</button>
      </div>
    </div>
  </div>;
}
