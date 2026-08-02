// Kho món trang trí của một chuồng — nguồn sự thật DUY NHẤT cho câu hỏi
// "món này đã trả tiền chưa, có được lắp không".
//
// File này KHÔNG có "use server" (giống lib/task-store.ts): mọi export trong một file
// "use server" bắt buộc phải là async function nhận/trả dữ liệu tuần tự hoá được —
// hàm trả về `Set` mà đặt ở đó là vi phạm (bẫy CODEMAP §10). Nó tin dữ liệu đưa vào,
// nên chỉ được gọi từ action/page đã kiểm quyền xong.
import { prisma } from "@/lib/db";

/** Id các món chuồng này ĐÃ TRẢ TIỀN (hoá đơn ở trạng thái CONFIRMED). */
export async function paidItemIds(barnId: string): Promise<Set<string>> {
  const rows = await prisma.decorOrderItem.findMany({
    where: { order: { barnId, paymentStatus: "CONFIRMED" } },
    select: { itemId: true },
  });
  return new Set(rows.map((r) => r.itemId));
}

/** Như trên nhưng trả về slug — tiện cho tầng hiển thị vốn làm việc theo slug. */
export async function paidItemSlugs(barnId: string): Promise<Set<string>> {
  const rows = await prisma.decorOrderItem.findMany({
    where: { order: { barnId, paymentStatus: "CONFIRMED" } },
    select: { item: { select: { slug: true } } },
  });
  return new Set(rows.map((r) => r.item.slug));
}

export type PendingDecorOrder = {
  id: string;
  totalVnd: number;
  paymentStatus: "UNPAID" | "REPORTED";
  items: { slug: string; name: string; priceVnd: number }[];
};

/** Hoá đơn trang trí đang treo của một chuồng (nhiều nhất một cái — xem createDecorOrder). */
export async function pendingDecorOrder(barnId: string): Promise<PendingDecorOrder | null> {
  const o = await prisma.decorOrder.findFirst({
    where: { barnId, paymentStatus: { not: "CONFIRMED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, totalVnd: true, paymentStatus: true,
      items: { select: { priceVnd: true, item: { select: { slug: true, name: true } } } },
    },
  });
  if (!o) return null;
  return {
    id: o.id,
    totalVnd: o.totalVnd,
    paymentStatus: o.paymentStatus as "UNPAID" | "REPORTED",
    items: o.items.map((r) => ({ slug: r.item.slug, name: r.item.name, priceVnd: r.priceVnd })),
  };
}
