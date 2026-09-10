import { fetchPeople, fetchSessions } from "./supabase";

/** 빈 배열은 조회 성공이다. null·잘못된 응답·통신 예외는 실패로 유지한다. */
async function readList<T>(load: () => Promise<T[] | null>): Promise<T[] | null> {
  try {
    const rows = await load();
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export async function fetchHomeLists(userId: string) {
  const [sessions, people] = await Promise.all([
    readList(fetchSessions),
    readList(() => fetchPeople({ id: userId })),
  ]);
  return { sessions, people };
}
