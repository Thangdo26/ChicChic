// Kho món trang trí của một chuồng — nguồn sự thật DUY NHẤT cho câu hỏi
// "món này còn cái nào để lắp không".
//
// Mô hình tồn kho, ba con số cho mỗi loại món:
//   sở hữu  = tổng qty của mọi dòng thuộc hoá đơn đã CONFIRMED
//   đang lắp = số dòng BarnDecor hiện có trong chuồng
//   còn kho  = sở hữu − đang lắp
//
// Gỡ một món ra thì nó **về kho**, lắp lại không thu tiền lần hai. Mua thêm là tăng
// "sở hữu". Đây là lý do BarnDecor cố ý KHÔNG còn @@unique([barnId, itemId]).
//
// File này KHÔNG có "use server" (giống lib/task-store.ts): mọi export trong một file
// "use server" bắt buộc phải là async function nhận/trả dữ liệu tuần tự hoá được —
// hàm trả về `Map` mà đặt ở đó là vi phạm (bẫy CODEMAP §10). Nó tin dữ liệu đưa vào,
// nên chỉ được gọi từ action/page đã kiểm quyền xong.
import { prisma } from "@/lib/db";

/** Số cái mỗi loại món mà chuồng này ĐÃ TRẢ TIỀN. Khoá theo `DecorItem.id`. */
export async function ownedCounts(barnId: string): Promise<Map<string, number>> {
  const rows = await prisma.decorOrderItem.groupBy({
    by: ["itemId"],
    where: { order: { barnId, paymentStatus: "CONFIRMED" } },
    _sum: { qty: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.qty ?? 0]));
}

/** Số cái mỗi loại món ĐANG NẰM trong chuồng. Khoá theo `DecorItem.id`. */
export async function installedCounts(barnId: string): Promise<Map<string, number>> {
  const rows = await prisma.barnDecor.groupBy({
    by: ["itemId"],
    where: { barnId },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._count._all]));
}

export type Stock = {
  /** Đã trả tiền bao nhiêu cái. */
  owned: number;
  /** Đang nằm trong chuồng bao nhiêu cái. */
  installed: number;
  /** Còn bao nhiêu cái trong kho để lắp thêm (không âm). */
  free: number;
};

/**
 * Tồn kho đầy đủ của một chuồng, khoá theo `DecorItem.id`.
 * Hai truy vấn `groupBy` chạy song song — không N+1 dù danh mục dài bao nhiêu.
 */
export async function decorStock(barnId: string): Promise<Map<string, Stock>> {
  const [owned, installed] = await Promise.all([ownedCounts(barnId), installedCounts(barnId)]);
  const out = new Map<string, Stock>();
  for (const [itemId, n] of owned) {
    const inUse = installed.get(itemId) ?? 0;
    out.set(itemId, { owned: n, installed: inUse, free: Math.max(0, n - inUse) });
  }
  // Món đang lắp mà không có hoá đơn nào (dữ liệu seed của chuồng demo) vẫn phải
  // đếm được, không thì trang trang-trí báo "0 món" trong khi hình vẽ đầy món.
  for (const [itemId, inUse] of installed) {
    if (!out.has(itemId)) out.set(itemId, { owned: inUse, installed: inUse, free: 0 });
  }
  return out;
}

/** Bản theo slug cho tầng hiển thị (vốn làm việc theo slug thay vì id). */
export async function decorStockBySlug(barnId: string): Promise<Record<string, Stock>> {
  const [byId, items] = await Promise.all([
    decorStock(barnId),
    prisma.decorItem.findMany({ select: { id: true, slug: true } }),
  ]);
  const out: Record<string, Stock> = {};
  for (const it of items) {
    const s = byId.get(it.id);
    if (s) out[it.slug] = s;
  }
  return out;
}

export type PendingOrderLine = { slug: string; name: string; priceVnd: number; qty: number };

export type PendingDecorOrder = {
  id: string;
  totalVnd: number;
  paymentStatus: "UNPAID" | "REPORTED";
  items: PendingOrderLine[];
};

/** Hoá đơn trang trí đang treo của một chuồng (nhiều nhất một cái — xem createDecorOrder). */
export async function pendingDecorOrder(barnId: string): Promise<PendingDecorOrder | null> {
  const o = await prisma.decorOrder.findFirst({
    where: { barnId, paymentStatus: { not: "CONFIRMED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, totalVnd: true, paymentStatus: true,
      items: { select: { priceVnd: true, qty: true, item: { select: { slug: true, name: true } } } },
    },
  });
  if (!o) return null;
  return {
    id: o.id,
    totalVnd: o.totalVnd,
    paymentStatus: o.paymentStatus as "UNPAID" | "REPORTED",
    items: o.items.map((r) => ({
      slug: r.item.slug, name: r.item.name, priceVnd: r.priceVnd, qty: r.qty,
    })),
  };
}
