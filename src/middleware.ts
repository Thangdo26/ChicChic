import { NextResponse, type NextRequest } from "next/server";

// Khoá /admin bằng HTTP Basic Auth.
// - Có ADMIN_PASSWORD  → bắt buộc nhập mật khẩu (đặt biến này trên Vercel TRƯỚC khi chia link).
// - Không có           → cho vào, nhưng trang /admin hiện cảnh báo đỏ.
export function middleware(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return NextResponse.next();

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
