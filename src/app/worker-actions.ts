"use server";
// Cổng nông dân: nhận việc, làm xong thì gửi ảnh/video minh chứng rồi tích hoàn thành.
// Nguyên tắc: KHÔNG tích xong được nếu chưa có ảnh/video — "đã xong" luôn kèm bằng chứng.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getWorkerSession } from "@/lib/auth";
import { normalizeMediaUrl } from "@/lib/decor";
import { TASK_META, type TaskKind } from "@/lib/tasks";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Loại việc → loại mục nhật ký hiện cho chủ chuồng. */
const UPDATE_KIND: Record<TaskKind, "DECOR" | "RANGE" | "CARE" | "PHOTO"> = {
  DECOR: "DECOR", RANGE_OUT: "RANGE", RANGE_IN: "RANGE", FEED: "CARE", CHECK: "PHOTO",
};

function touch(barnSlug: string) {
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${barnSlug}`);
  revalidatePath(`/chuong/${barnSlug}`);
  revalidatePath(`/chuong/${barnSlug}/nhat-ky`);
  revalidatePath("/tai-khoan");
}

/** Nông dân mở hộp việc → hết dấu "mới" trên các việc đang chờ. */
export async function markTasksSeen(): Promise<ActionResult> {
  const w = await getWorkerSession();
  if (!w) return nope("Bạn không có hồ sơ nông dân.");
  const { count } = await prisma.barnTask.updateMany({
    where: { workerId: w.workerId, status: "OPEN", seenAt: null },
    data: { seenAt: new Date() },
  });
  revalidatePath("/nong-trai");
  return count > 0 ? ok(`Đã đánh dấu đã đọc ${count} việc.`) : ok("Không có việc mới nào.");
}

/**
 * Hoàn thành một nhiệm vụ.
 * formData: url (bắt buộc), type PHOTO|VIDEO, note (ghi chú gửi chủ chuồng).
 */
export async function completeTask(taskId: string, formData: FormData): Promise<ActionResult> {
  const w = await getWorkerSession();
  if (!w) return nope("Bạn không có hồ sơ nông dân.");

  const task = await prisma.barnTask.findUnique({
    where: { id: taskId },
    include: { barn: { select: { id: true, slug: true, label: true, workerId: true } } },
  });
  if (!task) return nope("Việc này không còn nữa.");
  if (task.workerId !== w.workerId) return nope("Việc này không thuộc danh sách của bạn.");
  if (task.status === "DONE") return nope("Việc này đã báo xong trước đó rồi.");

  const url = normalizeMediaUrl(String(formData.get("url") ?? ""));
  if (!url) return nope("Cần ảnh hoặc video minh chứng — dán đường dẫn bắt đầu bằng https:// hoặc /");

  const type = String(formData.get("type") ?? "PHOTO") === "VIDEO" ? "VIDEO" : "PHOTO";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const kind = task.kind as TaskKind;
  const meta = TASK_META[kind];
  const text = note || `${meta.emoji} ${meta.label} — đã làm xong, gửi bạn ảnh chụp lại.`;

  await prisma.$transaction(async (tx) => {
    const update = await tx.farmUpdate.create({
      data: { barnId: task.barn.id, workerId: w.workerId, kind: UPDATE_KIND[kind], text },
    });
    const media = await tx.barnMedia.create({
      data: {
        barnId: task.barn.id, workerId: w.workerId, type, url,
        caption: text.slice(0, 200), capturedAt: new Date(), updateId: update.id,
      },
    });
    await tx.barnTask.update({
      where: { id: task.id },
      data: { status: "DONE", doneAt: new Date(), doneNote: note || null, proofMediaId: media.id },
    });

    // Việc làm xong ngoài đời thì trạng thái trong app mới đổi theo.
    if (kind === "RANGE_OUT") await tx.barn.update({ where: { id: task.barn.id }, data: { outside: true } });
    if (kind === "RANGE_IN") await tx.barn.update({ where: { id: task.barn.id }, data: { outside: false } });
    if (kind === "DECOR") {
      // Ảnh chứng minh gắn vào các món vừa lắp mà chưa có ảnh nào
      await tx.barnDecor.updateMany({ where: { barnId: task.barn.id, photoUrl: null }, data: { photoUrl: url } });
    }
  });

  touch(task.barn.slug);
  return ok(`Đã báo xong "${meta.label}" cho ${task.barn.label} — ảnh đã gửi tới chủ chuồng.`);
}

/** Không làm được (mưa bão, đàn ốm…) — nói thật, kèm lý do. */
export async function declineTask(taskId: string, reason: string): Promise<ActionResult> {
  const w = await getWorkerSession();
  if (!w) return nope("Bạn không có hồ sơ nông dân.");

  const body = reason.trim().slice(0, 300);
  if (body.length < 5) return nope("Ghi giúp lý do ngắn gọn để chủ chuồng hiểu nhé.");

  const task = await prisma.barnTask.findUnique({
    where: { id: taskId },
    include: { barn: { select: { id: true, slug: true } } },
  });
  if (!task) return nope("Việc này không còn nữa.");
  if (task.workerId !== w.workerId) return nope("Việc này không thuộc danh sách của bạn.");
  if (task.status !== "OPEN") return nope("Việc này đã xử lý rồi.");

  await prisma.$transaction(async (tx) => {
    await tx.barnTask.update({
      where: { id: task.id },
      data: { status: "DECLINED", doneAt: new Date(), doneNote: body },
    });
    await tx.farmUpdate.create({
      data: {
        barnId: task.barn.id, workerId: w.workerId, kind: "NOTE",
        text: `Chưa làm được "${TASK_META[task.kind as TaskKind].label}": ${body}`,
      },
    });
  });

  touch(task.barn.slug);
  return ok("Đã báo lại cho chủ chuồng kèm lý do.");
}

/**
 * Cập nhật hằng ngày do nông dân tự gửi (không cần ai giao việc).
 * Đây là vòng lặp giữ chân của sản phẩm: mỗi ngày chủ chuồng mở app là thấy tin mới.
 */
export async function postDailyUpdate(formData: FormData): Promise<ActionResult> {
  const w = await getWorkerSession();
  if (!w) return nope("Bạn không có hồ sơ nông dân.");

  const barnSlug = String(formData.get("barn") ?? "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 1000);
  const rawUrl = String(formData.get("url") ?? "").trim();
  const type = String(formData.get("type") ?? "PHOTO") === "VIDEO" ? "VIDEO" : "PHOTO";

  if (!text) return nope("Viết vài dòng cho chủ chuồng đã nhé.");

  const barn = await prisma.barn.findUnique({ where: { slug: barnSlug }, select: { id: true, slug: true, label: true, workerId: true } });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (barn.workerId !== w.workerId) return nope("Chuồng này không thuộc danh sách bạn phụ trách.");

  const url = rawUrl ? normalizeMediaUrl(rawUrl) : null;
  if (rawUrl && !url) return nope("Đường dẫn ảnh/video chưa hợp lệ (cần https:// hoặc /).");

  // Cùng chuồng + cùng nội dung trong 1 phút → coi như bấm hai lần
  const dup = await prisma.farmUpdate.findFirst({
    where: { barnId: barn.id, text, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (dup) return nope("Vừa gửi đúng nội dung này rồi — không đăng trùng.");

  await prisma.$transaction(async (tx) => {
    const update = await tx.farmUpdate.create({
      data: { barnId: barn.id, workerId: w.workerId, kind: url ? type : "CARE", text },
    });
    if (url) {
      await tx.barnMedia.create({
        data: {
          barnId: barn.id, workerId: w.workerId, type, url,
          caption: text.slice(0, 200), capturedAt: new Date(), updateId: update.id,
        },
      });
    }
  });

  touch(barn.slug);
  return ok(`Đã gửi cập nhật tới chủ ${barn.label}${url ? " kèm ảnh/video" : ""}.`);
}
