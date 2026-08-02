"use server";
// Cấp URL tải ảnh/video lên kho. KHÔNG nhận file — file đi thẳng từ điện thoại lên
// Supabase Storage bằng URL đã ký (xem lib/storage.ts).
//
// Cổng quyền ở đây là thứ ngăn người lạ đổ rác vào kho ảnh của nông trại: phải là
// nông dân đang hoạt động, chủ chuồng, hoặc admin.
import { activeWorkerSession, getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { signUpload, storageReady } from "@/lib/storage";

export type UploadTicket =
  | { ok: true; uploadUrl: string; publicUrl: string }
  /** `notConfigured` = nông trại chưa dựng kho ảnh → UI quay về ô dán đường dẫn,
   *  khác hẳn với lỗi tạm thời (mạng, sai định dạng) vốn chỉ cần thử lại. */
  | { ok: false; message: string; notConfigured?: true };

/** Thư mục theo mục đích — để sau này dọn kho còn biết cái gì của cái gì. */
const FOLDERS = ["viec", "nhat-ky", "ho-so", "quan-tri"] as const;
type Folder = (typeof FOLDERS)[number];

/**
 * Xin một suất tải lên.
 * `folder` quyết định ai được xin: hồ sơ/việc/nhật ký là của nông dân, quản trị là của admin.
 */
export async function createUploadUrl(folder: string, ext: string): Promise<UploadTicket> {
  if (!storageReady()) {
    return {
      ok: false, notConfigured: true,
      message: "Nông trại chưa dựng kho ảnh — tạm thời dán đường dẫn giúp mình nhé.",
    };
  }
  if (!(FOLDERS as readonly string[]).includes(folder)) {
    return { ok: false, message: "Mục tải lên không hợp lệ." };
  }

  const me = await getSessionUser();
  if (!me) return { ok: false, message: "Bạn cần đăng nhập để gửi ảnh." };

  if (folder === "quan-tri") {
    if (!(await isAdmin())) return { ok: false, message: "Mục này chỉ dành cho quản trị nông trại." };
  } else {
    // Nông dân gửi minh chứng/nhật ký/hồ sơ; chủ chuồng và admin cũng được (sau này
    // dùng cho ảnh do chính chủ chuồng gửi).
    const worker = await activeWorkerSession();
    if (!worker && me.role !== "ADMIN" && me.role !== "USER") {
      return { ok: false, message: "Tài khoản của bạn không gửi được ảnh." };
    }
  }

  const ticket = await signUpload(folder as Folder, ext);
  if (!ticket) {
    return { ok: false, message: "Định dạng này chưa nhận được. Dùng ảnh JPG/PNG hoặc video MP4 nhé." };
  }
  return { ok: true, uploadUrl: ticket.uploadUrl, publicUrl: ticket.publicUrl };
}
