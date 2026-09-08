"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import { currentUser, hasSupabase } from "@/lib/supabase";
import {
  ASCENT_PAGE, deleteClimbingAscent, fetchClimbingAscents, fetchClimbingProgress,
  saveClimbingAscent, type ClimbingAscent,
} from "@/lib/climbingAscents";
import { shoeProgress, type ClimbingProgress } from "@/lib/shoeProgress";

const gradeLabel = (grade: number | null) => grade === null ? "난이도 미상" : grade === -1 ? "VB" : `V${grade}`;
const inputClass = "mt-2 block w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-3 text-[16px] font-normal disabled:opacity-50";

export default function AscentsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [list, setList] = useState<ClimbingAscent[] | null>(null);
  const [progress, setProgress] = useState<ClimbingProgress | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [gym, setGym] = useState("");
  const [problem, setProblem] = useState("");
  const [grade, setGrade] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const draftId = useRef<string | null>(null);
  const submitting = useRef(false);
  const problemInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [rows, summary] = await Promise.all([fetchClimbingAscents(), fetchClimbingProgress()]);
      setList(rows); setProgress(summary); setMore(rows.length === ASCENT_PAGE);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "기록을 불러오지 못했어요"); }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const user = hasSupabase() ? await currentUser() : null;
        setAuthed(!!user);
        if (user) await load();
      } catch { setLoadError("로그인 상태를 확인하지 못했어요"); }
    })();
  }, [load]);

  const reset = () => {
    setProblem(""); setGrade(""); setEditing(null); draftId.current = null; setError("");
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting.current || loadingMore || !authed || !gym.trim() || !problem.trim()) return;
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const id = editing ?? (draftId.current ??= crypto.randomUUID());
      await saveClimbingAscent({ id, gym: gym.trim(), problem: problem.trim(), v_grade: grade === "" ? null : Number(grade) });
      setNotice(editing ? "완등 기록 수정 완료" : "완등 기록 추가 완료");
      reset();
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "기록을 저장하지 못했어요"); }
    finally { submitting.current = false; setBusy(false); }
  };

  const edit = (row: ClimbingAscent) => {
    setGym(row.gym); setProblem(row.problem); setGrade(row.v_grade === null ? "" : String(row.v_grade));
    setEditing(row.id); setError(""); setNotice(""); draftId.current = null;
    problemInput.current?.focus();
  };

  const remove = async (row: ClimbingAscent) => {
    if (submitting.current || !confirm(`‘${row.problem}’ 기록을 삭제할까요? 암벽화 단계도 다시 계산됩니다.`)) return;
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await deleteClimbingAscent(row.id);
      if (editing === row.id) reset();
      setNotice("완등 기록 삭제 완료"); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했어요"); }
    finally { submitting.current = false; setBusy(false); }
  };

  const nextPage = async () => {
    if (!list?.length || loadingMore) return;
    setLoadingMore(true); setLoadError("");
    try {
      const rows = await fetchClimbingAscents(list[list.length - 1]);
      setList(prev => [...(prev ?? []), ...rows]); setMore(rows.length === ASCENT_PAGE);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "기록을 불러오지 못했어요"); }
    finally { setLoadingMore(false); }
  };

  const current = progress ? shoeProgress(progress).current : null;
  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-2 pt-4 pb-4">
        <BackButton fallback="/me" />
        <h1 className="text-[18px] font-bold">완등 기록</h1>
      </header>
      {authed === false ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted">로그인 후 완등 기록</p>
          <Link href="/login" className="mt-4 inline-block rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white">로그인 하기</Link>
        </div>
      ) : authed === null ? <p role="status" className="py-8 text-center text-sm text-faint">불러오는 중…</p> : (
        <>
          <div className="mb-5 flex items-center justify-between border-b border-line pb-4">
            <p className="text-sm">전체 완등 <b>{progress?.total ?? "—"}개</b></p>
            {current && <Link href="/me" className="text-sm font-semibold" style={{ color: current.ink }}>{current.name} 암벽화 →</Link>}
          </div>
          <form onSubmit={submit} className="space-y-4" aria-label={editing ? "완등 기록 수정" : "완등 기록 추가"}>
            <label className="block text-[13px] font-semibold">암장
              <input value={gym} onChange={e => setGym(e.target.value)} required maxLength={100} disabled={busy}
                autoComplete="off" placeholder="암장 이름·지점" className={inputClass} />
            </label>
            <label className="block text-[13px] font-semibold">문제 구분
              <input ref={problemInput} value={problem} onChange={e => setProblem(e.target.value)} required maxLength={120}
                disabled={busy} aria-describedby="problem-help" placeholder="예: 9월 오버행 12번" className={inputClass} />
            </label>
            <p id="problem-help" className="-mt-2 text-[12px] text-muted">세팅·벽 위치·번호로 구분 · 같은 문제는 한 번</p>
            <div>
              <label htmlFor="ascent-grade" className="block text-[13px] font-semibold">문제 난이도</label>
              <select id="ascent-grade" value={grade} onChange={e => setGrade(e.target.value)} disabled={busy} aria-describedby="grade-help" className={inputClass}>
                <option value="">V등급 모름</option>
                <option value="-1">VB</option>
                {Array.from({ length: 18 }, (_, v) => <option key={v} value={v}>V{v}</option>)}
              </select>
            </div>
            <p id="grade-help" className="-mt-2 text-[12px] text-muted">문제에 안내된 V등급 · 모르면 전체 완등에만 포함</p>
            <div className="flex gap-2">
              {editing && <button type="button" onClick={reset} disabled={busy} className="rounded-xl border border-line px-4 py-3 text-sm">취소</button>}
              <button type="submit" disabled={busy || loadingMore || !gym.trim() || !problem.trim()}
                className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
                {busy ? "저장 중…" : editing ? "수정 저장" : "완등 추가"}
              </button>
            </div>
          </form>
          <p className="mt-2 text-center text-[11.5px] text-faint">가입 전 완등도 기록 가능 · 직접 입력한 기록</p>
          {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
          {notice && <p role="status" className="mt-3 text-sm text-accent-pressed">{notice}</p>}

          <section className="mt-8 border-t border-line pt-4" aria-labelledby="ascent-list-title">
            {progress && progress.total > 0 && <div className="mb-5">
              <h2 className="text-[13px] font-semibold">난이도별 완등</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(progress.grade_counts).filter(([, count]) => count > 0)
                  .sort(([a], [b]) => (a === "unknown" ? Infinity : Number(a)) - (b === "unknown" ? Infinity : Number(b)))
                  .map(([grade, count]) => <span key={grade} className="rounded-lg bg-surface2 px-2.5 py-1.5 text-[12px] text-muted">
                    {grade === "unknown" ? "V등급 모름" : gradeLabel(Number(grade))} <b className="ml-1 font-semibold tabular-nums text-ink">{count}개</b>
                  </span>)}
              </div>
            </div>}
            <h2 id="ascent-list-title" className="text-[15px] font-semibold">기록한 문제</h2>
            {list === null ? <p className="py-6 text-sm text-muted">불러오는 중…</p>
              : list.length === 0 ? <p className="py-6 text-sm text-muted">첫 완등을 기록해보세요</p>
              : <ul className="mt-2 divide-y divide-line">
                {list.map(row => <li key={row.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="break-words text-sm font-semibold">{row.problem}</p><p className="mt-1 break-words text-xs text-muted">{row.gym} · {gradeLabel(row.v_grade)}</p></div>
                    <div className="flex shrink-0">
                      <button onClick={() => edit(row)} disabled={busy || loadingMore} aria-label={`${row.problem} 수정`} className="min-h-11 px-2 text-xs text-muted disabled:opacity-40">수정</button>
                      <button onClick={() => remove(row)} disabled={busy || loadingMore} aria-label={`${row.problem} 삭제`} className="min-h-11 px-2 text-xs text-muted disabled:opacity-40">삭제</button>
                    </div>
                  </div>
                </li>)}
              </ul>}
            {more && <button onClick={nextPage} disabled={loadingMore || busy} className="mt-3 w-full rounded-xl border border-line py-3 text-sm">{loadingMore ? "불러오는 중…" : "더 보기"}</button>}
          </section>
        </>
      )}
      {loadError && <div role="alert" className="mt-4 text-sm text-danger">
        <p>{loadError}</p>
        <button onClick={() => authed === null ? window.location.reload() : void load()} className="py-2 font-semibold">다시 불러오기</button>
      </div>}
    </main>
  );
}
