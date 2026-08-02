import { NextResponse } from "next/server";
import { listMessages, markRead, threadAccess } from "@/lib/messages";

export const dynamic = "force-dynamic";

/**
 * Hộp thư của một chuồng, cho khung soạn tự làm mới.
 *
 * Vì sao là route HTTP chứ không phải server action: client cần **poll** đều đặn, y
 * hệt chuông thông báo (`/api/notifications`). Gọi server action theo chu kỳ sẽ kéo
 * theo revalidate cả cây RSC mỗi lần — đắt hơn nhiều so với một truy vấn đọc.
 *
 * `threadAccess` là cùng một cổng quyền với action gửi tin: chuồng của người khác,
 * nông dân không phụ trách, nông dân tạm dừng, chuồng trưng bày → 403.
 */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const gate = await threadAccess(params.slug);
  if (!gate) return NextResponse.json({ error: "Không xem được hộp thư này." }, { status: 403 });

  // Đang mở hộp thư mà tin mới về thì coi như đã đọc luôn — nếu không, huy hiệu
  // "chưa đọc" sẽ nhấp nháy dù người ta đang nhìn thẳng vào đoạn hội thoại.
  await markRead(gate.barn.id, gate.meId);
  const list = await listMessages(gate.barn.id, gate.meId);
  return NextResponse.json({ list });
}
