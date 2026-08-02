// Phần dùng chung của thông báo — KHÔNG import Prisma, để client bundle dùng được.
// (lib/notify.ts mới là nơi ghi DB, chỉ chạy phía server.)

/** Giữ đúng thứ tự & tên với enum NotifyKind trong schema.prisma. */
export type NotifyKind =
  | "TASK_NEW"
  | "TASK_DONE"
  | "TASK_DECLINED"
  | "TASK_CANCELLED"
  | "BARN_UPDATE"
  | "PAYMENT"
  | "BARN_ASSIGNED"
  | "BARN_RETURNED"
  | "ACCOUNT"
  | "MILESTONE"
  | "MESSAGE";

/** Icon hiện bên trái mỗi dòng thông báo. */
export const NOTIFY_ICON: Record<NotifyKind, string> = {
  TASK_NEW: "📋",
  TASK_DONE: "✅",
  TASK_DECLINED: "⚠️",
  TASK_CANCELLED: "↩️",
  BARN_UPDATE: "📷",
  PAYMENT: "💰",
  BARN_ASSIGNED: "🏡",
  BARN_RETURNED: "🌾",
  ACCOUNT: "🔑",
  MILESTONE: "🎉",
  MESSAGE: "💬",
};

export type NotificationVM = {
  id: string;
  kind: NotifyKind;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};
