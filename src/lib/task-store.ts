// Ghi nhiệm vụ vào DB. KHÔNG phải server action - hàm này tin dữ liệu gọi vào,
// nên chỉ được gọi từ action đã kiểm quyền (task-actions.ts / actions.ts).
import { prisma } from "@/lib/db";
import type { TaskKind } from "@/lib/tasks";

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
}): Promise<{ created: boolean }> {
  const existing = await prisma.barnTask.findFirst({
    where: { barnId: input.barnId, kind: input.kind, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    await prisma.barnTask.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        note: input.note ?? existing.note,
        dueAt: input.dueAt ?? existing.dueAt,
        seenAt: null, // nội dung đổi → nông dân cần ngó lại
      },
    });
    return { created: false };
  }

  await prisma.barnTask.create({
    data: {
      barnId: input.barnId, workerId: input.workerId, requestedById: input.requestedById ?? null,
      kind: input.kind, title: input.title, note: input.note ?? null, dueAt: input.dueAt ?? null,
    },
  });
  return { created: true };
}

/** Việc cùng loại đang chờ ở chuồng này (để UI biết đang có yêu cầu treo). */
export function openTaskOfKind(barnId: string, kind: TaskKind) {
  return prisma.barnTask.findFirst({ where: { barnId, kind, status: "OPEN" } });
}
