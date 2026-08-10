// HOÀN TIỀN - phần chạm DB.
//
// Không có `"use server"` (giống `payments.ts`, `invoices.ts`): file này **không tự kiểm
// quyền**, chỗ gọi phải kiểm. Phép tính thuần nằm ở `lib/refund.ts`.
import { prisma } from "@/lib/db";
import { hoanTheoTiLe, type RefundKind } from "@/lib/refund";
import { hoaDonLabel } from "@/lib/billing";
import { khoiLabel } from "@/lib/care";

/** Một khoản nông trại sẽ nợ, nếu người ta dừng ngay lúc này. */
export type KhoanHoan = {
  kind: RefundKind;
  sourceId: string;
  amountVnd: number;
  /** Câu ngắn hiện cho người đọc: "Tiền nuôi tháng 2 · 19 ngày chưa nuôi". */
  nhan: string;
  ngayChuaDung: number;
};

/**
 * Mọi khoản còn nợ chủ chuồng nếu họ **dừng vào lúc `moc`**.
 *
 * CHỈ xét những kỳ đã CONFIRMED - tiền phải thật sự về tài khoản nông trại thì mới có
 * gì để trả lại. Hoá đơn chưa trả thì không hoàn, nó chỉ đơn giản không còn phải trả.
 *
 * ⚠️ **Tiền cọc 50.000đ không nằm trong đây, và đó là chủ ý đã chốt từ trước** (xem chú
 * thích `BarnInvoice.creditVnd`): cọc đi thẳng vào tiền hàng kỳ đầu chứ không được giữ
 * riêng rồi hoàn lại. Nên phần hoàn của hoá đơn đầu tính trên `totalVnd` - đúng số họ
 * đã chuyển cho hoá đơn đó - chứ không phải trên `grossVnd`. Ai muốn đổi luật ấy thì
 * đổi ở ĐÂY và sửa luôn câu chữ trên màn hoàn trả chuồng, đừng đổi một nửa.
 */
export async function duKienHoanChuong(barnId: string, moc = new Date()): Promise<KhoanHoan[]> {
  return (await duKienHoanNhieuChuong([barnId], moc)).get(barnId) ?? [];
}

/**
 * Như trên nhưng cho NHIỀU chuồng cùng lúc - **ba** truy vấn, không phải ba nhân N.
 *
 * Trang Tài khoản cần con số này cho từng thẻ chuồng để nói trước "hoàn trả thì được
 * trả lại bao nhiêu". Gọi bản một-chuồng trong vòng lặp ở đó là đúng cái bẫy §10: mỗi
 * quan hệ là một lượt đi–về DB cách ~1,3s, và người có 4 chuồng sẽ chờ thêm vài giây
 * cho một dòng chữ.
 */
export async function duKienHoanNhieuChuong(
  barnIds: readonly string[],
  moc = new Date(),
): Promise<Map<string, KhoanHoan[]>> {
  const ra = new Map<string, KhoanHoan[]>();
  if (barnIds.length === 0) return ra;
  const ids = [...barnIds];

  const [invoices, careOrders, flocks] = await Promise.all([
    prisma.barnInvoice.findMany({
      // `periodTo > moc` lọc ngay ở DB: kỳ đã dùng hết thì hoàn 0đ, kéo về Node rồi mới
      // loại chỉ tốn công cho những dòng chắc chắn bỏ.
      where: { barnId: { in: ids }, paymentStatus: "CONFIRMED", periodTo: { gt: moc } },
      orderBy: { seq: "asc" },
      select: { id: true, barnId: true, seq: true, totalVnd: true, periodFrom: true, periodTo: true },
    }),
    prisma.careOrder.findMany({
      where: { barnId: { in: ids }, paymentStatus: "CONFIRMED", coversTo: { gt: moc } },
      orderBy: { createdAt: "asc" },
      select: { id: true, barnId: true, months: true, totalVnd: true, coversFrom: true, coversTo: true },
    }),
    prisma.flock.findMany({
      where: { barnId: { in: ids } },
      select: { barnId: true, productLine: true },
    }),
  ]);

  const dong = (barnId: string) => ra.get(barnId) ?? ra.set(barnId, []).get(barnId)!;
  const lineOf = new Map(flocks.map((f) => [f.barnId, f.productLine as string]));

  for (const hd of invoices) {
    const p = hoanTheoTiLe({ from: hd.periodFrom, to: hd.periodTo, daTraVnd: hd.totalVnd }, moc);
    if (p.hoanVnd <= 0) continue;
    dong(hd.barnId).push({
      kind: "INVOICE",
      sourceId: hd.id,
      amountVnd: p.hoanVnd,
      ngayChuaDung: p.ngayChuaDung,
      nhan: `${hoaDonLabel(lineOf.get(hd.barnId) ?? "BROILER", hd.seq)} · ${p.ngayChuaDung}/${p.tongNgay} ngày chưa nuôi`,
    });
  }

  for (const dn of careOrders) {
    // `coversFrom`/`coversTo` chỉ được đặt khi tiền đã về, nên tới đây chắc chắn có -
    // nhưng vẫn phải hỏi vì kiểu là nullable, và đoán bừa ở chỗ đụng tiền thì không nên.
    if (!dn.coversFrom || !dn.coversTo) continue;
    const p = hoanTheoTiLe({ from: dn.coversFrom, to: dn.coversTo, daTraVnd: dn.totalVnd }, moc);
    if (p.hoanVnd <= 0) continue;
    dong(dn.barnId).push({
      kind: "CARE",
      sourceId: dn.id,
      amountVnd: p.hoanVnd,
      ngayChuaDung: p.ngayChuaDung,
      nhan: `Nuôi dưỡng ${khoiLabel(dn.months)} · ${p.ngayChuaDung}/${p.tongNgay} ngày chưa dùng`,
    });
  }

  return ra;
}

export const tongKhoan = (ks: readonly KhoanHoan[]) => ks.reduce((s, k) => s + k.amountVnd, 0);
