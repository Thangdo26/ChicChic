// Ghi nhiệm vụ vào DB. KHÔNG phải server action - hàm này tin dữ liệu gọi vào,
// nên chỉ được gọi từ action đã kiểm quyền (task-actions.ts / actions.ts).
import { prisma } from "@/lib/db";
import type { TaskKind } from "@/lib/tasks";
import type { Prisma } from "@prisma/client";

/**
 * Tạo hoặc gộp một nhiệm vụ.
 * Chuồng đã có đúng việc cùng loại đang chờ → KHÔNG tạo thêm, chỉ cập nhật lời nhắn/giờ hẹn.
 * Nhờ vậy bấm "thả vườn" hai lần hay lưu bố cục nhiều lần không làm ngập hộp việc.
 */
export async function upsertTask(input: {
  barnId: string;
  workerId: string;
  requestedById?: string | null;
  kind: TaskKind;
  title: string;
  note?: string | null;
  dueAt?: Date | null;
}, transaction?: Prisma.TransactionClient): Promise<{ taskId: string; created: boolean }> {
  if (!transaction) return prisma.$transaction((tx) => upsertTask(input, tx));
  const tx = transaction;
  // Khóa chuồng trước khi đọc: hai caller cùng thấy không có việc không được tạo hai dòng.
  // Khóa cũng tuần tự hóa với đổi nông dân; không ghi đè workerId từ snapshot cũ.
  const locked = await tx.barn.updateMany({
    where: { id: input.barnId, workerId: input.workerId }, data: { workerId: input.workerId },
  });
  if (locked.count !== 1) throw new Error("TASK_BARN_ASSIGNMENT_CHANGED");
  const existing = await tx.barnTask.findFirst({
    where: { barnId: input.barnId, kind: input.kind, status: "OPEN", lifecycleRequestId: null },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const changed = await tx.barnTask.updateMany({
      where: { id: existing.id, status: "OPEN", workerId: input.workerId },
      data: {
        title: input.title,
        note: input.note ?? existing.note,
        dueAt: input.dueAt ?? existing.dueAt,
        seenAt: null, // nội dung đổi → nông dân cần ngó lại
      },
    });
    if (changed.count === 1) return { taskId: existing.id, created: false };
    // complete/decline vừa thắng: yêu cầu mới không được sửa nội dung việc đã đóng.
  }

  const task = await tx.barnTask.create({
    data: {
      barnId: input.barnId, workerId: input.workerId, requestedById: input.requestedById ?? null,
      kind: input.kind, title: input.title, note: input.note ?? null, dueAt: input.dueAt ?? null,
    },
  });
  return { taskId: task.id, created: true };
}

/** Việc cùng loại đang chờ ở chuồng này (để UI biết đang có yêu cầu treo). */
export function openTaskOfKind(barnId: string, kind: TaskKind) {
  return prisma.barnTask.findFirst({ where: { barnId, kind, status: "OPEN" } });
}
