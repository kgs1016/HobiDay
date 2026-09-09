import { findGymGradeGuide } from "./gymGrades";

/** 하비데이 상대 난이도 정책 v1. V등급이나 암장 간 절대 실력의 등가표가 아니다. */
export const HOBI_DIFFICULTIES = [
  { level: 1, points: 1 }, { level: 2, points: 2 }, { level: 3, points: 3 },
  { level: 4, points: 5 }, { level: 5, points: 8 }, { level: 6, points: 12 },
  { level: 7, points: 18 }, { level: 8, points: 26 }, { level: 9, points: 36 },
  { level: 10, points: 50 }, { level: 11, points: 70 },
] as const;
export const HOBI_POLICY = "color-v1";
export const validHobiLevel = (level: unknown): level is number =>
  typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 11;

/** 서로 다른 단계 수를 1~11에 배치한다. 색 이름은 암장 안에서만 의미가 있다. */
export function colorDifficulty(gym: string, color: string | null) {
  const guide = findGymGradeGuide(gym);
  const index = guide?.colors.findIndex(item => item.name === color?.trim()) ?? -1;
  if (!guide || index < 0) return null;
  return HOBI_DIFFICULTIES[Math.floor(index * 10 / (guide.colors.length - 1))];
}

/** 색 기준 없는 기존 V기록의 호환용 자체 배점. V 자체를 변경하지 않는다. */
export function difficultyFromV(grade: number | null) {
  if (grade === null || !Number.isInteger(grade) || grade < -1 || grade > 17) return null;
  const level = grade <= 0 ? 1 : grade === 1 ? 2 : Math.min(11, grade + 2);
  return HOBI_DIFFICULTIES[level - 1];
}
export function ascentDifficulty(gym: string, item: { color: string | null; v_grade: number | null; manual_difficulty?: number | null }) {
  return colorDifficulty(gym, item.color) ?? (validHobiLevel(item.manual_difficulty)
    ? HOBI_DIFFICULTIES[item.manual_difficulty - 1] : difficultyFromV(item.v_grade));
}
export function difficultyScore(counts: Record<string, number>) {
  return HOBI_DIFFICULTIES.reduce((sum, item) => sum + item.points * (counts[item.level] ?? 0), 0);
}
