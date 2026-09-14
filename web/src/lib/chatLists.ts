import { fetchChats, fetchSessionChats, type Chat, type SessionChat } from "./supabase";

/** Deliver each result independently, including initial failures and empty lists. */
export async function fetchChatLists(signal: AbortSignal, onChats: (rows: Chat[] | null) => void, onRooms: (rows: SessionChat[] | null) => void) {
  async function read<T>(fetcher: (signal: AbortSignal) => Promise<T[] | null>, done: (rows: T[] | null) => void) {
    let rows: T[] | null = null;
    try { rows = await fetcher(signal); } catch { /* A failed list is independent of the other tab. */ }
    if (!signal.aborted) done(Array.isArray(rows) ? rows : null);
  }
  await Promise.all([read(fetchChats, onChats), read(fetchSessionChats, onRooms)]);
}
