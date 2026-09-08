import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Trạng thái cọc của một chuồng - client poll để trang tự cập nhật khi nông trại xác nhận.
 * Đây là dữ liệu tài chính của một người cụ thể: chỉ chủ chuồng (và admin) được đọc.
 */
export async function GET(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const barn = await prisma.barn.findUnique({
    where: { slug: params.slug },
    select: { ownerId: true, reservation: { select: { paymentStatus: true } } },
  });
  if (!barn) return NextResponse.json({ error: "not-found" }, { status: 404 });
  // Không phân biệt "không phải chuồng của bạn" với "không tồn tại" - tránh dò slug.
  if (barn.ownerId && barn.ownerId !== me.id && me.role !== "ADMIN") {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  // Chuồng không gắn đơn (demo) coi như đã kích hoạt
  return NextResponse.json({ status: barn.reservation?.paymentStatus ?? "CONFIRMED" });
}
