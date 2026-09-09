import { findGymGradeGuide, GYM_GRADE_GUIDES } from "./gymGrades";
import { findGradeMapping, gradeMappingById } from "./gymGradeMappings";
import { colorDifficulty, validHobiLevel } from "./hobiDifficulty";

export type AscentEntry = { color: string; quantity: number; v_grade: number | null; grade_mapping_id?: string | null; custom_color?: boolean; manual_difficulty?: number | null };
export type AscentDraft = { gym: string; gym_mode?: "search" | "other"; completed_on: string; items: AscentEntry[]; recordId: string | null; legacyId: string | null };
export type AscentRecord = {
  id: string; kind: "batch" | "legacy"; gym: string; completed_on: string | null; brand_id: string | null;
  created_at: string; legacy_problem: string | null;
  items: (Omit<AscentEntry, "color"> & { color: string | null })[];
};
export function ascentToday(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const uuid = (value: unknown) => value === null || (typeof value === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value));
export const validAscentGrade = (value: unknown): value is number | null => value === null ||
  (typeof value === "number" && Number.isInteger(value) && value >= -1 && value <= 17);
export function isAscentDraft(value: unknown): value is AscentDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as AscentDraft;
  return typeof d.gym === "string" && d.gym.length <= 100 && typeof d.completed_on === "string" &&
    (d.completed_on === "" || validDate(d.completed_on)) && uuid(d.recordId) && uuid(d.legacyId) &&
    (d.gym_mode === undefined || d.gym_mode === "search" || d.gym_mode === "other") &&
    Array.isArray(d.items) && d.items.length <= 20 && d.items.every(item => item && typeof item.color === "string" &&
      item.color.length <= 20 && Number.isInteger(item.quantity) && item.quantity >= 0 && item.quantity <= 99 && validAscentGrade(item.v_grade) &&
      (item.grade_mapping_id == null || (typeof item.grade_mapping_id === "string" && item.grade_mapping_id.length <= 80)) &&
      (item.manual_difficulty == null || validHobiLevel(item.manual_difficulty)) &&
      (item.custom_color === undefined || typeof item.custom_color === "boolean"));
}
export function ascentDraftError(draft: AscentDraft): string | null {
  if (!isAscentDraft(draft)) return "기록 내용을 확인해주세요";
  if (draft.legacyId && draft.legacyId !== draft.recordId) return "기존 기록을 확인해주세요";
  if (!draft.gym.trim()) return "클라이밍장을 입력해주세요";
  if (!draft.completed_on || draft.completed_on < "1900-01-01" || draft.completed_on > ascentToday()) return "완등 날짜를 확인해주세요";
  if (!draft.items.length || draft.items.some(item => !item.color.trim() || item.quantity < 1)) return "색상과 완등 개수를 선택해주세요";
  for (const item of draft.items) if (item.grade_mapping_id != null) {
    const mapping = gradeMappingById(item.grade_mapping_id);
    if (!mapping || mapping.brandId !== findGymGradeGuide(draft.gym)?.id || mapping.color !== item.color.trim() || mapping.min !== item.v_grade)
      return "클라이밍장과 색상의 등급 기준을 다시 선택해주세요";
  }
  if (draft.items.some(item => item.manual_difficulty != null && colorDifficulty(draft.gym, item.color)))
    return "등록된 색상은 하비데이 기준으로 자동 계산됩니다";
  if (new Set(draft.items.map(item => item.color.trim().toLowerCase().replace(/\s+/g, ""))).size !== draft.items.length) return "같은 색상은 한 줄로 기록해주세요";
  if (draft.items.reduce((sum, item) => sum + item.quantity, 0) > 500) return "한 번에 500개까지 기록할 수 있어요";
  return null;
}
export function emptyAscentDraft(gym = ""): AscentDraft {
  return { gym, completed_on: ascentToday(), items: [], recordId: null, legacyId: null };
}
/** ブランド切替では前のブランドの色・点数を持ち越さない。日付と編集中のIDは保持する。 */
export function selectAscentBrand(draft: AscentDraft, brandId: string): AscentDraft {
  const brand = GYM_GRADE_GUIDES.find(guide => guide.id === brandId);
  const next: AscentDraft = { ...draft, gym: brand?.name ?? "기타 클라이밍장", gym_mode: brand ? "search" : "other", items: [] };
  return brand ? next : addManualAscentEntry(next);
}
export function addManualAscentEntry(draft: AscentDraft): AscentDraft {
  const level = Array.from({ length: 11 }, (_, i) => i + 1).find(h => !draft.items.some(item => item.color === `H${h}`));
  if (!level || draft.items.length >= 11) return draft;
  return { ...draft, items: [...draft.items, { color: `H${level}`, quantity: 1, manual_difficulty: level, v_grade: null, grade_mapping_id: null }] };
}
export function draftFromAscent(row: AscentRecord): AscentDraft {
  return { gym: row.gym, completed_on: row.completed_on ?? "", items: row.items.map(item => ({ ...item, color: item.color ?? "",
    custom_color: !ascentPalette(row.gym).some(color => color.name === item.color) })),
    recordId: row.id, legacyId: row.kind === "legacy" ? row.id : null };
}
export function ascentPalette(gym: string) {
  return findGymGradeGuide(gym)?.colors ?? [...new Map(GYM_GRADE_GUIDES.flatMap(guide => guide.colors).map(color => [color.name, color])).values()];
}
export function ascentColorHex(color: string | null) {
  return GYM_GRADE_GUIDES.flatMap(guide => guide.colors).find(item => item.name === color)?.hex ?? "#D1D5DB";
}
export const ascentGradeLabel = (grade: number | null) => grade === null ? "V등급 미입력" : grade === -1 ? "VB" : `V${grade}`;

export function colorAscentEntry(gym: string, color: string, quantity = 1): AscentEntry {
  const mapping = findGradeMapping(findGymGradeGuide(gym)?.id, color);
  return { color, quantity, v_grade: mapping?.min ?? null, grade_mapping_id: mapping?.id ?? null };
}
/** 클라이밍장을 바꾸면 이전 클라이밍장의 자동 환산을 들고 가지 않는다. 직접 입력한 값은 보존한다. */
export function changeAscentGym(draft: AscentDraft, gym: string): AscentDraft {
  return { ...draft, gym, items: draft.items.map(item => {
    const next = item.grade_mapping_id || (item.v_grade === null && !item.custom_color)
      ? { ...item, ...colorAscentEntry(gym, item.color, item.quantity) } : item;
    return colorDifficulty(gym, item.color) ? { ...next, manual_difficulty: null } : next;
  }) };
}
