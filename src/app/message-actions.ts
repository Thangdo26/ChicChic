"use server";
// Hộp thư của chuồng. Mọi hàm ở đây bắt đầu bằng `threadAccess()` — cổng quyền duy
// nhất (lib/messages.ts). Mỗi "use server" là một endpoint công khai (CODEMAP §1.4).
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { upsertTask } from "@/lib/task-store";
import { TASK_META, type TaskKind } from "@/lib/tasks";
import {
  CONTACT_WARNING, MAX_BODY, listMessages, looksLikeContactSwap, markRead,
  sendingBlocked, shouldNotify, threadAccess,
} from "@/lib/messages";
import type { MessageVM } from "@/lib/messages";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Loại việc chủ chuồng biến một tin nhắn thành — giống hệt danh sách ở TaskPanel. */
const ASKABLE: TaskKind[] = ["FEED", "CHECK"];

function revalidateThread(slug: string) {
  revalidatePath(`/chuong/${slug}/tin-nhan`);
  revalidatePath(`/chuong/${slug}`);
  revalidatePath(`/nong-trai/chuong/${slug}`);
  revalidatePath("/nong-trai");
}

/** Kết quả gửi tin: kèm luôn danh sách mới để khung soạn không phải chờ router refresh. */
export type SendResult = ActionResult & { list?: MessageVM[]; warned?: boolean };

/** Gửi một tin vào hộp thư của chuồng. Chủ chuồng hoặc nông dân phụ trách. */
export async function sendMessage(barnSlug: string, raw: string): Promise<SendResult> {
  const gate = await threadAccess(barnSlug);
  if (!gate) return nope("Bạn không nhắn được trong chuồng này.");
  if (gate.role === "ADMIN" || !gate.meId) {
    return nope("Nông trại chỉ đọc hộp thư này, không nhắn thay hai bên được.");
  }

  const body = raw.trim().slice(0, MAX_BODY);
  if (!body) return nope("Bạn chưa viết gì cả.");

  const blocked = await sendingBlocked(gate.barn.id, gate.meId, gate.otherName);
  if (blocked) return nope(blocked);

  const flagged = looksLikeContactSwap(body);

  await prisma.barnMessage.create({
    data: {
      barnId: gate.barn.id, senderId: gate.meId,
      author: gate.role === "OWNER" ? "OWNER" : "WORKER",
      body, flagged,
    },
  });

  // Đo đạc sau khi ghi DB xong, tự nuốt lỗi (§9.13).
  await track("message_sent", {
    userId: gate.meId, barnSlug,
    props: { author: gate.role, length: body.length, flagged },
  });

  // Chuông chỉ kêu khi phía bên kia chưa có tin nào của mình đang chờ đọc (§9.8).
  if (await shouldNotify(gate.barn.id, gate.meId)) {
    await notify({
      userId: gate.otherUserId,
      kind: "MESSAGE",
      title: `💬 Tin nhắn mới · ${gate.barn.label}`,
      body: body.slice(0, 140),
      href: gate.role === "OWNER" ? `/nong-trai/chuong/${barnSlug}` : `/chuong/${barnSlug}/tin-nhan`,
    });
  }

  revalidateThread(barnSlug);
  const list = await listMessages(gate.barn.id, gate.meId);
  return {
    ok: true,
    message: flagged ? CONTACT_WARNING : "Đã gửi.",
    list,
    warned: flagged,
  };
}

/** Mở hộp thư ra là coi như đã đọc hết phần phía bên kia gửi. */
export async function markThreadRead(barnSlug: string): Promise<ActionResult> {
  const gate = await threadAccess(barnSlug);
  if (!gate?.meId || gate.role === "ADMIN") return nope("Không có gì để đánh dấu.");

  const count = await markRead(gate.barn.id, gate.meId);
  if (count > 0) revalidateThread(barnSlug);
  return ok(count > 0 ? `Đã đọc ${count} tin.` : "Không có tin mới.");
}

/** Một trong hai bên báo cáo một tin — mở khoá cho nông trại đọc hộp thư này. */
export async function reportMessage(messageId: string): Promise<ActionResult> {
  const msg = await prisma.barnMessage.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, reportedAt: true, barn: { select: { slug: true } } },
  });
  if (!msg) return nope("Tin này không còn nữa.");

  const gate = await threadAccess(msg.barn.slug);
  if (!gate?.meId || gate.role === "ADMIN") return nope("Bạn không báo cáo được tin này.");
  if (msg.senderId === gate.meId) return nope("Đây là tin của chính bạn.");
  if (msg.reportedAt) return ok("Tin này đã được báo cáo rồi — nông trại sẽ xem lại.");

  await prisma.barnMessage.update({ where: { id: msg.id }, data: { reportedAt: new Date() } });
  revalidateThread(msg.barn.slug);
  revalidatePath("/admin");
  return ok("Đã báo cáo. Nông trại sẽ đọc lại hộp thư này và liên hệ với bạn.");
}

/**
 * Biến một tin nhắn thành việc có minh chứng.
 *
 * Đây là ranh giới giữ bất biến §9.1/§9.2: nhắn "cho ăn thêm giúp em" KHÔNG phải là
 * đã giao việc. Chỉ khi bấm nút này mới sinh BarnTask, và nông dân vẫn phải đính
 * ảnh/video mới đóng được. Tin nhắn là nơi phát sinh ý định; việc là nơi thực thi.
 */
export async function messageToTask(messageId: string, kind: string): Promise<ActionResult> {
  if (!ASKABLE.includes(kind as TaskKind)) return nope("Loại việc không hợp lệ.");

  const msg = await prisma.barnMessage.findUnique({
    where: { id: messageId },
    select: { id: true, body: true, barn: { select: { slug: true } } },
  });
  if (!msg) return nope("Tin này không còn nữa.");

  const gate = await threadAccess(msg.barn.slug);
  // Chỉ CHỦ CHUỒNG giao việc được — nông dân không tự giao việc cho mình rồi tự đóng.
  if (!gate?.meId || gate.role !== "OWNER") return nope("Chỉ chủ chuồng giao việc được.");
  if (!gate.barn.workerId) return nope("Chuồng chưa có nông dân phụ trách.");

  const k = kind as TaskKind;
  const meta = TASK_META[k];
  const { created } = await upsertTask({
    barnId: gate.barn.id, workerId: gate.barn.workerId, requestedById: gate.meId,
    kind: k, title: meta.label, note: msg.body.slice(0, 300), dueAt: null,
  });

  await track("message_to_task", { userId: gate.meId, barnSlug: msg.barn.slug, props: { kind: k, merged: !created } });

  await notify({
    userId: gate.otherUserId,
    kind: "TASK_NEW",
    title: `${meta.emoji} Việc mới: ${meta.label}`,
    body: `${gate.barn.label} · ${msg.body.slice(0, 200)}`,
    href: `/nong-trai/chuong/${msg.barn.slug}`,
  });

  revalidateThread(msg.barn.slug);
  return ok(
    created
      ? `Đã chuyển thành việc "${meta.label}". ${gate.otherName} phải gửi ảnh minh chứng mới đóng được việc này.`
      : `${gate.otherName} đã có việc "${meta.label}" đang chờ — mình gộp lời nhắn vào việc đó.`,
  );
}
