// Cổng quyền cho server action của /admin.
//
// LƯU Ý: middleware.ts chỉ khoá việc RENDER trang /admin. Mỗi "use server" là một
// endpoint công khai riêng, middleware không chặn - nên action nào ghi dữ liệu ở
// /admin đều phải tự gọi requireAdmin() (xem CODEMAP §11).
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";

/**
 * Hợp lệ khi một trong hai:
 * - tài khoản đang đăng nhập có role ADMIN, hoặc
 * - request mang đúng Basic Auth mà middleware đang dùng (trình duyệt tự gửi kèm
 *   header này cho mọi request tới /admin, kể cả POST của server action).
 *
 * Chưa đặt ADMIN_PASSWORD:
 * - dev cục bộ → cho qua, để còn thao tác được khi chạy `npm run dev`;
 * - production → TỪ CHỐI. Thiếu biến môi trường là lỗi cấu hình, không phải
 *   "chế độ mở" - quên đặt trên Vercel mà mở toang /admin thì ai cũng tự xác
 *   nhận cọc cho chính mình được.
 */
export async function isAdmin(): Promise<boolean> {
  const me = await getSessionUser();
  if (me?.role === "ADMIN") return true;

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return process.env.NODE_ENV !== "production";

  const header = headers().get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const [, password] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
    return !!password && password === expected;
  } catch {
    return false;
  }
}
