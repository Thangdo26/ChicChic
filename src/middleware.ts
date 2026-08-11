import { NextResponse, type NextRequest } from "next/server";
import { bocMatKhauBasic } from "@/lib/gates";

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
      "Chưa cấu hình ADMIN_PASSWORD trên môi trường này - trang quản trị đang đóng.",
      { status: 503 },
    );
  }

  // Dùng CHUNG `bocMatKhauBasic` với `lib/admin.isAdmin` (§11.18). Bản cũ ở đây tự bóc
  // bằng `atob(...).split(":")` - cắt cụt mật khẩu **có dấu hai chấm**, nên một mật khẩu
  // như `chic:2026` bị middleware từ chối trong khi `isAdmin()` chấp nhận. Hai lớp cùng
  // gác một cửa mà đọc header khác nhau là loại lỗi chỉ lộ ra khi đổi mật khẩu, và lúc
  // đó không ai nghĩ tới đây. `lib/gates.ts` thuần nên chạy được cả ở edge runtime.
  const password = bocMatKhauBasic(req.headers.get("authorization"));
  if (password && password === expected) return NextResponse.next();

  return new NextResponse("Cần mật khẩu quản trị.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ChicChic Admin", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/admin/:path*", "/admin"] };
