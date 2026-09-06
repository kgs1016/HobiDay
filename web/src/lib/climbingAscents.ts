import { getSupabase } from "./supabase";
import type { ClimbingProgress } from "./shoeProgress";

export type ClimbingAscent = {
  id: string; gym: string; problem: string; v_grade: number | null; created_at: string;
};
export const ASCENT_PAGE = 20;

export async function fetchClimbingProgress(): Promise<ClimbingProgress> {
  const sb = getSupabase();
  if (!sb) return { total: 0, grade_counts: {} };
  const { data, error } = await sb.rpc("climbing_progress");
  if (error || !data) throw new Error("완등 기록을 불러오지 못했어요");
  return data as ClimbingProgress;
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
    duplicate: "같은 암장의 같은 문제가 이미 기록되어 있어요",
    bad_input: "암장·문제·난이도를 확인해주세요", not_mine: "내 기록만 수정할 수 있어요",
  };
  if (data?.error) throw new Error(messages[data.error] ?? "기록을 저장하지 못했어요");
}

export async function deleteClimbingAscent(id: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인이 필요해요");
  const { data, error } = await sb.rpc("climbing_ascent_delete", { p_id: id });
  if (error || !data?.ok) throw new Error("기록을 삭제하지 못했어요");
}
