import type { GymOption } from "@/components/SessionFilterBar";

const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, "");

/** 옛 모임·프로필의 암장 이름도 마스터 별칭으로 검색한다. */
export function findGym(gyms: GymOption[], name: string | null | undefined) {
  // 홈 암장은 선택 입력이다. 미입력 회원도 홈 목록과 검색에 포함한다.
  if (!name?.trim()) return undefined;
  const key = normalize(name);
  return gyms.find(gym => [gym.name, ...(gym.aliases ?? [])].some(alias => normalize(alias) === key));
}

export function matchesSearch(query: string, values: (string | null | undefined)[]) {
  const haystack = normalize(values.filter(Boolean).join(" "));
  return query.trim().split(/\s+/).every(word => haystack.includes(normalize(word)));
}
