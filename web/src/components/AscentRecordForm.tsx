"use client";

import Link from "next/link";
import { ascentColorHex, ascentDraftError, ascentGradeLabel, ascentPalette, ascentToday, changeAscentGym, selectAscentBrand, addManualAscentEntry, colorAscentEntry, type AscentDraft, type AscentEntry } from "@/lib/ascentRecord";
import { findGymGradeGuide, GYM_GRADE_GUIDES, gymGradeGuideHref } from "@/lib/gymGrades";
import { findGradeMapping, gradeMappingById, gradeMappingLabel } from "@/lib/gymGradeMappings";
import { ascentDifficulty, colorDifficulty, HOBI_DIFFICULTIES } from "@/lib/hobiDifficulty";

const inputClass = "mt-2 block min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-3 text-[16px] font-normal disabled:opacity-50";
export default function AscentRecordForm({ draft, onChange, onSubmit, onCancel, onGuide, busy, editing }: {
  draft: AscentDraft; onChange: (draft: AscentDraft) => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void; onGuide: () => void; busy: boolean; editing: boolean;
}) {
  const guide = findGymGradeGuide(draft.gym);
  const otherMode = draft.gym_mode === "other" || (!!draft.gym && !guide);
  const palette = guide ? ascentPalette(draft.gym) : [];
  const selected = draft.items;
  const total = selected.reduce((sum, item) => sum + item.quantity, 0);
  const points = selected.reduce((sum, item) => sum + (ascentDifficulty(draft.gym, item)?.points ?? 0) * item.quantity, 0);
  const update = (index: number, patch: Partial<AscentEntry>) => onChange({ ...draft,
    items: selected.map((item, i) => i === index ? { ...item, ...patch } : item) });
  const toggle = (color: string) => {
    const present = selected.findIndex(item => item.color === color);
    if (present >= 0) { onChange({ ...draft, items: selected.filter((_, i) => i !== present) }); return; }
    const pending = selected.findIndex(item => !item.color);
    const entry = colorAscentEntry(draft.gym, color, pending >= 0 ? selected[pending].quantity : 1);
    // 개별 기록 편집 중 색상을 처음 고를 때 기존에 직접 입력한 V등급을 보존한다.
    if (pending >= 0 && selected[pending].v_grade !== null) Object.assign(entry, { v_grade: selected[pending].v_grade, grade_mapping_id: null });
    if (pending >= 0) onChange({ ...draft, items: selected.map((item, i) => i === pending ? entry : item) });
    else if (selected.length < 20) onChange({ ...draft, items: [...selected, entry] });
  };
  const changeCount = (index: number, quantity: number) => update(index, {
    quantity: Math.max(0, Math.min(99, Number.isFinite(quantity) ? Math.trunc(quantity) : 0)),
  });
  const invalid = ascentDraftError(draft);
  return <form onSubmit={onSubmit} className="space-y-5" aria-label={editing ? "완등 기록 수정" : "완등 기록 추가"}>
    <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-60">
      <label className="flex items-center justify-between gap-3 text-[13px] font-semibold">완등 날짜
        <input type="date" value={draft.completed_on} onChange={event => onChange({ ...draft, completed_on: event.target.value })}
          required min="1900-01-01" max={ascentToday()} className="min-h-11 w-48 min-w-0 rounded-xl border border-line bg-surface px-3 text-[16px] font-normal" />
      </label>
      <div>
        <label htmlFor="ascent-brand" className="text-[13px] font-semibold">클라이밍장 브랜드</label>
        <select id="ascent-brand" value={otherMode ? "other" : guide?.id ?? ""} required
          onChange={event => onChange(selectAscentBrand(draft, event.target.value))} className={inputClass}>
          <option value="" disabled>브랜드 선택</option>
          {GYM_GRADE_GUIDES.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          <option value="other">기타</option>
        </select>
        {otherMode && <label className="mt-3 block text-[12px] text-muted">클라이밍장 이름 · 선택
          <input value={["기타 암장", "기타 클라이밍장"].includes(draft.gym) ? "" : draft.gym}
            onChange={event => onChange(changeAscentGym(draft, event.target.value || "기타 클라이밍장"))}
            maxLength={100} autoComplete="off" placeholder="클라이밍장 이름" className={inputClass} />
        </label>}
      </div>
      {guide && !otherMode && <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p id="ascent-colors" className="text-[13px] font-semibold">난이도 색상</p>
          <Link href={gymGradeGuideHref(draft.gym)} aria-disabled={busy} onClick={event => {
            if (busy) { event.preventDefault(); return; } onGuide();
          }} className="inline-flex min-h-11 items-center text-[12px] font-medium text-muted aria-disabled:opacity-40">색상 기준표 ›</Link>
        </div>
        <div role="group" aria-labelledby="ascent-colors" className="grid grid-cols-5 gap-2">
          {palette.map(color => {
            const entry = selected.find(item => item.color === color.name);
            const difficulty = colorDifficulty(draft.gym, color.name);
            return <button key={color.name} type="button" aria-pressed={!!entry} onClick={() => toggle(color.name)}
              disabled={!entry && selected.length >= 20 && !selected.some(item => !item.color)}
              className={"relative flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border py-3 disabled:opacity-30 " + (entry ? "border-ink bg-surface2" : "border-line bg-surface")}>
              <span aria-hidden="true" className="h-7 w-7 rounded-full border border-black/10" style={{ background: color.hex }} />
              <span className="text-[12px] font-medium">{color.name}</span>
              {difficulty && <span className="text-[10px] text-muted">H{difficulty.level} · {difficulty.points}점</span>}
              {entry && <span aria-hidden="true" className="absolute right-1 top-1 rounded-full bg-ink px-1.5 text-[10px] leading-4 text-white">{entry.quantity}</span>}
            </button>;
          })}
        </div>
      </div>}
      {otherMode && <button type="button" onClick={() => onChange(addManualAscentEntry(draft))}
        disabled={selected.length >= 11} className="button-secondary min-h-12 w-full rounded-xl px-3 py-3 text-[13px] font-semibold">
        + H 난이도 추가
      </button>}
      {selected.length > 0 && <div className="rounded-2xl border border-line px-3.5">
        {selected.map((item, index) => {
          const mapping = gradeMappingById(item.grade_mapping_id);
          const available = findGradeMapping(guide?.id, item.color.trim());
          const autoDifficulty = colorDifficulty(draft.gym, item.color);
          const difficulty = ascentDifficulty(draft.gym, item);
          const name = item.color || "기타 " + (index + 1);
          const hOnly = otherMode && /^H([1-9]|10|11)$/.test(item.color);
          return <div key={index} className="border-b border-line py-3 last:border-0">
            <div className="flex items-center justify-between gap-2">
              {!hOnly && (item.custom_color || !item.color) ? <input aria-label={"기타 색상 " + (index + 1)} placeholder="색상 이름" maxLength={20} required
                autoFocus={!item.color} value={item.color} onChange={event => update(index, { color: event.target.value,
                  v_grade: item.grade_mapping_id ? null : item.v_grade, grade_mapping_id: null,
                  manual_difficulty: colorDifficulty(draft.gym, event.target.value) ? null : item.manual_difficulty })}
                className="min-h-11 w-0 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-[16px]" /> :
                <span className="flex min-w-0 flex-1 items-center gap-2 break-all text-[13px] font-semibold">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: ascentColorHex(item.color) }} />{item.color}
                </span>}
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" aria-label={name + " 개수 줄이기"} disabled={item.quantity <= 1} onClick={() => changeCount(index, item.quantity - 1)}
                  className="min-h-11 min-w-11 rounded-lg bg-surface2 text-xl disabled:opacity-30">−</button>
                <input type="number" aria-label={name + " 완등 개수"} min={1} max={99} step={1} inputMode="numeric" required
                  value={item.quantity || ""} onChange={event => changeCount(index, Number(event.target.value))}
                  className="min-h-11 w-10 rounded-lg bg-transparent text-center text-[16px] font-semibold tabular-nums" />
                <button type="button" aria-label={name + " 개수 늘리기"} disabled={item.quantity >= 99} onClick={() => changeCount(index, item.quantity + 1)}
                  className="min-h-11 min-w-11 rounded-lg bg-surface2 text-xl disabled:opacity-30">+</button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {autoDifficulty ? <span className="text-[12px] text-muted">하비데이 H{autoDifficulty.level} · {autoDifficulty.points}점/개</span> :
                <select aria-label={name + " 하비데이 난이도"} value={item.manual_difficulty ?? ""}
                  onChange={event => update(index, { manual_difficulty: event.target.value === "" ? null : Number(event.target.value),
                    ...(hOnly ? { color: `H${event.target.value}` } : {}) })}
                  className="min-h-11 min-w-0 rounded-lg bg-surface2 px-2 text-[13px]">
                  {!hOnly && <option value="">{item.v_grade !== null ? `V기록 참고 · H${difficulty?.level}` : "하비데이 난이도 모름"}</option>}
                  {HOBI_DIFFICULTIES.map(level => <option key={level.level} value={level.level} disabled={hOnly && selected.some((entry, i) => i !== index && entry.color === `H${level.level}`)}>H{level.level} · {level.points}점/개</option>)}
                </select>}
              <button type="button" aria-label={name + " 선택 삭제"} onClick={() => onChange({ ...draft, items: selected.filter((_, i) => i !== index) })}
                className="min-h-11 px-2 text-[12px] text-muted">삭제</button>
            </div>
            <p className="text-[12px] font-semibold">{difficulty ? `+${difficulty.points * item.quantity}점` : "개수만 기록"}</p>
            {!hOnly && <details className="mt-1 text-[11px] text-muted">
              <summary className="min-h-11 cursor-pointer content-center">V등급 참고 기록 · 선택</summary>
              <select aria-label={name + " V등급"} value={mapping ? "auto" : item.v_grade ?? ""} onChange={event => {
                if (event.target.value === "auto" && available) update(index, { v_grade: available.min, grade_mapping_id: available.id });
                else update(index, { v_grade: event.target.value === "" ? null : Number(event.target.value), grade_mapping_id: null });
              }} className="min-h-11 min-w-0 rounded-lg bg-surface2 px-2 text-[13px]">
                {available && <option value="auto">자동 · {gradeMappingLabel(available)}</option>}
                <option value="">V등급 모름</option><option value="-1">VB · 직접 입력</option>
                {Array.from({ length: 18 }, (_, v) => <option key={v} value={v}>V{v} · 직접 입력</option>)}
              </select>
              {mapping && <a href={mapping.sourceUrl} target="_blank" rel="noopener noreferrer" className="block min-h-11 content-center underline">
                {ascentGradeLabel(mapping.min)} · {mapping.publishedOn ?? "작성일 미확인"} 안내판 참고 ↗
              </a>}
            </details>}
          </div>;
        })}
      </div>}
      {selected.length > 0 && <div className="space-y-1 text-[11px] leading-relaxed text-muted">
        <p className="text-[13px] font-semibold text-ink">이 기록 +{points.toLocaleString()}점</p>
      </div>}
      {invalid && total > 0 && draft.gym.trim() && <p role="status" className="text-[12px] text-muted">{invalid}</p>}
    </fieldset>
    <div className="flex gap-2">
      {editing && <button type="button" onClick={onCancel} disabled={busy} className="button-secondary rounded-xl px-4 py-3 text-sm">취소</button>}
      <button type="submit" disabled={busy || !!invalid} className="button-primary min-h-13 flex-1 rounded-xl px-4 py-3 text-[14px] font-semibold">
        {busy ? "저장 중…" : editing ? total + "개 수정 저장" : total ? total + "개 한 번에 기록하기" : otherMode ? "H 난이도와 개수를 선택해주세요" : "색상과 개수를 선택해주세요"}
      </button>
    </div>
  </form>;
}
