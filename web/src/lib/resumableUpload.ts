import { Upload } from "tus-js-client";
import { getSupabase } from "./supabase";
import { withDeadline } from "./network";

export type UploadOptions = { signal?: AbortSignal; onProgress?: (percent: number) => void };

/** Unique object paths and path-specific fingerprints keep retries isolated. */
export async function resumableUpload(path: string, file: Blob, options: UploadOptions = {}) {
  const sb = getSupabase();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!sb || !base) throw new Error("로그인이 필요해요");
  const url = new URL(base);
  if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(".supabase.co", ".storage.supabase.co");
  url.pathname = "/storage/v1/upload/resumable";
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", cancel);
      if (error) reject(error); else { options.onProgress?.(100); resolve(); }
    };
    const upload = new Upload(file, {
      endpoint: url.href,
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: async () => `hobiday:${url.origin}:${path}:${file.size}`,
      metadata: { bucketName: "community-videos", objectName: path, contentType: file.type, cacheControl: "3600" },
      onBeforeRequest: async req => {
        const { data, error } = await withDeadline(() => sb.auth.getSession(), 18_000, options.signal);
        if (error || !data.session) throw new Error("로그인이 필요해요");
        if (!path.startsWith(data.session.user.id + "/")) throw new Error("계정이 변경됐어요. 영상을 다시 선택해주세요");
        req.setHeader("authorization", `Bearer ${data.session.access_token}`);
        const xhr = req.getUnderlyingObject() as XMLHttpRequest;
        xhr.timeout = 90_000;
      },
      onProgress: (sent, total) => { if (!settled) options.onProgress?.(Math.min(99, Math.round(sent / total * 100))); },
      onSuccess: () => finish(),
      onError: async () => {
        // A response can disappear after the server committed the complete file.
        // The path is unique to this draft; do not overwrite an existing object.
        try {
          const { data } = await withDeadline(() => sb.storage.from("community-videos").info(path), 15_000, options.signal);
          if (data?.metadata?.size === file.size) { finish(); return; }
        } catch { /* Keep the resumable fingerprint for a user-triggered retry. */ }
        finish(new Error("업로드가 중단됐어요. 다시 누르면 이어서 올려요"));
      },
    });
    const cancel = () => {
      void upload.abort().catch(() => {});
      finish(new DOMException("업로드를 멈췄어요", "AbortError"));
    };
    if (options.signal?.aborted) { cancel(); return; }
    options.signal?.addEventListener("abort", cancel, { once: true });
    void upload.findPreviousUploads().then(previous => {
      if (settled) return;
      if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(() => { if (!settled) upload.start(); });
  });
}
