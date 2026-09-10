// Kho món trang trí của một chuồng - nguồn sự thật DUY NHẤT cho câu hỏi
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
// "use server" bắt buộc phải là async function nhận/trả dữ liệu tuần tự hoá được -
// hàm trả về `Map` mà đặt ở đó là vi phạm (bẫy CODEMAP §10). Nó tin dữ liệu đưa vào,
// nên chỉ được gọi từ action/page đã kiểm quyền xong.
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/** Số cái mỗi loại món mà chuồng này ĐÃ TRẢ TIỀN. Khoá theo `DecorItem.id`. */
export async function ownedCounts(barnId: string, db: Prisma.TransactionClient = prisma): Promise<Map<string, number>> {
  const rows = await db.decorOrderItem.groupBy({
    by: ["itemId"],
    where: { order: { barnId, paymentStatus: "CONFIRMED" } },
    _sum: { qty: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.qty ?? 0]));
}

/** Số cái mỗi loại món ĐANG NẰM trong chuồng. Khoá theo `DecorItem.id`. */
export async function installedCounts(barnId: string, db: Prisma.TransactionClient = prisma): Promise<Map<string, number>> {
  const rows = await db.barnDecor.groupBy({
    by: ["itemId"],
    where: { barnId },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._count._all]));
}

/**
 * Số cái mỗi loại YẾM đang nằm trên gà của chuồng này. Khoá theo `DecorItem.id`.
 *
 * `PENDING_OFF` vẫn tính là đang chiếm chỗ: yếm chưa được nông dân tháo khỏi con gà
 * thì chưa mặc cho con khác được. Chỉ `OFF` mới trả về kho - cùng nguyên tắc với
 * `Barn.outside`: trong app đổi trước, ngoài đời chưa đổi thì chưa được coi là xong.
 */
export async function wornCounts(barnId: string, db: Prisma.TransactionClient = prisma): Promise<Map<string, number>> {
  const rows = await db.birdGear.groupBy({
    by: ["itemId"],
    where: { status: { not: "OFF" }, bird: { flock: { barnId } } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._count._all]));
}

export type Stock = {
  /** Đã trả tiền bao nhiêu cái. */
  owned: number;
  /** Đang nằm trong chuồng bao nhiêu cái (món lắp vào chuồng). */
  installed: number;
  /** Đang nằm trên gà bao nhiêu cái (yếm) - kể cả cái đang chờ nông dân mặc/tháo. */
  worn: number;
  /** Còn bao nhiêu cái trong kho để lắp/mặc thêm (không âm). */
  free: number;
};

/**
 * Tồn kho đầy đủ của một chuồng, khoá theo `DecorItem.id`.
 *
 * BA truy vấn `groupBy` chạy SONG SONG - không N+1 dù danh mục dài bao nhiêu, và
 * thêm yếm không thêm một tầng đi–về nào (§8: mỗi tầng là một lượt tới DB).
 *
 *   còn kho = đã trả tiền − đang lắp trong chuồng − đang nằm trên gà
 */
export async function decorStock(barnId: string, db: Prisma.TransactionClient = prisma): Promise<Map<string, Stock>> {
  const [owned, installed, worn] = await Promise.all([
    ownedCounts(barnId, db),
    installedCounts(barnId, db),
    wornCounts(barnId, db),
  ]);
  const out = new Map<string, Stock>();
  const put = (itemId: string, ownedN: number) => {
    const inUse = installed.get(itemId) ?? 0;
    const onBirds = worn.get(itemId) ?? 0;
    out.set(itemId, {
      owned: ownedN,
      installed: inUse,
      worn: onBirds,
      free: Math.max(0, ownedN - inUse - onBirds),
    });
  };

  for (const [itemId, n] of owned) put(itemId, n);
  // Món đang lắp mà không có hoá đơn nào (dữ liệu seed của chuồng demo) vẫn phải
  // đếm được, không thì trang trang-trí báo "0 món" trong khi hình vẽ đầy món.
  for (const [itemId, inUse] of installed) {
    if (!out.has(itemId)) put(itemId, inUse + (worn.get(itemId) ?? 0));
  }
  for (const [itemId, onBirds] of worn) {
    if (!out.has(itemId)) put(itemId, onBirds + (installed.get(itemId) ?? 0));
  }
  return out;
}

/**
 * Bản theo slug cho tầng hiển thị (vốn làm việc theo slug thay vì id).
 *
 * NHẬN danh mục từ ngoài thay vì tự truy vấn: trang /trang-tri đã đọc `DecorItem` để
 * dựng catalog rồi, hàm này đọc lại lần nữa là hai lượt đi–về Mumbai cho cùng một
 * bảng tĩnh. Chỗ gọi truyền `cachedDecorItems()` xuống.
 */
export async function decorStockBySlug(
  barnId: string,
  items: { id: string; slug: string }[],
): Promise<Record<string, Stock>> {
  const byId = await decorStock(barnId);
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
  /** Mã chuyển khoản đã lưu sẵn - client không tự suy ra từ id nữa. */
  payCode: string;
  totalVnd: number;
  paymentStatus: "UNPAID" | "REPORTED";
  items: PendingOrderLine[];
};

/** Hoá đơn trang trí đang treo của một chuồng (nhiều nhất một cái - xem createDecorOrder). */
export async function pendingDecorOrder(barnId: string): Promise<PendingDecorOrder | null> {
  const o = await prisma.decorOrder.findFirst({
    where: { barnId, paymentStatus: { not: "CONFIRMED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, payCode: true, totalVnd: true, paymentStatus: true,
      items: { select: { priceVnd: true, qty: true, item: { select: { slug: true, name: true } } } },
    },
  });
  if (!o) return null;
  return {
    id: o.id,
    payCode: o.payCode ?? "",
    totalVnd: o.totalVnd,
    paymentStatus: o.paymentStatus as "UNPAID" | "REPORTED",
    items: o.items.map((r) => ({
      slug: r.item.slug, name: r.item.name, priceVnd: r.priceVnd, qty: r.qty,
    })),
  };
}
