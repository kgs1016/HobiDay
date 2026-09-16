"use client";
import { useEffect, useRef, useState } from "react";
import BackButton from "@/components/BackButton";
import { getSupabase } from "@/lib/supabase";
import { fetchProfileUsageReport, PROFILE_USAGE_EVENTS, type ProfileUsageEvent, type ProfileUsageReport } from "@/lib/profileUsage";

const steps: ProfileUsageEvent[] = ["profile_opened", "profile_ready", "profile_save_attempt", "profile_saved", "shoe_opened", "shoe_ready", "shoe_save_attempt", "shoe_saved"];
const date = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function ProfileUsageAdmin() {
  const [days, setDays] = useState(7);
  const [newOnly, setNewOnly] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<ProfileUsageReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  useEffect(() => {
    const listener = getSupabase()?.auth.onAuthStateChange(event => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      request.current++;
      setReport(null); setError(""); setLoading(true);
      setAttempt(n => n + 1);
    });
    return () => listener?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let alive = true;
    const id = ++request.current;
    Promise.resolve().then(async () => {
      if (!alive) return;
      setLoading(true); setError(""); setReport(null);
      try { const data = await fetchProfileUsageReport(days, newOnly); if (alive && id === request.current) setReport(data); }
      catch (e) { if (alive && id === request.current) setError(e instanceof Error ? e.message : "불러오지 못했습니다"); }
      finally { if (alive && id === request.current) setLoading(false); }
    });
    return () => { alive = false; };
  }, [days, newOnly, attempt]);
  return <main className="mx-auto max-w-2xl px-5 pb-8">
    <header className="flex items-center gap-2 py-5"><BackButton /><h1 className="text-xl font-bold">프로필 이용 현황</h1></header>
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <select aria-label="조회 기간" value={days} onChange={e => setDays(Number(e.target.value))} className="rounded-lg border border-line bg-surface p-2">
        {[1, 7, 14, 30, 90].map(n => <option key={n} value={n}>{n === 1 ? "오늘" : `최근 ${n}일`}</option>)}
      </select>
      <label className="flex items-center gap-2"><input type="checkbox" checked={newOnly} onChange={e => setNewOnly(e.target.checked)} />기간 내 신규 가입자만</label>
      <button onClick={() => setAttempt(n => n + 1)} className="button-secondary rounded-lg px-3 py-2">새로고침</button>
    </div>
    {loading ? <p role="status" className="py-10 text-muted">불러오는 중…</p> : error ? <p role="alert" className="py-10 text-danger">{error}</p> : report && <>
      <p className="mt-5 text-sm text-muted">한국 시간 {date(report.period_start)} ~ {date(report.period_end)}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface2 p-4"><p className="text-sm text-muted">{newOnly ? "신규 가입 계정" : "기록이 있는 계정"}</p><p className="mt-1 text-2xl font-bold">{report.cohort_count}명</p></div>
        <div className="rounded-xl bg-surface2 p-4"><p className="text-sm text-muted">프로필 이용 기록 있음</p><p className="mt-1 text-2xl font-bold">{report.observed_users}명</p></div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">각 단계는 기간 내 기록이 있는 계정을 중복 없이 집계합니다. 같은 사람이 다른 단계에도 포함되며, 순서대로 완료한 전환율은 아닙니다. 미수집·구버전·통신 실패는 미사용으로 판단할 수 없습니다.</p>
      <h2 className="mt-6 font-bold">단계별 인원</h2>
      <ul className="mt-2 divide-y divide-line">{steps.map(event => <li key={event} className="flex justify-between py-3 text-sm"><span>{PROFILE_USAGE_EVENTS[event]}</span><b>{report.stages.find(s => s.event === event)?.users ?? 0}명</b></li>)}</ul>
      <h2 className="mt-6 font-bold">실패·입력 확인</h2>
      {report.stages.filter(s => s.event.endsWith("failed")).length === 0 ? <p className="mt-2 text-sm text-muted">수집된 오류 기록이 없습니다.</p> :
        <ul className="mt-2 divide-y divide-line">{report.stages.filter(s => s.event.endsWith("failed")).map(s => <li key={s.event} className="flex justify-between py-3 text-sm"><span>{PROFILE_USAGE_EVENTS[s.event]}</span><span>{s.users}명 · {s.events}건</span></li>)}</ul>}
      <h2 className="mt-6 font-bold">최근 계정별 기록 <span className="text-xs font-normal text-muted">최대 100명</span></h2>
      {report.recent_users.length === 0 && <p className="mt-2 text-sm text-muted">해당 기간의 계정이 없습니다.</p>}
      <ul className="mt-3 space-y-3">{report.recent_users.map(user => <li key={user.user_id} className="rounded-xl border border-line p-4">
        <p className="text-sm font-semibold">회원 {user.user_id.slice(0, 8)} <span className="font-normal text-muted">· 가입 {date(user.joined_at)}</span></p>
        <p className="mt-2 text-sm">{user.last_event ? PROFILE_USAGE_EVENTS[user.last_event] : "아직 수집된 기록 없음"}</p>
        {user.last_at && <p className="mt-1 text-xs text-muted">{date(user.last_at)} · {user.platform} {user.app_version ?? ""}{user.error_code ? ` · ${user.error_code}` : ""}</p>}
        <div className="mt-2 flex flex-wrap gap-1">{steps.filter(event => user.events.includes(event)).map(event => <span key={event} className="rounded bg-surface2 px-2 py-1 text-xs text-muted">{PROFILE_USAGE_EVENTS[event]}</span>)}</div>
      </li>)}</ul>
    </>}
  </main>;
}
