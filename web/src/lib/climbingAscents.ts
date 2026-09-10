import { getSupabase } from "./supabase";
import { SHOE_STAGES, shoePeriodStart, shoeStartExpiresOn, type ClimbingProgress, type ShoeColorId, type StartingShoe } from "./shoeProgress";
import { ascentDraftError, ascentToday, type AscentDraft, type AscentRecord } from "./ascentRecord";
import { findGymGradeGuide } from "./gymGrades";
import { ascentDifficulty, HOBI_POLICY } from "./hobiDifficulty";

/** Supabase 없는 개발 화면에서만 사용하는 메모리 기록. 운영 저장과 분리한다. */
export const isAscentPreview = () => process.env.NODE_ENV === "development" && !getSupabase();
const previewRecords = new Map<string, AscentRecord>();
let previewStartingShoe: StartingShoe | null = null;

export type ClimbingAscent = {
  id: string; gym: string; problem: string; v_grade: number | null; created_at: string;
};
export const ASCENT_PAGE = 20;

export async function fetchClimbingProgress(): Promise<ClimbingProgress> {
  const sb = getSupabase();
  if (!sb) {
    const counts: Record<string, number> = {};
    const difficulties: Record<string, number> = {};
    const end = ascentToday(); const start = shoePeriodStart(end);
    let total = 0; let undated = 0;
    if (isAscentPreview()) for (const row of previewRecords.values()) for (const item of row.items) {
      total += item.quantity;
      if (!row.completed_on) undated += item.quantity;
      if (row.completed_on && row.completed_on >= start && row.completed_on <= end) {
        const key = item.v_grade === null ? "unknown" : String(item.v_grade);
        counts[key] = (counts[key] ?? 0) + item.quantity;
        const level = ascentDifficulty(row.gym, item)?.level ?? "unknown";
        difficulties[level] = (difficulties[level] ?? 0) + item.quantity;
      }
    }
    return { total, grade_counts: counts, difficulty_counts: difficulties, recent_total: Object.values(counts).reduce((sum, n) => sum + n, 0),
      undated_total: undated, period_start: start, period_end: end,
      starting_shoe: previewStartingShoe, can_set_start: isAscentPreview() && !previewStartingShoe };
  }
  const { data, error } = await sb.rpc("climbing_progress_v5");
  if (error || !data?.difficulty_counts || data.policy !== HOBI_POLICY) throw new Error("완등 기록을 불러오지 못했어요");
  return data as ClimbingProgress;
}

export async function setStartingShoe(stage: ShoeColorId): Promise<ClimbingProgress> {
  if (!SHOE_STAGES.some(item => item.id === stage)) throw new Error("암벽화 색을 선택해주세요");
  const sb = getSupabase();
  if (!sb) {
    if (!isAscentPreview()) throw new Error("로그인 후 설정할 수 있어요");
    if (previewStartingShoe && previewStartingShoe.stage !== stage) throw new Error("시작 암벽화는 이미 설정했어요");
    previewStartingShoe ??= { stage, expires_on: shoeStartExpiresOn(ascentToday()) };
    return fetchClimbingProgress();
  }
  const { data, error } = await sb.rpc("climbing_shoe_start_set", { p_stage: stage });
  if (error) throw new Error("설정 결과를 확인하지 못했어요. 같은 색으로 다시 시도해주세요");
  const errors: Record<string, string> = { no_auth: "로그인이 필요해요", no_profile: "기본 정보를 먼저 등록해주세요",
    already_set: "시작 암벽화는 이미 설정했어요. 프로필을 다시 불러와주세요", bad_stage: "암벽화 색을 선택해주세요" };
  if (!data?.ok || !data.progress?.difficulty_counts) throw new Error(errors[data?.error] ?? "암벽화를 설정하지 못했어요");
  return data.progress as ClimbingProgress;
}

export async function fetchClimbingAscents(before?: ClimbingAscent): Promise<ClimbingAscent[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("climbing_ascent_list", {
    p_before: before?.created_at ?? null, p_before_id: before?.id ?? null, p_limit: ASCENT_PAGE,
  });
  if (error) throw new Error("완등 기록을 불러오지 못했어요");
  return data ?? [];
}

export async function saveClimbingAscent(ascent: Omit<ClimbingAscent, "created_at">) {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인 후 기록할 수 있어요");
  const { data, error } = await sb.rpc("climbing_ascent_save", {
    p_id: ascent.id, p_gym: ascent.gym, p_problem: ascent.problem, p_v_grade: ascent.v_grade,
  });
  if (error) throw new Error("저장 결과를 확인하지 못했어요. 다시 시도해주세요");
  const messages: Record<string, string> = {
    no_auth: "로그인이 필요해요", no_profile: "프로필을 먼저 만들어주세요",
    duplicate: "같은 클라이밍장의 같은 문제가 이미 기록되어 있어요",
    bad_input: "클라이밍장·문제·난이도를 확인해주세요", not_mine: "내 기록만 수정할 수 있어요",
  };
  if (data?.error) throw new Error(messages[data.error] ?? "기록을 저장하지 못했어요");
}

export async function deleteClimbingAscent(id: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인이 필요해요");
  const { data, error } = await sb.rpc("climbing_ascent_delete", { p_id: id });
  if (error || !data?.ok) throw new Error("기록을 삭제하지 못했어요");
}

export async function fetchAscentHistory(before?: AscentRecord): Promise<AscentRecord[]> {
  const sb = getSupabase();
  if (!sb) return isAscentPreview() ? [...previewRecords.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .filter(row => !before || row.created_at < before.created_at || (row.created_at === before.created_at && row.id < before.id))
    .slice(0, ASCENT_PAGE) : [];
  const { data, error } = await sb.rpc("climbing_ascent_history_v2", {
    p_before: before?.created_at ?? null, p_before_id: before?.id ?? null, p_limit: ASCENT_PAGE,
  });
  if (error) throw new Error("완등 기록을 불러오지 못했어요");
  return data ?? [];
}
export async function saveAscentBatch(draft: AscentDraft & { recordId: string }) {
  const invalid = ascentDraftError(draft);
  if (invalid) throw new Error(invalid);
  const brand = findGymGradeGuide(draft.gym)?.id ?? null;
  const items = draft.items.map(item => ({ color: item.color.trim(), quantity: item.quantity,
    v_grade: item.v_grade, grade_mapping_id: item.grade_mapping_id ?? null, manual_difficulty: item.manual_difficulty ?? null }));
  const sb = getSupabase();
  if (!sb) {
    if (!isAscentPreview()) throw new Error("로그인 후 기록할 수 있어요");
    const previous = previewRecords.get(draft.recordId);
    previewRecords.set(draft.recordId, { id: draft.recordId, kind: "batch", gym: draft.gym.trim(), completed_on: draft.completed_on,
      brand_id: brand, created_at: previous?.created_at ?? new Date().toISOString(), legacy_problem: previous?.legacy_problem ?? null,
      items });
    return;
  }
  const { data, error } = await sb.rpc("climbing_ascent_batch_save_v3", {
    p_id: draft.recordId, p_gym: draft.gym.trim(), p_completed_on: draft.completed_on, p_brand_id: brand,
    p_items: items, p_legacy_id: draft.legacyId,
  });
  if (error) throw new Error("저장 결과를 확인하지 못했어요. 다시 시도해주세요");
  const messages: Record<string, string> = { no_auth: "로그인이 필요해요", no_profile: "프로필을 먼저 만들어주세요",
    bad_input: "날짜·색상·개수를 확인해주세요", bad_mapping: "환산 기준을 확인할 수 없어요. V등급을 직접 선택해주세요",
    not_mine: "내 기록만 수정할 수 있어요", not_found: "기존 기록을 찾지 못했어요" };
  if (!data?.ok) throw new Error(messages[data?.error] ?? "기록을 저장하지 못했어요");
}
export async function deleteAscentRecord(row: AscentRecord) {
  if (row.kind === "legacy") return deleteClimbingAscent(row.id);
  const sb = getSupabase();
  if (!sb) {
    if (!isAscentPreview()) throw new Error("로그인이 필요해요");
    previewRecords.delete(row.id); return;
  }
  const { data, error } = await sb.rpc("climbing_ascent_batch_delete", { p_id: row.id });
  if (error || !data?.ok) throw new Error("기록을 삭제하지 못했어요");
}
