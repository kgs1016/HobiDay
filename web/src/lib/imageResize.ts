"use client";

/* 업로드 전 사진 축소.
 *
 *  프로필 사진은 카드에 작게 나오는데 폰 원본은 3~8MB 다. 그대로 올리면
 *  업로드도 느리고, 보는 쪽에서 한 장에 수 초씩 내려받는다.
 *  긴 변 1440px · JPEG 로 줄이면 화질 차이 없이 수백 KB 로 떨어진다.
 *
 *  (네이티브 카메라 경로는 플러그인이 이미 줄여주지만, 앨범에서 고르거나
 *  웹에서 올리는 경로는 원본이 그대로 왔다 — 여기서 공통으로 줄인다.) */
export async function downscaleImage(
  file: File,
  maxDim = 1440,
  quality = 0.85
): Promise<File> {
  // 이미지가 아니거나 이미 작으면 손대지 않는다
  if (!file.type.startsWith("image/") || file.size < 300 * 1024) return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1024 * 1024) return file;

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file; // 줄인 게 더 크면 원본

    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    // 못 줄이면 원본 그대로 — 업로드 자체를 막을 이유는 없다
    return file;
  } finally {
    bitmap?.close();
  }
}
