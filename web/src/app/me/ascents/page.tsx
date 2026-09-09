"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import AscentRecordForm from "@/components/AscentRecordForm";
import { currentUser, fetchGyms } from "@/lib/supabase";
import { ASCENT_PAGE, deleteAscentRecord, fetchAscentHistory, fetchClimbingProgress, isAscentPreview, saveAscentBatch } from "@/lib/climbingAscents";
import { shoeProgress, type ClimbingProgress } from "@/lib/shoeProgress";
import { GYM_GRADE_GUIDES } from "@/lib/gymGrades";
import { ascentDifficulty } from "@/lib/hobiDifficulty";
import { clearAscentGuideDraft, saveAscentGuideDraft, takeAscentGuideDraft } from "@/lib/ascentGuideDraft";
import { ascentColorHex, ascentDraftError, ascentGradeLabel, draftFromAscent, emptyAscentDraft, type AscentDraft, type AscentRecord } from "@/lib/ascentRecord";

export default function AscentsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [list, setList] = useState<AscentRecord[] | null>(null);
  const [progress, setProgress] = useState<ClimbingProgress | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState<AscentDraft>(emptyAscentDraft);
  const [editing, setEditing] = useState(false);
  const [gyms, setGyms] = useState(GYM_GRADE_GUIDES.map(guide => guide.name));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const userId = useRef<string | null>(null);
  const submitting = useRef(false);
  const formHeading = useRef<HTMLDivElement>(null);
  const preview = isAscentPreview();

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [rows, summary] = await Promise.all([fetchAscentHistory(), fetchClimbingProgress()]);
      setList(rows); setProgress(summary); setMore(rows.length === ASCENT_PAGE);
      return rows;
    } catch (e) { setLoadError(e instanceof Error ? e.message : "기록을 불러오지 못했어요"); }
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const user = preview ? { id: "ascent-preview" } : await currentUser();
        if (!alive) return;
        userId.current = user?.id ?? null; setAuthed(!!user);
        if (user) {
          const saved = takeAscentGuideDraft(user.id);
          if (saved) setDraft(saved);
          const rows = await load();
          if (alive && saved) setEditing(!!saved.legacyId || !!rows?.some(row => row.id === saved.recordId));
          const gyms = await fetchGyms();
          if (alive && gyms) setGyms(gyms.map(gym => gym.name));
        }
      } catch { if (alive) setLoadError("로그인 상태를 확인하지 못했어요"); }
    })();
    return () => { alive = false; };
  }, [load, preview]);
  const reset = () => {
    setDraft(emptyAscentDraft(draft.gym)); setEditing(false); setError("");
    if (userId.current) clearAscentGuideDraft(userId.current);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || loadingMore || !authed) return;
    const invalid = ascentDraftError(draft);
    if (invalid) { setError(invalid); return; }
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    const pending = { ...draft, recordId: draft.recordId ?? crypto.randomUUID() };
    setDraft(pending);
    if (userId.current) saveAscentGuideDraft(userId.current, pending);
    try {
      await saveAscentBatch(pending);
      const total = pending.items.reduce((sum, item) => sum + item.quantity, 0);
      setNotice(preview ? `미리보기 기록 ${total}개 저장 완료` : editing ? `완등 ${total}개 수정 완료` : `완등 ${total}개 기록 완료`);
      reset(); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "기록을 저장하지 못했어요"); }
    finally { submitting.current = false; setBusy(false); }
  };
  const edit = (row: AscentRecord) => {
    setDraft(draftFromAscent(row)); setEditing(true); setError(""); setNotice(""); formHeading.current?.focus();
  };
  const remove = async (row: AscentRecord) => {
    const count = row.items.reduce((sum, item) => sum + item.quantity, 0);
    if (submitting.current || !confirm(`${row.gym} 완등 ${count}개 기록을 삭제할까요?`)) return;
    submitting.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await deleteAscentRecord(row);
      if (draft.recordId === row.id) reset();
      setNotice("완등 기록 삭제 완료"); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "삭제하지 못했어요"); }
    finally { submitting.current = false; setBusy(false); }
  };
  const nextPage = async () => {
    if (!list?.length || loadingMore || busy) return;
    setLoadingMore(true); setLoadError("");
    try {
      const rows = await fetchAscentHistory(list[list.length - 1]);
      setList(prev => [...(prev ?? []), ...rows]); setMore(rows.length === ASCENT_PAGE);
    } catch (e) { setLoadError(e instanceof Error ? e.message : "기록을 불러오지 못했어요"); }
    finally { setLoadingMore(false); }
  };
  const current = progress ? shoeProgress(progress).current : null;
  return <main className="px-4 pb-10">
    <header className="flex items-center gap-2 py-4"><BackButton fallback="/me" /><h1 className="text-[18px] font-bold">완등 기록</h1></header>
    {authed === false ? <div className="py-12 text-center">
      <p className="text-sm text-muted">로그인 후 완등 기록</p>
      <Link href="/login" className="button-primary mt-4 inline-block rounded-xl px-6 py-3 text-sm font-semibold">로그인 하기</Link>
    </div> : authed === null ? <p role="status" className="py-8 text-center text-sm text-faint">불러오는 중…</p> : <>
      {preview && <p className="mb-3 text-[11px] text-muted">미리보기 · 운영 기록에 반영되지 않음</p>}
      <div ref={formHeading} tabIndex={-1} className="mb-5 flex items-center justify-between gap-2 border-b border-line pb-4 outline-none">
        <p className="text-[13px]">전체 완등 <b>{progress?.total ?? "—"}개</b></p>
        <Link href={`/me/grades${current ? `?stage=${current.id}` : ""}`} aria-disabled={busy} onClick={event => {
          if (busy) { event.preventDefault(); return; } if (userId.current) saveAscentGuideDraft(userId.current, draft);
        }} className="inline-flex min-h-11 items-center text-[12px] font-semibold aria-disabled:opacity-40">단계 기준표 보러가기 →</Link>
      </div>
      <AscentRecordForm draft={draft} onChange={setDraft} onSubmit={submit} onCancel={reset} editing={editing} busy={busy || loadingMore} gyms={gyms}
        onGuide={() => { if (userId.current) saveAscentGuideDraft(userId.current, draft); }} />
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-accent-strong">{notice}</p>}
      <section className="mt-8 border-t border-line pt-5" aria-labelledby="ascent-list-title">
        <h2 id="ascent-list-title" className="text-[15px] font-semibold">완등 내역</h2>
        {list === null ? <p className="py-6 text-sm text-muted">불러오는 중…</p> : !list.length ? <p className="py-6 text-sm text-muted">첫 완등을 기록해보세요</p> :
          <ul className="mt-2 divide-y divide-line">{list.map(row => <li key={row.id} className="py-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted">{row.completed_on?.replaceAll("-", ".") ?? "날짜 미입력"}</p>
                <p className="mt-1 break-words text-[14px] font-semibold">{row.gym}</p>
                {row.kind === "legacy" && <p className="mt-1 break-words text-xs text-muted">{row.legacy_problem}</p>}
              </div>
              <div className="flex shrink-0">
                <button onClick={() => edit(row)} disabled={busy || loadingMore} aria-label={`${row.gym} ${row.completed_on ?? "기존"} 기록 수정`} className="min-h-11 px-2 text-xs text-muted disabled:opacity-40">수정</button>
                <button onClick={() => remove(row)} disabled={busy || loadingMore} aria-label={`${row.gym} ${row.completed_on ?? "기존"} 기록 삭제`} className="min-h-11 px-2 text-xs text-muted disabled:opacity-40">삭제</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{row.items.map((item, index) => {
              const difficulty = ascentDifficulty(row.gym, item);
              return <span key={index} className="inline-flex items-center gap-1.5 rounded-lg bg-surface2 px-2.5 py-2 text-[12px]">
              {item.color && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-black/10" style={{ background: ascentColorHex(item.color) }} />}
              {item.color ?? ascentGradeLabel(item.v_grade)} <b className="tabular-nums">{item.quantity}개</b>
              <span className="text-[10px] text-muted">{difficulty ? `H${difficulty.level} · ${difficulty.points * item.quantity}점` : "개수만 기록"}</span>
            </span>; })}</div>
          </li>)}</ul>}
        {more && <button onClick={nextPage} disabled={loadingMore || busy} className="button-secondary mt-3 w-full rounded-xl py-3 text-sm">{loadingMore ? "불러오는 중…" : "더 보기"}</button>}
      </section>
    </>}
    {loadError && <div role="alert" className="mt-4 text-sm text-danger"><p>{loadError}</p>
      <button onClick={() => authed === null ? window.location.reload() : void load()} className="py-2 font-semibold">다시 불러오기</button></div>}
  </main>;
}
