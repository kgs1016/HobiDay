import { difficultyScore } from "./hobiDifficulty";

/** 최근 3개월 자체 가중 점수 + 최소 난이도 완등. V등급과 구분한다. */
export const SHOE_STAGES = [
  { id: "white", name: "흰색", base: "#E9E8E2", ink: "#51584E", minLevel: null, required: 0, points: 0 },
  { id: "green", name: "초록", base: "#63A889", ink: "#36765B", minLevel: 4, required: 5, points: 50 },
  { id: "blue", name: "파랑", base: "#6C9EDB", ink: "#456D9F", minLevel: 5, required: 10, points: 160 },
  { id: "red", name: "빨강", base: "#D96365", ink: "#A33E45", minLevel: 6, required: 15, points: 360 },
  { id: "pink", name: "핑크", base: "#DB93B4", ink: "#9D4F78", minLevel: 7, required: 20, points: 720 },
  { id: "purple", name: "보라", base: "#A28BCC", ink: "#775D9A", minLevel: 8, required: 25, points: 1300 },
  { id: "gray", name: "회색", base: "#929CA9", ink: "#5D6978", minLevel: 9, required: 30, points: 2200 },
  { id: "brown", name: "갈색", base: "#9B765D", ink: "#77543E", minLevel: 10, required: 35, points: 3500 },
  { id: "black", name: "검정", base: "#4B5260", ink: "#444D5A", minLevel: 11, required: 40, points: 5500 },
] as const;

export type ShoeColorId = (typeof SHOE_STAGES)[number]["id"];
export type StartingShoe = { stage: ShoeColorId; expires_on: string };
export type ClimbingProgress = { total: number; grade_counts: Record<string, number>; difficulty_counts: Record<string, number>; recent_total?: number; undated_total?: number; period_start?: string; period_end?: string; starting_shoe?: StartingShoe | null; can_set_start?: boolean };
/** 다른 회원에게는 문제별 기록 대신 서버가 계산한 성취 요약만 공개한다. */
export type PublicShoeAchievement = { stage: ShoeColorId; total: number; stage_source?: "starting" | "records" };

export function parseShoeAchievement(value: unknown): PublicShoeAchievement | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (!SHOE_STAGES.some(stage => stage.id === row.stage) ||
      typeof row.total !== "number" || !Number.isSafeInteger(row.total) || row.total < 0) return undefined;
  if (row.stage_source !== undefined && row.stage_source !== "starting" && row.stage_source !== "records") return undefined;
  return { stage: row.stage as ShoeColorId, total: row.total,
    ...(row.stage_source ? { stage_source: row.stage_source as "starting" | "records" } : {}) };
}

export function displayShoeStage(earned: ShoeColorId, start?: StartingShoe | null, today?: string): ShoeColorId {
  if (!start || !today || start.expires_on <= today) return earned;
  return SHOE_STAGES.findIndex(s => s.id === start.stage) > SHOE_STAGES.findIndex(s => s.id === earned) ? start.stage : earned;
}

/** 서버가 최근 3개월의 실제 완등일로 집계한 분포. total은 기간 제한 없는 전체 기록 수다. */
export function shoeProgress(progress: ClimbingProgress) {
  const points = difficultyScore(progress.difficulty_counts);
  const stages = SHOE_STAGES.map(stage => ({
    ...stage,
    count: stage.minLevel === null ? (progress.recent_total ?? progress.total) : Object.entries(progress.difficulty_counts)
      .reduce((sum, [level, count]) => sum + (Number(level) >= stage.minLevel! && Number(level) <= 11 ? count : 0), 0),
  }));
  const earned = [...stages].reverse().find(stage => stage.count >= stage.required && points >= stage.points)!;
  const current = stages.find(stage => stage.id === displayShoeStage(earned.id, progress.starting_shoe, progress.period_end))!;
  const next = stages[stages.indexOf(current) + 1] ?? null;
  return { stages, current, next, points, earned, starting: current.id !== earned.id };
}

export function shoeStartExpiresOn(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const first = new Date(Date.UTC(year, month + 2, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

/** 한국 날짜를 받은 뒤 3개월 전 같은 날을 구한다. 없는 날짜는 해당 월 마지막 날로 맞춘다. */
export function shoePeriodStart(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 4, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}
