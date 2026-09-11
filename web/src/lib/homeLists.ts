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

export async function fetchHomeLists(userId: string, onResult: {
  sessions?: (rows: Awaited<ReturnType<typeof fetchSessions>>) => void;
  people?: (rows: Awaited<ReturnType<typeof fetchPeople>>) => void;
} = {}) {
  const [sessions, people] = await Promise.all([
    readList(fetchSessions).then(rows => { onResult.sessions?.(rows); return rows; }),
    readList(() => fetchPeople({ id: userId })).then(rows => { onResult.people?.(rows); return rows; }),
  ]);
  return { sessions, people };
}
