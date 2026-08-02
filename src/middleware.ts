import { NextResponse, type NextRequest } from "next/server";

// Khoá /admin bằng HTTP Basic Auth.
// - Có ADMIN_PASSWORD  → bắt buộc nhập mật khẩu.
// - Không có, dev       → cho vào, trang /admin hiện cảnh báo đỏ.
// - Không có, production→ ĐÓNG. Quên đặt biến trên Vercel là lỗi cấu hình, không
//   được biến thành trang quản trị công khai. (lib/admin.isAdmin giữ đúng luật này.)
export function middleware(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse(
      "Chưa cấu hình ADMIN_PASSWORD trên môi trường này — trang quản trị đang đóng.",
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [, password] = atob(header.slice(6)).split(":");
      if (password && password === expected) return NextResponse.next();
    } catch {
      /* header hỏng → rơi xuống 401 */
    }
  }

  return new NextResponse("Cần mật khẩu quản trị.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ChicChic Admin", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/admin/:path*", "/admin"] };
