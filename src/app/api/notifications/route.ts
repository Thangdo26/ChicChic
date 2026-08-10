import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Thông báo của chính người đang đăng nhập.
 * Chuông trên thanh trên poll endpoint này, nhờ vậy mọi hành động vừa xong
 * (của mình hay của phía bên kia) hiện lên mà không cần tải lại trang.
 *
 * Chỉ MỘT truy vấn: số chưa đọc đếm ngay trên danh sách 15 dòng gần nhất -
 * huy hiệu hiển thị tối đa "9+" nên không cần con số tuyệt đối.
 */
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ list: [] });

  return NextResponse.json({ list: await listNotifications(me.id) });
}
