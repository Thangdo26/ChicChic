import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Trạng thái cọc của một chuồng — client poll để trang tự cập nhật khi nông trại xác nhận. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const barn = await prisma.barn.findUnique({
    where: { slug: params.slug },
    select: { reservation: { select: { paymentStatus: true } } },
  });
  if (!barn) return NextResponse.json({ error: "not-found" }, { status: 404 });
  // Chuồng không gắn đơn (demo) coi như đã kích hoạt
  return NextResponse.json({ status: barn.reservation?.paymentStatus ?? "CONFIRMED" });
}
