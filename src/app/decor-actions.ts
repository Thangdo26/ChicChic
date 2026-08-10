"use server";
// Mua trang trí — decor là món TRẢ PHÍ, không phải quà tặng kèm chuồng.
//
// Luật: chọn món → đặt mua (UNPAID) → chuyển khoản → báo đã chuyển (REPORTED) →
// nông trại đối soát (CONFIRMED) → LÚC ĐÓ món mới vào chuồng và nông dân mới nhận
// việc lắp. Chưa xác nhận thì không xếp đặt được gì.
//
// Đây là bản sao đúng luật của luồng cọc chuồng ở actions.ts — cùng enum
// PaymentStatus, cùng kiểu mã chuyển khoản, cùng chỗ đối soát trong /admin.
import { prisma } from "@/lib/db";
import { revalidatePath, revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { decorStock } from "@/lib/decor-store";
import { confirmDecorPaid } from "@/lib/payments";
import { chuongBiKhoa } from "@/lib/invoices";
import { newPayCode, MAX_PER_ITEM } from "@/lib/decor";
import { fmtVnd } from "@/lib/pricing";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Không cho gom một hoá đơn quá nhiều LOẠI món — nhầm một cái là mất tiền thật. */
const MAX_LINES_PER_ORDER = 10;

/** Một dòng trong giỏ: mua `qty` cái của món `slug`. */
export type OrderLine = { slug: string; qty: number };

function revalidateDecor(slug: string) {
  revalidatePath(`/chuong/${slug}/trang-tri`);
  revalidatePath(`/chuong/${slug}`);
  revalidatePath(`/chuong/${slug}/dan-ga`);
  revalidatePath("/admin");
  // Danh mục nằm trong `cachedDecorItems` (TTL 1 giờ) và giờ chứa cả `stockQty`. Không
  // đá cache thì người sau vẫn thấy "còn 3 cái" suốt một tiếng sau khi hàng đã hết.
  // (Số hiển thị chỉ là mỹ quan — cổng thật là `takeStock`; nhưng để lệch một tiếng
  // thì người dùng bấm mua rồi bị từ chối, đó là cách nhanh nhất làm mất lòng tin.)
  revalidateTag("catalog");
}

type DecorBarn = {
  id: string; slug: string; label: string;
  ownerId: string | null; workerId: string | null;
  reservation: { paymentStatus: "UNPAID" | "REPORTED" | "CONFIRMED" } | null;
};

/**
 * Chủ chuồng của một chuồng, hoặc lý do từ chối. Cùng luật với `ownedBarn` ở actions.ts.
 * Kiểu trả về khai TƯỜNG MINH để `"deny" in gate` thu hẹp được — để TS tự suy thì
 * union bị trộn và mọi chỗ dùng đều lỗi.
 */
async function ownerOf(
  slug: string,
): Promise<{ barn: DecorBarn; userId: string } | { deny: ActionResult }> {
  const me = await getSessionUser();
  if (!me) return { deny: nope("Bạn cần đăng nhập để làm việc này.") };

  const barn = await prisma.barn.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, label: true, ownerId: true, workerId: true,
      reservation: { select: { paymentStatus: true } },
    },
  });
  if (!barn) return { deny: nope("Không tìm thấy chuồng này.") };
  if (barn.ownerId !== me.id && me.role !== "ADMIN") {
    return { deny: nope("Chuồng này không thuộc tài khoản của bạn.") };
  }
  // §9.33 — chuồng có hoá đơn tiền nuôi QUÁ HẠN thì khoá các thao tác của chủ chuồng.
  // CHỈ chủ chuồng: admin phải làm việc được, và nông dân thì tuyệt đối không bị chặn —
  // đàn gà vẫn phải được cho ăn, được chụp ảnh, dù tiền chưa về.
  if (me.role !== "ADMIN" && (await chuongBiKhoa(barn.id))) {
    return { deny: nope("Chuồng đang tạm khoá vì kỳ tiền nuôi chưa thanh toán. Mở trang chuồng để thanh toán là dùng lại được ngay — các bạn gà vẫn được chăm bình thường nhé.") };
  }

  return { barn, userId: me.id };
}

/**
 * Đặt mua trang trí — mỗi dòng là "mua `qty` cái của món này".
 *
 * Mua thêm cái thứ hai, thứ ba của cùng một món là chuyện BÌNH THƯỜNG (3 chậu cây,
 * 2 biển tên chữ khác nhau). Trước đây chỗ này chặn "đã mua rồi thì thôi" — đó là
 * hệ quả của ràng buộc `@@unique([barnId, itemId])` cũ trên `BarnDecor`, nay đã bỏ.
 * Cái còn phải chặn là **trần số bản**, không phải chặn mua lại.
 *
 * Tổng tiền TÍNH LẠI Ở SERVER từ bảng giá trong DB — không bao giờ nhận số tiền
 * client gửi lên (§9.6). Client chỉ được nói "tôi muốn mua slug này, bấy nhiêu cái".
 */
export async function createDecorOrder(barnSlug: string, lines: OrderLine[]): Promise<ActionResult> {
  const gate = await ownerOf(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  // Cọc chuồng chưa xong thì chưa bán thêm gì cả.
  if (barn.reservation && barn.reservation.paymentStatus !== "CONFIRMED") {
    return nope("Chuồng chưa kích hoạt — hoàn tất cọc giữ chỗ trước rồi mua trang trí nhé.");
  }

  // Gộp dòng trùng slug rồi ép số lượng về khoảng hợp lệ — client gửi gì cũng không tin.
  const want = new Map<string, number>();
  for (const l of Array.isArray(lines) ? lines : []) {
    const slug = String(l?.slug ?? "");
    const qty = Math.floor(Number(l?.qty ?? 0));
    if (!slug || !Number.isFinite(qty) || qty <= 0) continue;
    want.set(slug, Math.min(MAX_PER_ITEM, (want.get(slug) ?? 0) + qty));
  }
  if (want.size === 0) return nope("Bạn chưa chọn món nào.");
  if (want.size > MAX_LINES_PER_ORDER) {
    return nope(`Một hoá đơn tối đa ${MAX_LINES_PER_ORDER} loại món — tách làm hai lần giúp mình nhé.`);
  }

  const items = await prisma.decorItem.findMany({ where: { slug: { in: [...want.keys()] } } });
  if (items.length !== want.size) {
    return nope("Có món không còn trong danh mục — tải lại trang giúp mình nhé.");
  }

  // Trần số bản: tính cả số đã sở hữu từ trước, không chỉ số đang mua.
  const stock = await decorStock(barn.id);
  for (const it of items) {
    const have = stock.get(it.id)?.owned ?? 0;
    const add = want.get(it.slug)!;
    if (have + add > MAX_PER_ITEM) {
      return nope(
        have >= MAX_PER_ITEM
          ? `Bạn đã có đủ ${MAX_PER_ITEM} cái "${it.name}" — đó là trần cho một chuồng.`
          : `"${it.name}" chỉ mua thêm được ${MAX_PER_ITEM - have} cái nữa (bạn đang có ${have}).`,
      );
    }
  }

  // Còn hoá đơn treo thì đóng nốt đã, tránh chồng nhiều hoá đơn chưa trả.
  const pending = await prisma.decorOrder.findFirst({
    where: { barnId: barn.id, paymentStatus: { not: "CONFIRMED" } },
    select: { id: true },
  });
  if (pending) {
    return nope("Bạn còn một hoá đơn trang trí chưa thanh toán. Xong hoá đơn đó rồi mua tiếp nhé.");
  }

  const rows = items.map((i) => ({ itemId: i.id, qty: want.get(i.slug)!, priceVnd: i.priceVnd }));
  const totalVnd = rows.reduce((s, r) => s + r.priceVnd * r.qty, 0);
  const pieces = rows.reduce((s, r) => s + r.qty, 0);

  // ---- Giữ hàng trong kho nông trại ----
  //
  // Trừ kho NGAY ở đây chứ không đợi tới lúc tiền về: đợi thì hai người cùng đặt cái
  // cuối cùng, cả hai cùng chuyển khoản, và một người mất tiền mà không có hàng.
  //
  // Toàn bộ nằm trong MỘT transaction cùng với việc tạo hoá đơn: trừ được 2 món rồi
  // món thứ 3 hết hàng thì hai món kia phải được trả lại, không thì kho hụt dần mỗi
  // lần có người đặt hụt.
  let soldOut: string | null = null;
  const order = await prisma
    .$transaction(async (tx) => {
      for (const r of rows) {
        // ⭐ SO-SÁNH-RỒI-ĐẶT trong MỘT câu lệnh (§9.24). Điều kiện "còn đủ hàng" nằm
        // ngay trong WHERE, nên hai người bấm mua cùng lúc thì chỉ một bên trừ được.
        // Đọc `stockQty` ra rồi mới `update` là để hở đúng khe giữa hai câu lệnh —
        // và hậu quả là bán nhiều hơn số hàng nông trại đang có.
        const { count } = await tx.decorItem.updateMany({
          where: { id: r.itemId, stockQty: { gte: r.qty } },
          data: { stockQty: { decrement: r.qty } },
        });
        if (count === 0) {
          soldOut = items.find((i) => i.id === r.itemId)?.name ?? "món này";
          throw new Error("SOLD_OUT"); // cuộn ngược mọi lần trừ ở trên
        }
      }
      return tx.decorOrder.create({
        data: {
          barnId: barn.id, userId: gate.userId, totalVnd,
          payCode: newPayCode("DECOR"),
          items: { create: rows },
        },
      });
    })
    .catch((e: unknown) => {
      if (soldOut) return null;
      throw e;
    });

  if (!order) {
    revalidateTag("catalog"); // số trên màn hình đang sai — làm mới ngay
    return nope(
      `Nông trại vừa hết "${soldOut}" — hàng thật nên có lúc hết. Bớt số lượng hoặc chờ nông trại nhập thêm giúp mình nhé.`,
    );
  }

  await track("decor_ordered", {
    userId: gate.userId, barnSlug,
    props: { orderId: order.id, lines: rows.length, pieces, totalVnd },
  });

  // Hoá đơn phải có thông báo — người ta vừa cam kết trả tiền, không được im lặng.
  await notify({
    userId: gate.userId,
    kind: "PAYMENT",
    title: `🧾 Hoá đơn trang trí ${fmtVnd(totalVnd)}`,
    body: `${pieces} món cho ${barn.label} · chuyển khoản với nội dung ${order.payCode} rồi bấm "Tôi đã chuyển khoản".`,
    href: `/chuong/${barnSlug}/trang-tri`,
  });

  revalidateDecor(barnSlug);
  return ok(`Đã tạo hoá đơn ${fmtVnd(totalVnd)} cho ${pieces} món. Chuyển khoản xong bấm "Tôi đã chuyển khoản" giúp mình nhé.`);
}

/** Chủ chuồng bấm "Tôi đã chuyển khoản". Bấm lại là no-op. */
export async function reportDecorTransfer(orderId: string): Promise<ActionResult> {
  const order = await prisma.decorOrder.findUnique({
    where: { id: orderId },
    select: { id: true, paymentStatus: true, totalVnd: true, barn: { select: { slug: true } } },
  });
  if (!order) return nope("Không tìm thấy hoá đơn này.");

  const gate = await ownerOf(order.barn.slug);
  if ("deny" in gate) return gate.deny;

  if (order.paymentStatus === "CONFIRMED") return nope("Hoá đơn này đã được xác nhận rồi.");
  if (order.paymentStatus === "REPORTED") return nope("Bạn đã báo chuyển khoản rồi — nông trại đang đối soát.");

  await prisma.decorOrder.update({
    where: { id: order.id },
    data: { paymentStatus: "REPORTED", reportedAt: new Date() },
  });
  revalidateDecor(order.barn.slug);
  return ok("Đã ghi nhận! Nông trại đối soát xong là các món hiện ra trong chuồng để bạn xếp đặt.");
}

/**
 * Nông trại bấm xác nhận đã nhận tiền ở /admin.
 * Cổng quyền ở đây; nghiệp vụ (đưa món vào chuồng, đặt việc lắp) nằm trong
 * `confirmDecorPaid` để dùng chung với webhook ngân hàng.
 */
export async function confirmDecorPayment(orderId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");
  return confirmDecorPaid(orderId, "ADMIN");
}

/** Chủ chuồng huỷ một hoá đơn chưa thanh toán. Đã xác nhận rồi thì không huỷ được. */
export async function cancelDecorOrder(orderId: string): Promise<ActionResult> {
  const order = await prisma.decorOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, paymentStatus: true,
      items: { select: { itemId: true, qty: true } },
      barn: { select: { slug: true } },
    },
  });
  if (!order) return nope("Không tìm thấy hoá đơn này.");

  const gate = await ownerOf(order.barn.slug);
  if ("deny" in gate) return gate.deny;
  if (order.paymentStatus === "CONFIRMED") {
    return nope("Hoá đơn đã thanh toán — liên hệ nông trại nếu cần đổi/trả.");
  }

  // TRẢ HÀNG VỀ KHO. Hoá đơn này đã giữ chỗ lúc tạo (xem `createDecorOrder`), huỷ mà
  // không cộng lại thì mỗi lần ai đó đổi ý là kho nông trại hụt đi vĩnh viễn — và
  // không ai phát hiện ra cho tới lúc màn hình báo hết hàng trong khi kệ vẫn đầy.
  //
  // Xoá đơn và cộng kho trong CÙNG một transaction: nửa vời thì hoặc mất hàng, hoặc
  // cộng hai lần khi người dùng bấm huỷ hai lần.
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.decorOrder.deleteMany({
      where: { id: order.id, paymentStatus: { not: "CONFIRMED" } },
    });
    if (count === 0) return; // ai đó vừa xác nhận/huỷ mất rồi — không cộng khống
    for (const r of order.items) {
      await tx.decorItem.update({
        where: { id: r.itemId },
        data: { stockQty: { increment: r.qty } },
      });
    }
  });

  revalidateDecor(order.barn.slug);
  return ok("Đã huỷ hoá đơn — số hàng đã giữ được trả lại kho nông trại.");
}
