"use server";
// Cô chú nông dân tự sửa hồ sơ của MÌNH và đăng ảnh/video giới thiệu bản thân.
// Mọi hàm ở đây chỉ đụng được vào hồ sơ gắn với phiên đang đăng nhập -
// không nhận workerId từ client, tránh sửa hồ sơ người khác.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { activeWorkerSession } from "@/lib/auth";
import { MAX_INTRO_MEDIA, normalizeMediaUrl } from "@/lib/decor";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

function touch(workerId: string) {
  revalidatePath("/nong-trai/ho-so");
  revalidatePath("/nong-trai");
  revalidatePath("/nhan-chuong");
  revalidatePath(`/nong-dan/${workerId}`);
}

export type ProfileInput = {
  name: string;
  area: string;
  bio: string;
  birthYear: number | null;
  yearsExp: number;
  consentMedia: boolean;
};

/** Cập nhật hồ sơ cá nhân. Tên hiển thị đổi theo ở cả tài khoản đăng nhập. */
export async function updateMyProfile(input: ProfileInput): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");

  const name = String(input.name ?? "").trim().slice(0, 80);
  const area = String(input.area ?? "").trim().slice(0, 120);
  const bio = String(input.bio ?? "").trim().slice(0, 600);
  if (name.length < 2) return nope("Tên chưa hợp lệ - nhập giúp mình tên đầy đủ nhé.");
  if (area.length < 2) return nope("Nhập khu vực giúp mình (vd: Ba Vì, Hà Nội).");

  const yearsExp = Math.max(0, Math.min(60, Number(input.yearsExp) || 0));

  // Năm sinh: để trống cũng được, nhưng đã điền thì phải hợp lý.
  const thisYear = new Date().getFullYear();
  let birthYear: number | null = null;
  if (input.birthYear != null && String(input.birthYear) !== "") {
    const y = Number(input.birthYear);
    if (!Number.isInteger(y) || y < thisYear - 100 || y > thisYear - 15) {
      return nope(`Năm sinh chưa hợp lệ - nhập trong khoảng ${thisYear - 100}–${thisYear - 15}.`);
    }
    birthYear = y;
  }

  await prisma.$transaction([
    prisma.farmWorker.update({
      where: { id: w.workerId },
      data: { name, area, bio: bio || null, birthYear, yearsExp, consentMedia: !!input.consentMedia },
    }),
    prisma.user.update({ where: { id: w.user.id }, data: { name } }),
  ]);

  touch(w.workerId);
  return ok("Đã lưu hồ sơ. Khách chọn người chăm chuồng sẽ thấy thông tin mới của cô/chú.");
}

/** Thêm một ảnh/video giới thiệu (dán đường dẫn - giống cách gửi ảnh minh chứng). */
export async function addIntroMedia(input: {
  url: string; type: "PHOTO" | "VIDEO"; caption?: string; posterUrl?: string;
}): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");

  const url = normalizeMediaUrl(String(input.url ?? ""));
  if (!url) return nope("Đường dẫn chưa hợp lệ - cần bắt đầu bằng https:// hoặc /");

  const count = await prisma.workerMedia.count({ where: { workerId: w.workerId } });
  if (count >= MAX_INTRO_MEDIA) {
    return nope(`Hồ sơ giữ tối đa ${MAX_INTRO_MEDIA} ảnh/video - xoá bớt mục cũ rồi thêm mục mới nhé.`);
  }

  // Cùng một đường dẫn thì không thêm hai lần
  const dup = await prisma.workerMedia.findFirst({ where: { workerId: w.workerId, url }, select: { id: true } });
  if (dup) return nope("Mục này đã có trong hồ sơ rồi.");

  await prisma.workerMedia.create({
    data: {
      workerId: w.workerId,
      type: input.type === "VIDEO" ? "VIDEO" : "PHOTO",
      url,
      posterUrl: input.posterUrl ? normalizeMediaUrl(input.posterUrl) : null,
      caption: String(input.caption ?? "").trim().slice(0, 200) || null,
      sortOrder: count,
    },
  });

  touch(w.workerId);
  return ok(`Đã thêm vào hồ sơ (${count + 1}/${MAX_INTRO_MEDIA}).`);
}

/** Xoá một mục khỏi hồ sơ của chính mình. */
export async function deleteIntroMedia(mediaId: string): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");

  // deleteMany + điều kiện workerId: không xoá được mục của người khác dù biết id
  const { count } = await prisma.workerMedia.deleteMany({ where: { id: mediaId, workerId: w.workerId } });
  if (count === 0) return nope("Mục này không còn trong hồ sơ của bạn.");

  touch(w.workerId);
  return ok("Đã xoá khỏi hồ sơ.");
}
