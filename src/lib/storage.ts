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

/**
 * Header xác thực với Supabase Storage — **phải có cả `apikey`, không chỉ `Authorization`**.
 *
 * Đây là chỗ đã làm chết toàn bộ tính năng chụp ảnh (xem §10). Supabase có hai đời key:
 * đời cũ là JWT (`eyJ…`, ~220 ký tự), đời mới là `sb_secret_…` (~40 ký tự). Với key đời
 * mới mà chỉ gửi `Authorization: Bearer`, endpoint `object/upload/sign` cố **giải mã
 * chuỗi đó như một JWT** rồi trả `400 {"message":"Invalid Compact JWS"}`. Thêm `apikey`
 * thì nó xác thực bằng đường khác và chạy bình thường.
 *
 * Bẫy ở chỗ: KHÔNG phải endpoint nào cũng vậy. `bucket` (liệt kê) và `object` (tải
 * thẳng) chấp nhận mỗi `Authorization`, nên thử sơ bộ thấy key "vẫn tốt" — chỉ đúng cái
 * endpoint mà tính năng này cần là hỏng. Gửi kèm `apikey` cho MỌI lời gọi, cả hai đời
 * key đều nhận, nên đừng bỏ đi để "cho gọn".
 */
const authHeaders = () => ({ Authorization: `Bearer ${KEY}`, apikey: KEY });

/**
 * Vì sao ký hỏng. Gọi phải phân biệt được, vì mỗi lý do là một câu khác hẳn cho người
 * dùng: `duoi-file` là họ chọn nhầm file, `kho-tu-choi` là nông trại dựng sai kho — bảo
 * họ "đổi định dạng ảnh đi" lúc đó là đuổi họ đi sửa thứ không hỏng (§10).
 */
export type SignFail = "chua-cau-hinh" | "duoi-file" | "kho-tu-choi";

/** Đuôi file cho phép. Không nhận SVG: SVG chạy được script, mà ảnh này hiện cho người khác xem. */
const EXT_OK: Record<string, "PHOTO" | "VIDEO"> = {
  jpg: "PHOTO", jpeg: "PHOTO", png: "PHOTO", webp: "PHOTO", heic: "PHOTO",
  mp4: "VIDEO", mov: "VIDEO", webm: "VIDEO",
};

export function mediaTypeOfExt(ext: string): "PHOTO" | "VIDEO" | null {
  return EXT_OK[ext.toLowerCase().replace(/^\./, "")] ?? null;
}

/**
 * Làm sạch tên thư mục. `createUploadUrl` đã chặn bằng danh sách trắng rồi, đây là lớp
 * thứ hai — nhưng phải gộp cả dấu `/` liên tiếp: bỏ mỗi ký tự lạ thì `"../../quan-tri"`
 * ra `"//quan-tri"`, tức đường dẫn rác nằm ngay cạnh thư mục của admin.
 *
 * Tách riêng ra khỏi `signUpload` để bộ kiểm gọi thẳng được — `signUpload` phải nối
 * mạng, mà §13 thì cấm bộ kiểm nối mạng, nên nếu để lẫn thì phép kiểm này không chạy ở
 * đâu cả.
 */
export function safeFolderName(folder: string): string {
  return folder
    .replace(/[^a-z0-9/-]/gi, "")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/|\/$/g, "")
    .slice(0, 40) || "khac";
}

export type SignedUpload = { uploadUrl: string; publicUrl: string; path: string };
export type SignResult = ({ ok: true } & SignedUpload) | { ok: false; reason: SignFail };

/**
 * Xin một URL tải lên dùng-một-lần cho đúng một đường dẫn.
 * `folder` chia theo mục đích (viec/, nhat-ky/, ho-so/) để sau này dọn dẹp còn dễ.
 */
export async function signUpload(folder: string, ext: string): Promise<SignResult> {
  if (!storageReady()) return { ok: false, reason: "chua-cau-hinh" };
  if (!mediaTypeOfExt(ext)) return { ok: false, reason: "duoi-file" };

  const safeFolder = safeFolderName(folder);
  const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext.toLowerCase().replace(/^\./, "")}`;
  const path = `${safeFolder}/${name}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: "{}",
    });
  } catch (e) {
    console.error("[storage] không gọi được kho ảnh", e);
    return { ok: false, reason: "kho-tu-choi" };
  }
  if (!res.ok) {
    // Ghi nguyên văn: đây là chỗ duy nhất biết vì sao kho từ chối, mà người dùng thì
    // không bao giờ thấy được nó.
    console.error("[storage] kho từ chối ký URL tải lên", res.status, await res.text().catch(() => ""));
    return { ok: false, reason: "kho-tu-choi" };
  }

  // Supabase trả về đường dẫn tương đối, vd "/object/upload/sign/chicchic/viec/….jpg?token=…"
  const { url } = (await res.json().catch(() => ({}))) as { url?: string };
  if (!url) {
    console.error("[storage] kho trả về 200 nhưng không kèm URL đã ký");
    return { ok: false, reason: "kho-tu-choi" };
  }

  return {
    ok: true,
    uploadUrl: `${BASE}/storage/v1${url.startsWith("/") ? url : `/${url}`}`,
    publicUrl: `${BASE}/storage/v1/object/public/${BUCKET}/${path}`,
    path,
  };
}

/** Host của kho ảnh — dùng cho next.config và để nhận diện URL của chính mình. */
export const storageHost = BASE ? new URL(BASE).host : null;
