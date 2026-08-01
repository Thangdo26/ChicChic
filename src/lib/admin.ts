// Cổng quyền cho server action của /admin.
//
// LƯU Ý: middleware.ts chỉ khoá việc RENDER trang /admin. Mỗi "use server" là một
// endpoint công khai riêng, middleware không chặn — nên action nào ghi dữ liệu ở
// /admin đều phải tự gọi requireAdmin() (xem CODEMAP §11).
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";

/**
 * Hợp lệ khi một trong hai:
 * - tài khoản đang đăng nhập có role ADMIN, hoặc
 * - request mang đúng Basic Auth mà middleware đang dùng (trình duyệt tự gửi kèm
 *   header này cho mọi request tới /admin, kể cả POST của server action).
 *
 * Chưa đặt ADMIN_PASSWORD → giữ đúng hành vi của middleware: cho qua, và trang
 * /admin hiện cảnh báo đỏ.
 */
export async function isAdmin(): Promise<boolean> {
  const me = await getSessionUser();
  if (me?.role === "ADMIN") return true;

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return true;

  const header = headers().get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const [, password] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
    return !!password && password === expected;
  } catch {
    return false;
  }
}
