// Thông báo trên hình chuông ở thanh trên.
// Quy tắc: MỖI hành động hoàn tất của một bên thì đẩy một dòng cho bên còn lại -
// chủ chuồng bấm gì thì nông dân biết, nông dân làm xong thì chủ chuồng biết.
//
// File này KHÔNG có "use server" (giống lib/task-store.ts): nó tin dữ liệu đưa vào,
// nên chỉ được gọi từ action/route đã kiểm quyền xong.
import { prisma } from "@/lib/db";
import type { NotificationVM, NotifyKind } from "@/lib/notify-meta";

export type NotifyInput = {
  userId: string | null | undefined;
  kind: NotifyKind;
  title: string;
  body?: string | null;
  href?: string | null;
};

/**
 * Đẩy một thông báo. Không có người nhận thì bỏ qua im lặng.
 * Không bao giờ ném lỗi ra ngoài: thông báo hỏng không được phép làm hỏng
 * hành động chính (đã ghi DB xong rồi mới gọi tới đây).
 */
export async function notify(input: NotifyInput): Promise<void> {
  if (!input.userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title.slice(0, 160),
        body: input.body?.slice(0, 300) ?? null,
        href: input.href ?? null,
      },
    });
  } catch (e) {
    console.error("[notify] không ghi được thông báo", e);
  }
}

/** Gửi cho nhiều người một lúc (bỏ trùng, bỏ null). */
export async function notifyMany(userIds: (string | null | undefined)[], n: Omit<NotifyInput, "userId">) {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
  await Promise.all(ids.map((userId) => notify({ ...n, userId })));
}

/** Tài khoản đăng nhập của nông dân đang phụ trách một chuồng (null nếu chưa gắn tài khoản). */
export async function workerUserIdOfBarn(barnId: string): Promise<string | null> {
  const barn = await prisma.barn.findUnique({
    where: { id: barnId },
    select: { worker: { select: { userId: true } } },
  });
  return barn?.worker?.userId ?? null;
}

/** Số thông báo chưa đọc - dùng cho chấm đỏ trên chuông. */
export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** 15 thông báo gần nhất, mới trước. */
export async function listNotifications(userId: string, take = 15): Promise<NotificationVM[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
    read: !!n.readAt,
    createdAt: n.createdAt.toISOString(),
  }));
}
