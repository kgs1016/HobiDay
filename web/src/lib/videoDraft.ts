import type { VideoUploadPlan } from "./feedbackVideo";

type DraftInfo = { body: string; plan?: VideoUploadPlan; expires: number };
type DraftMedia = { file: File; thumbnail: Blob };

/** Media and small edits use separate records to avoid copying 50MB on each keystroke. */
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error("임시 저장 연결이 지연돼요")); }, 5000);
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open("hobiday-video-drafts", 1); }
    catch (error) { clearTimeout(timer); reject(error); return; }
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => { clearTimeout(timer); if (settled) request.result.close(); else { settled = true; resolve(request.result); } };
    request.onerror = () => { clearTimeout(timer); settled = true; reject(request.error); };
    request.onblocked = () => { clearTimeout(timer); settled = true; reject(new Error("임시 저장 공간을 열지 못했어요")); };
  });
}
export async function saveVideoDraft(owner: string, patch: Partial<DraftInfo>, media?: DraftMedia) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const read = store.get(owner + ":info");
      read.onsuccess = () => store.put({ body: "", ...read.result, ...patch, expires: Date.now() + 24 * 3600_000 }, owner + ":info");
      if (media) store.put(media, owner + ":media");
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function clearVideoDraft(owner: string) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      for (const suffix of [":info", ":media"]) tx.objectStore("drafts").delete(owner + suffix);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function readVideoDraft(owner: string): Promise<(DraftInfo & Partial<DraftMedia>) | null> {
  const db = await database();
  let result: (DraftInfo & Partial<DraftMedia>) | null = null;
  try {
    result = await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", "readonly");
      const store = tx.objectStore("drafts");
      const info = store.get(owner + ":info"), media = store.get(owner + ":media");
      tx.oncomplete = () => resolve(info.result ? { ...info.result, ...media.result } : null);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
  if (result && result.expires < Date.now()) { await clearVideoDraft(owner); return null; }
  return result;
}
