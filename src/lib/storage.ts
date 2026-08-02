// Kho ảnh/video — Supabase Storage gọi thẳng qua REST, KHÔNG thêm dependency nào.
// (Repo cố ý chỉ có 4 runtime dependency; @supabase/supabase-js chỉ để ký một URL là quá nặng.)
//
// Vì sao ký URL rồi cho điện thoại tải THẲNG lên Supabase, thay vì đi qua server mình:
// serverless của Vercel giới hạn body ~4,5MB — một video 30 giây của điện thoại đời mới
// vượt xa mức đó. Tải thẳng thì file không bao giờ đi qua hàm của mình.
//
// File này KHÔNG có "use server": nó tin dữ liệu đưa vào, chỉ được gọi từ action đã kiểm quyền.
import { randomBytes } from "node:crypto";

/** Bucket phải là PUBLIC (đọc tự do) — ảnh chuồng hiện trong thẻ <img> bình thường. */
export const BUCKET = process.env.SUPABASE_BUCKET || "chicchic";

const BASE = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/** Chưa cấu hình kho ảnh → UI phải quay về ô "dán đường dẫn" thay vì hỏng. */
export const storageReady = () => !!BASE && !!KEY;

/** Đuôi file cho phép. Không nhận SVG: SVG chạy được script, mà ảnh này hiện cho người khác xem. */
const EXT_OK: Record<string, "PHOTO" | "VIDEO"> = {
  jpg: "PHOTO", jpeg: "PHOTO", png: "PHOTO", webp: "PHOTO", heic: "PHOTO",
  mp4: "VIDEO", mov: "VIDEO", webm: "VIDEO",
};

export function mediaTypeOfExt(ext: string): "PHOTO" | "VIDEO" | null {
  return EXT_OK[ext.toLowerCase().replace(/^\./, "")] ?? null;
}

export type SignedUpload = { uploadUrl: string; publicUrl: string; path: string };

/**
 * Xin một URL tải lên dùng-một-lần cho đúng một đường dẫn.
 * `folder` chia theo mục đích (viec/, nhat-ky/, ho-so/) để sau này dọn dẹp còn dễ.
 */
export async function signUpload(folder: string, ext: string): Promise<SignedUpload | null> {
  if (!storageReady()) return null;
  if (!mediaTypeOfExt(ext)) return null;

  const safeFolder = folder.replace(/[^a-z0-9/-]/gi, "").slice(0, 40) || "khac";
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext.toLowerCase().replace(/^\./, "")}`;
  const path = `${safeFolder}/${name}`;

  const res = await fetch(`${BASE}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    console.error("[storage] không ký được URL tải lên", res.status, await res.text().catch(() => ""));
    return null;
  }

  // Supabase trả về đường dẫn tương đối, vd "/object/upload/sign/chicchic/viec/….jpg?token=…"
  const { url } = (await res.json()) as { url?: string };
  if (!url) return null;

  return {
    uploadUrl: `${BASE}/storage/v1${url.startsWith("/") ? url : `/${url}`}`,
    publicUrl: `${BASE}/storage/v1/object/public/${BUCKET}/${path}`,
    path,
  };
}

/** Host của kho ảnh — dùng cho next.config và để nhận diện URL của chính mình. */
export const storageHost = BASE ? new URL(BASE).host : null;
