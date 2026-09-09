/** 기준표를 다녀오는 동안만 보관하는 입력값. 계정별·탭별로 분리한다. */
import { isAscentDraft, type AscentDraft } from "./ascentRecord";
export type AscentGuideDraft = AscentDraft;
const key = (userId: string) => `hobiday:ascent-guide-draft:${userId}`;

export function saveAscentGuideDraft(userId: string, draft: AscentGuideDraft) {
  try { window.sessionStorage.setItem(key(userId), JSON.stringify({ ...draft, savedAt: Date.now() })); } catch { /* 기기에서 저장을 막으면 보관하지 않는다. */ }
}
export function takeAscentGuideDraft(userId: string): AscentGuideDraft | null {
  try {
    const stored = window.sessionStorage.getItem(key(userId));
    window.sessionStorage.removeItem(key(userId));
    if (!stored) return null;
    const value = JSON.parse(stored);
    if (!value || typeof value.savedAt !== "number" || Date.now() - value.savedAt > 3_600_000 || value.savedAt > Date.now() ||
      !isAscentDraft(value)) return null;
    return { gym: value.gym, ...(value.gym_mode ? { gym_mode: value.gym_mode } : {}), completed_on: value.completed_on,
      items: value.items, recordId: value.recordId, legacyId: value.legacyId };
  } catch { return null; }
}
export function clearAscentGuideDraft(userId: string) {
  try { window.sessionStorage.removeItem(key(userId)); } catch { /* 저장이 차단된 기기 */ }
}
