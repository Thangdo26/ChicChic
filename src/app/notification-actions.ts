"use server";
// Đánh dấu đã đọc thông báo. Chỉ đụng được vào thông báo của CHÍNH mình.
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export type ActionResult = { ok: boolean; message: string };

/** Mở chuông ra là coi như đã đọc hết. */
export async function markNotificationsRead(): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return { ok: false, message: "Bạn cần đăng nhập." };

  const { count } = await prisma.notification.updateMany({
    where: { userId: me.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true, message: count > 0 ? `Đã đọc ${count} thông báo.` : "Không có thông báo mới." };
}

/** Xoá sạch danh sách thông báo của mình. */
export async function clearNotifications(): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return { ok: false, message: "Bạn cần đăng nhập." };

  const { count } = await prisma.notification.deleteMany({ where: { userId: me.id } });
  return { ok: true, message: count > 0 ? `Đã xoá ${count} thông báo.` : "Chưa có thông báo nào." };
}
