/** 앱 암벽화 단계. 암장의 홀드 색이나 기존 자기신고 L등급과는 별개다. */
export const SHOE_STAGES = [
  { id: "white", name: "흰색", base: "#E9E8E2", ink: "#51584E", minV: null, required: 0 },
  { id: "yellow", name: "노랑", base: "#F0C83E", ink: "#775E15", minV: 1, required: 3 },
  { id: "orange", name: "주황", base: "#EF8953", ink: "#AC542E", minV: 2, required: 5 },
  { id: "green", name: "초록", base: "#63A889", ink: "#36765B", minV: 3, required: 8 },
  { id: "blue", name: "파랑", base: "#6C9EDB", ink: "#456D9F", minV: 4, required: 10 },
  { id: "purple", name: "보라", base: "#A28BCC", ink: "#775D9A", minV: 6, required: 12 },
  { id: "black", name: "검정", base: "#4B5260", ink: "#444D5A", minV: 8, required: 15 },
] as const;

export type ShoeColorId = (typeof SHOE_STAGES)[number]["id"];
export type ClimbingProgress = { total: number; grade_counts: Record<string, number> };

/** 서버가 본인 기록 전체에서 집계한 분포. 기간·영상 수는 승급에 쓰지 않는다. */
export function shoeProgress(progress: ClimbingProgress) {
  const stages = SHOE_STAGES.map(stage => ({
    ...stage,
    count: stage.minV === null ? progress.total : Object.entries(progress.grade_counts)
      .reduce((sum, [grade, count]) => sum + (Number(grade) >= stage.minV! ? count : 0), 0),
  }));
  const current = [...stages].reverse().find(stage => stage.count >= stage.required)!;
  const next = stages[stages.indexOf(current) + 1] ?? null;
  return { stages, current, next };
}
