import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { parsePayCode } from "@/lib/decor";

export const dynamic = "force-dynamic";

/**
 * "Mã chuyển khoản này đã được ghi nhận chưa?" - một cửa cho CẢ BA loại đơn.
 *
 * VÌ SAO CÓ FILE NÀY: webhook ngân hàng xác nhận tiền ở phía server, nhưng màn hình
 * người dùng đang mở thì không biết gì cả. Trước đây chỉ banner cọc có đường hỏi lại
 * (`/api/barns/[slug]/payment`), nên hoá đơn trang trí và đơn chợ **đứng im ở trạng
 * thái "chờ chuyển khoản" cho tới khi người dùng tự tải lại trang** - tiền đã về, hàng
 * đã vào chuồng, mà màn hình vẫn bảo chưa.
 *
 * Tra theo MÃ chứ không theo chuồng, vì đơn chợ không thuộc chuồng nào của người mua.
 * `parsePayCode` đã biết cả ba loại (CHICC / CHICD / CHICM) nên chỉ cần một endpoint.
 *
 * Mã KHÔNG phải là chứng chỉ sở hữu: nó nằm trong nội dung chuyển khoản, in trên ảnh QR,
 * và ngắn. Nên mỗi nhánh vẫn phải kiểm ĐÚNG người mới trả lời - nếu không thì đây thành
 * chỗ dò trạng thái đơn của người khác.
 */
export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = parsePayCode(new URL(req.url).searchParams.get("code") ?? "");
  if (!parsed) return NextResponse.json({ error: "bad-code" }, { status: 400 });

  // `parsed.code` đã được dựng lại ở dạng chuẩn (liền, viết hoa) nên tra thẳng `payCode`.
  const code = parsed.code;
  const admin = me.role === "ADMIN";

  if (parsed.kind === "COC") {
    const r = await prisma.reservation.findUnique({
      where: { payCode: code },
      select: { paymentStatus: true, userId: true },
    });
    if (!r || (!admin && r.userId !== me.id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
    return NextResponse.json({ status: r.paymentStatus, paid: r.paymentStatus === "CONFIRMED" });
  }

  if (parsed.kind === "DECOR") {
    const r = await prisma.decorOrder.findUnique({
      where: { payCode: code },
      select: { paymentStatus: true, userId: true },
    });
    if (!r || (!admin && r.userId !== me.id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
    return NextResponse.json({ status: r.paymentStatus, paid: r.paymentStatus === "CONFIRMED" });
  }

  if (parsed.kind === "INVOICE") {
    const r = await prisma.barnInvoice.findUnique({
      where: { payCode: code },
      select: { paymentStatus: true, userId: true },
    });
    if (!r || (!admin && r.userId !== me.id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
    return NextResponse.json({ status: r.paymentStatus, paid: r.paymentStatus === "CONFIRMED" });
  }

  if (parsed.kind === "CARE") {
    const r = await prisma.careOrder.findUnique({
      where: { payCode: code },
      select: { paymentStatus: true, userId: true },
    });
    if (!r || (!admin && r.userId !== me.id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
    return NextResponse.json({ status: r.paymentStatus, paid: r.paymentStatus === "CONFIRMED" });
  }

  const r = await prisma.marketListing.findUnique({
    where: { payCode: code },
    select: { status: true, buyerId: true },
  });
  if (!r || (!admin && r.buyerId !== me.id)) return NextResponse.json({ error: "not-found" }, { status: 404 });
  // Đã giao rồi thì đương nhiên cũng đã trả tiền - đừng để màn hình tụt về "chờ".
  return NextResponse.json({ status: r.status, paid: r.status === "PAID" || r.status === "DELIVERED" });
}
