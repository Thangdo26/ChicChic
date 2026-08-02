"use server";
// Giao việc cho nông dân phụ trách chuồng. Chỉ CHỦ CHUỒNG (hoặc admin) giao được.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { upsertTask } from "@/lib/task-store";
import { track } from "@/lib/track";
import { TASK_META, type TaskKind } from "@/lib/tasks";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

const KINDS: TaskKind[] = ["DECOR", "RANGE_OUT", "RANGE_IN", "FEED", "CHECK"];

/** Không cho một chuồng chất đống việc chưa làm — nông dân là người thật, không phải hàng đợi vô hạn. */
const MAX_OPEN_PER_BARN = 6;

/** Chủ chuồng giao một việc mới. */
export async function requestTask(
  barnSlug: string,
  kind: string,
  note: string,
  dueAtIso: string | null,
): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để giao việc cho nông dân.");
  if (!KINDS.includes(kind as TaskKind)) return nope("Loại việc không hợp lệ.");

  const barn = await prisma.barn.findUnique({
    where: { slug: barnSlug },
    select: { id: true, ownerId: true, workerId: true, label: true, worker: { select: { name: true, userId: true } } },
  });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (barn.ownerId !== me.id && me.role !== "ADMIN") return nope("Chuồng này không thuộc tài khoản của bạn.");
  if (!barn.workerId) return nope("Chuồng chưa có nông dân phụ trách.");

  const openCount = await prisma.barnTask.count({ where: { barnId: barn.id, status: "OPEN" } });
  if (openCount >= MAX_OPEN_PER_BARN) {
    return nope(`Chuồng đang có ${openCount} việc chờ ${barn.worker?.name ?? "nông dân"} làm. Đợi xong bớt rồi giao tiếp nhé.`);
  }

  const k = kind as TaskKind;
  const meta = TASK_META[k];
  const dueAt = dueAtIso ? new Date(dueAtIso) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return nope("Giờ hẹn không hợp lệ.");

  const { created } = await upsertTask({
    barnId: barn.id, workerId: barn.workerId, requestedById: me.id,
    kind: k, title: meta.label, note: note.trim().slice(0, 300) || null, dueAt,
  });

  await track("task_requested", {
    userId: me.id, barnSlug,
    // `merged` = gộp vào việc đang chờ. Phân biệt để không thổi phồng mức tương tác.
    props: { kind: k, merged: !created, hasDueAt: !!dueAt },
  });

  await notify({
    userId: barn.worker?.userId,
    kind: "TASK_NEW",
    title: `${meta.emoji} Việc mới: ${meta.label}`,
    body: `${barn.label} · ${note.trim().slice(0, 200) || "chủ chuồng vừa giao qua app"}`,
    href: `/nong-trai/chuong/${barnSlug}#viec`,
  });

  revalidatePath(`/chuong/${barnSlug}`);
  revalidatePath("/nong-trai");
  const who = barn.worker?.name ?? "nông dân";
  return ok(
    created
      ? `Đã gửi việc "${meta.label}" tới ${who}. Xong việc, ${who} sẽ gửi kèm ảnh/video minh chứng.`
      : `${who} đã có việc "${meta.label}" đang chờ — mình cập nhật lời nhắn mới cho việc đó.`,
  );
}

/** Chủ chuồng rút lại một việc chưa ai làm. */
export async function cancelTask(taskId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập.");

  const task = await prisma.barnTask.findUnique({
    where: { id: taskId },
    select: {
      id: true, status: true, title: true,
      barn: { select: { slug: true, label: true, ownerId: true, worker: { select: { userId: true } } } },
    },
  });
  if (!task) return nope("Việc này không còn nữa.");
  if (task.barn.ownerId !== me.id && me.role !== "ADMIN") return nope("Việc này không thuộc chuồng của bạn.");
  if (task.status !== "OPEN") return nope("Việc đã xử lý xong — không rút lại được.");

  await prisma.barnTask.delete({ where: { id: task.id } });
  await notify({
    userId: task.barn.worker?.userId,
    kind: "TASK_CANCELLED",
    title: `Chủ chuồng rút lại việc "${task.title}"`,
    body: `${task.barn.label} · không cần làm nữa nhé`,
    href: `/nong-trai/chuong/${task.barn.slug}#viec`,
  });
  revalidatePath(`/chuong/${task.barn.slug}`);
  revalidatePath("/nong-trai");
  return ok("Đã rút lại việc này.");
}
