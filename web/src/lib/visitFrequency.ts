export const VISIT_FREQUENCIES = [
  { id: 1, label: "가끔" },
  { id: 2, label: "주 1회" },
  { id: 3, label: "주 2~3회" },
  { id: 4, label: "주 4회 이상" },
] as const;

export type VisitFrequencyId = (typeof VISIT_FREQUENCIES)[number]["id"];
export function visitFrequencyLabel(id?: VisitFrequencyId | null): string | null {
  return VISIT_FREQUENCIES.find(item => item.id === id)?.label ?? null;
}
