import { FEEDBACK_VIDEO_MAX_BYTES } from "./community";
import { currentUser, getSupabase } from "./supabase";
import type { VideoSummary } from "./community";

const BUCKET = "community-videos";
const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

export function videoFileError(file: Pick<File, "size" | "type">) {
  if (!TYPES[file.type]) return "MP4, MOV, WebM 영상을 선택해주세요";
  if (!file.size) return "비어 있는 파일이에요";
  if (file.size > FEEDBACK_VIDEO_MAX_BYTES) return "50MB 이하 영상을 선택해주세요";
  return null;
}

/** 기기에서 재생 여부를 확인하고 썸네일을 만든다. URL·디코더는 항상 해제한다. */
export async function videoThumbnail(file: File): Promise<Blob> {
  const error = videoFileError(file);
  if (error) throw new Error(error);
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error("영상 미리보기를 불러오지 못했어요. 다른 영상으로 시도해주세요")), 20000);
      let settled = false;
      const finish = (result: Blob | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (result instanceof Error) reject(result); else resolve(result);
      };
      const capture = () => {
        if (!video.videoWidth || !video.videoHeight) return;
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(new Error("미리보기를 만들 수 없어요"));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob ?? new Error("미리보기를 만들 수 없어요")), "image/jpeg", 0.8);
      };
      video.onerror = () => finish(new Error("이 기기에서 재생할 수 없는 영상이에요. MP4 영상으로 시도해주세요"));
      video.onloadeddata = () => {
        if (Number.isFinite(video.duration) && video.duration > 0.2) video.currentTime = Math.min(0.5, video.duration / 2);
        else capture();
      };
      video.onseeked = capture;
      video.src = url;
      video.load();
    });
  } finally {
    video.onloadeddata = video.onseeked = video.onerror = null;
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function feedbackMediaUrls(paths: string[]): Promise<Record<string, string>> {
  const sb = getSupabase();
  if (!sb || !paths.length) return {} as Record<string, string>;
  // 짧게 발급하고 재생 오류 시 갱신한다. 이후 발급은 차단·삭제 정책을 다시 검사한다.
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls([...new Set(paths)], 300);
  if (error) throw new Error("영상을 불러오지 못했어요");
  return Object.fromEntries((data ?? []).filter((r) => r.signedUrl).map((r) => [r.path!, r.signedUrl!]));
}

export async function fetchFeedbackVideos(before?: VideoSummary): Promise<VideoSummary[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("video_post_list", { p_before: before?.created_at ?? null, p_before_id: before?.id ?? null });
  if (error) throw new Error("영상을 불러오지 못했어요. 다시 시도해주세요");
  return data ?? [];
}

/** 내가 올린 것만 — 내 정보의 "내 영상" 이 읽는다. 목록과 같은 모양이다. */
export async function fetchMyFeedbackVideos(before?: VideoSummary): Promise<VideoSummary[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc("my_video_posts", { p_before: before?.created_at ?? null, p_before_id: before?.id ?? null });
  if (error) throw new Error("영상을 불러오지 못했어요. 다시 시도해주세요");
  return data ?? [];
}

export async function setVideoLike(id: string, liked: boolean): Promise<{ error?: string; liked?: boolean; like_count?: number }> {
  const sb = getSupabase();
  if (!sb) return { error: "no_auth" };
  const { data, error } = await sb.rpc("video_like_set", { p_post: id, p_liked: liked });
  if (error) throw new Error("좋아요를 저장하지 못했어요");
  return data as { error?: string; liked: boolean; like_count: number };
}

export type VideoDraft = { id: string; video: string; thumbnail: string };

export async function uploadFeedbackMedia(file: File, thumbnail: Blob): Promise<VideoDraft> {
  const error = videoFileError(file);
  if (error) throw new Error(error);
  const sb = getSupabase();
  const user = await currentUser();
  if (!sb || !user) throw new Error("로그인이 필요해요");
  const id = crypto.randomUUID();
  const folder = `${user.id}/${id}`;
  const draft = { id, video: `${folder}/video.${TYPES[file.type]}`, thumbnail: `${folder}/thumbnail.jpg` };
  const upload = await sb.storage.from(BUCKET).upload(draft.video, file, { contentType: file.type });
  if (upload.error) throw new Error("영상 업로드에 실패했어요. 연결을 확인하고 다시 시도해주세요");
  const thumb = await sb.storage.from(BUCKET).upload(draft.thumbnail, thumbnail, { contentType: "image/jpeg" });
  if (thumb.error) {
    await sb.storage.from(BUCKET).remove([draft.video]);
    throw new Error("썸네일 업로드에 실패했어요. 다시 시도해주세요");
  }
  return draft;
}

export async function publishFeedbackVideo(draft: VideoDraft, body: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인이 필요해요");
  const { data, error } = await sb.rpc("video_post_create", { p_id: draft.id, p_body: body, p_video: draft.video, p_thumbnail: draft.thumbnail });
  if (error?.message.includes("profile_incomplete")) throw new Error("profile_incomplete");
  if (error) throw new Error("등록 결과를 확인하지 못했어요. 다시 누르면 같은 영상으로 재시도해요");
  const messages: Record<string, string> = { no_auth: "로그인이 필요해요", no_profile: "회원 정보를 불러오지 못했어요. 다시 시도해주세요", too_fast: "1분 뒤 다시 올려주세요", empty: "내용을 적어주세요", bad_media: "영상 파일을 확인할 수 없어요" };
  if (data?.error) throw new Error(messages[data.error] ?? "등록하지 못했어요. 다시 시도해주세요");
  return data.id as string;
}

/** Normalize a user-selected thumbnail to the private bucket's JPEG format. */
export async function imageThumbnail(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("JPG, PNG, WebP 사진을 선택해주세요");
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("5MB 이하 사진을 선택해주세요");
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty image");
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("encode failed")), "image/jpeg", 0.85));
  } catch { throw new Error("사진을 읽지 못했어요. 다른 사진으로 시도해주세요"); }
  finally { URL.revokeObjectURL(url); }
}

export type VideoReplacement = { video: string; thumbnail: string };

/** Always upload to a fresh revision; never overwrite a currently published object. */
export async function uploadFeedbackReplacement(
  postId: string, previous: VideoReplacement, file: File | null, thumbnail: Blob | null,
): Promise<VideoReplacement> {
  if (!file && !thumbnail) return previous;
  if (file) {
    const invalid = videoFileError(file);
    if (invalid) throw new Error(invalid);
    if (!thumbnail) throw new Error("새 영상의 썸네일을 먼저 선택해주세요");
  }
  if (thumbnail && (thumbnail.type !== "image/jpeg" || !thumbnail.size || thumbnail.size > 5 * 1024 * 1024))
    throw new Error("썸네일 사진을 다시 선택해주세요");
  const sb = getSupabase();
  const user = await currentUser();
  if (!sb || !user) throw new Error("로그인이 필요해요");
  const folder = `${user.id}/${postId}/revisions/${crypto.randomUUID()}`;
  const replacement = { ...previous };
  const uploaded: string[] = [];
  try {
    if (file) {
      replacement.video = `${folder}/video.${TYPES[file.type]}`;
      const result = await sb.storage.from(BUCKET).upload(replacement.video, file, { contentType: file.type });
      if (result.error) throw new Error("영상 업로드에 실패했어요. 기존 영상은 유지돼요");
      uploaded.push(replacement.video);
    }
    if (thumbnail) {
      replacement.thumbnail = `${folder}/thumbnail.jpg`;
      const result = await sb.storage.from(BUCKET).upload(replacement.thumbnail, thumbnail, { contentType: "image/jpeg" });
      if (result.error) throw new Error("썸네일 업로드에 실패했어요. 다시 시도해주세요");
      uploaded.push(replacement.thumbnail);
    }
    return replacement;
  } catch (e) {
    // Only pre-publication uploads are removed. Never clean up after an ambiguous RPC response.
    if (uploaded.length) await sb.storage.from(BUCKET).remove(uploaded).catch(() => {});
    throw e;
  }
}

export async function updateFeedbackVideo(postId: string, expectedUpdatedAt: string, body: string, media: VideoReplacement) {
  const sb = getSupabase();
  if (!sb) throw new Error("로그인이 필요해요");
  const { data, error } = await sb.rpc("video_post_update", {
    p_post: postId, p_expected_updated_at: expectedUpdatedAt, p_body: body,
    p_video: media.video, p_thumbnail: media.thumbnail,
  });
  if (error?.message.includes("profile_incomplete") || data?.error === "profile_incomplete") throw new Error("profile_incomplete");
  if (error) throw new Error("저장 결과를 확인하지 못했어요. 다시 누르면 같은 내용으로 재시도해요");
  const messages: Record<string, string> = {
    not_mine: "내가 올린 영상만 수정할 수 있어요", no_auth: "로그인이 필요해요",
    empty: "영상 이야기를 적어주세요", bad_media: "영상이나 썸네일을 확인하지 못했어요. 수정 화면을 다시 열어주세요",
    conflict: "다른 화면에서 영상이 수정됐어요. 영상으로 돌아가 다시 열어주세요",
  };
  if (data?.error) throw new Error(messages[data.error] ?? "영상을 수정하지 못했어요");
  if (!data?.ok || data.id !== postId) throw new Error("저장 결과를 확인하지 못했어요. 다시 시도해주세요");
}
