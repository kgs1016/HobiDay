// 암장 대표사진 업로드: GYMS/photos → Supabase Storage(gym-photos) → gyms.thumbnail_url
//
// 사용법 (web 디렉터리에서, 마이그레이션 적용 후):
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key>"   # Dashboard > Settings > API
//   node scripts/upload_gym_photos.mjs           # 확정본(GYMS/photos)만 업로드
//   node scripts/upload_gym_photos.mjs --review  # 검토폴더(GYMS/photos_review)도 포함
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
  process.exit(1);
}
const includeReview = process.argv.includes("--review");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const gymsDir = resolve(root, "GYMS");
const manifest = JSON.parse(readFileSync(resolve(gymsDir, "photos_manifest.json"), "utf-8"));

const CT = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const sb = createClient(url, key, { auth: { persistSession: false } });

let ok = 0, fail = 0, skipped = 0;
for (const item of manifest.items) {
  const isReview = item.status === "recovered_needs_review";
  if (item.status !== "ok" && !isReview) { skipped++; continue; }
  if (isReview && !includeReview) { skipped++; continue; }

  const dir = isReview ? "photos_review" : "photos";
  const filePath = resolve(gymsDir, dir, item.file);
  if (!existsSync(filePath)) { console.error(`없음: ${filePath}`); fail++; continue; }
  const ext = item.file.slice(item.file.lastIndexOf("."));
  const objectPath = item.file; // {gym_code}{ext}

  const { error: upErr } = await sb.storage
    .from("gym-photos")
    .upload(objectPath, readFileSync(filePath), {
      contentType: CT[ext] ?? "application/octet-stream",
      upsert: true,
    });
  if (upErr) { console.error(`업로드 실패 ${item.gym_code}: ${upErr.message}`); fail++; continue; }

  const { data: pub } = sb.storage.from("gym-photos").getPublicUrl(objectPath);
  const { data: rows, error: dbErr } = await sb
    .from("gyms")
    .update({
      thumbnail_url: pub.publicUrl,
      photo_source: item.source_page_url ?? item.photo_url,
      photo_permission: "미확인",
      photo_verified_at: new Date().toISOString(),
    })
    .eq("import_key", item.import_key)
    .select("id");
  if (dbErr || !rows?.length) {
    console.error(`DB 업데이트 실패 ${item.gym_code} (${item.import_key}): ${dbErr?.message ?? "매칭 행 없음"}`);
    fail++; continue;
  }
  console.log(`OK ${item.gym_code} ${item.name}${isReview ? " [검토본]" : ""}`);
  ok++;
}
console.log(`\n완료: 성공 ${ok} / 실패 ${fail} / 건너뜀 ${skipped}`);
