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
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { track } from "@/lib/track";
import { upsertTask } from "@/lib/task-store";
import { paidItemIds } from "@/lib/decor-store";
import { clampPlacement, transferCode } from "@/lib/decor";
import { fmtVnd } from "@/lib/pricing";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Không cho gom một hoá đơn quá dài — nhầm một cái là mất tiền thật. */
const MAX_ITEMS_PER_ORDER = 10;

function revalidateDecor(slug: string) {
  revalidatePath(`/chuong/${slug}/trang-tri`);
  revalidatePath(`/chuong/${slug}`);
  revalidatePath("/admin");
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
  return { barn, userId: me.id };
}

/**
 * Đặt mua một hoặc nhiều món trang trí.
 *
 * Tổng tiền TÍNH LẠI Ở SERVER từ bảng giá trong DB — không bao giờ nhận số tiền
 * client gửi lên (§9.6). Client chỉ được nói "tôi muốn mua những slug này".
 */
export async function createDecorOrder(barnSlug: string, itemSlugs: string[]): Promise<ActionResult> {
  const gate = await ownerOf(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  // Cọc chuồng chưa xong thì chưa bán thêm gì cả.
  if (barn.reservation && barn.reservation.paymentStatus !== "CONFIRMED") {
    return nope("Chuồng chưa kích hoạt — hoàn tất cọc giữ chỗ trước rồi mua trang trí nhé.");
  }

  const slugs = Array.from(new Set(itemSlugs.map((s) => String(s)))).slice(0, MAX_ITEMS_PER_ORDER);
  if (slugs.length === 0) return nope("Bạn chưa chọn món nào.");

  const items = await prisma.decorItem.findMany({ where: { slug: { in: slugs } } });
  if (items.length !== slugs.length) return nope("Có món không còn trong danh mục — tải lại trang giúp mình nhé.");

  // Đã mua rồi thì thôi: món đã trả tiền là của chủ chuồng vĩnh viễn, gỡ ra lắp lại
  // bao nhiêu lần cũng được, không thu lần hai.
  const owned = await paidItemIds(barn.id);
  const dup = items.filter((i) => owned.has(i.id));
  if (dup.length > 0) {
    return nope(`Bạn đã mua "${dup[0].name}" rồi — vào kho món của bạn để lắp lại.`);
  }

  // Còn hoá đơn treo thì đóng nốt đã, tránh chồng nhiều hoá đơn chưa trả.
  const pending = await prisma.decorOrder.findFirst({
    where: { barnId: barn.id, paymentStatus: { not: "CONFIRMED" } },
    select: { id: true },
  });
  if (pending) {
    return nope("Bạn còn một hoá đơn trang trí chưa thanh toán. Xong hoá đơn đó rồi mua tiếp nhé.");
  }

  const totalVnd = items.reduce((s, i) => s + i.priceVnd, 0);

  const order = await prisma.decorOrder.create({
    data: {
      barnId: barn.id, userId: gate.userId, totalVnd,
      items: { create: items.map((i) => ({ itemId: i.id, priceVnd: i.priceVnd })) },
    },
  });

  await track("decor_ordered", {
    userId: gate.userId, barnSlug,
    props: { orderId: order.id, count: items.length, totalVnd },
  });

  // Hoá đơn phải có thông báo — người ta vừa cam kết trả tiền, không được im lặng.
  await notify({
    userId: gate.userId,
    kind: "PAYMENT",
    title: `🧾 Hoá đơn trang trí ${fmtVnd(totalVnd)}`,
    body: `${items.length} món cho ${barn.label} · chuyển khoản với nội dung ${transferCode(order.id)} rồi bấm "Tôi đã chuyển khoản".`,
    href: `/chuong/${barnSlug}/trang-tri`,
  });

  revalidateDecor(barnSlug);
  return ok(`Đã tạo hoá đơn ${fmtVnd(totalVnd)} cho ${items.length} món. Chuyển khoản xong bấm "Tôi đã chuyển khoản" giúp mình nhé.`);
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
 * Nông trại xác nhận đã nhận tiền → **lúc này** món mới vào chuồng.
 *
 * Đây là chỗ duy nhất `BarnDecor` được tạo từ một hoá đơn. Đặt việc lắp cho nông dân
 * ở cuối, sau khi ghi xong — nông dân vẫn phải gửi ảnh mới đóng được việc (§9.1).
 */
export async function confirmDecorPayment(orderId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const order = await prisma.decorOrder.findUnique({
    where: { id: orderId },
    include: { items: { include: { item: true } }, barn: { select: { id: true, slug: true, label: true, ownerId: true, workerId: true } } },
  });
  if (!order) return nope("Không tìm thấy hoá đơn này.");
  if (order.paymentStatus === "CONFIRMED") return nope("Hoá đơn này đã được xác nhận trước đó.");

  const top = await prisma.barnDecor.aggregate({ where: { barnId: order.barnId }, _max: { z: true } });
  let z = top._max.z ?? 0;

  // Một giao dịch: đổi trạng thái + đưa từng món vào chuồng. Nửa vời thì người dùng
  // đã trả tiền mà chuồng vẫn trống.
  await prisma.$transaction(async (tx) => {
    await tx.decorOrder.update({
      where: { id: order.id },
      data: { paymentStatus: "CONFIRMED", paidAt: new Date() },
    });
    for (const row of order.items) {
      const already = await tx.barnDecor.findUnique({
        where: { barnId_itemId: { barnId: order.barnId, itemId: row.itemId } },
        select: { id: true },
      });
      if (already) continue;
      const pos = clampPlacement({ x: row.item.defaultX, y: row.item.defaultY, scale: 1 });
      await tx.barnDecor.create({
        data: { barnId: order.barnId, itemId: row.itemId, ...pos, z: ++z },
      });
    }
  });

  await track("decor_paid", {
    userId: order.userId, barnSlug: order.barn.slug,
    props: {
      orderId: order.id, count: order.items.length, totalVnd: order.totalVnd,
      hoursToPay: Math.round((Date.now() - order.createdAt.getTime()) / 3_600_000),
    },
  });

  await notify({
    userId: order.barn.ownerId,
    kind: "PAYMENT",
    title: `🎨 Đã nhận tiền trang trí — ${order.items.length} món mở khoá`,
    body: `${order.barn.label} · kéo tới chỗ bạn muốn rồi bấm lưu, nông dân sẽ lắp thật theo đó.`,
    href: `/chuong/${order.barn.slug}/trang-tri`,
  });

  // Nông dân nhận việc lắp — vẫn phải đính ảnh mới đóng được (§9.1).
  if (order.barn.workerId) {
    const { created } = await upsertTask({
      barnId: order.barnId, workerId: order.barn.workerId, requestedById: order.userId,
      kind: "DECOR", title: "Lắp trang trí",
      note: `Chủ chuồng vừa thanh toán ${order.items.length} món: ${order.items.map((r) => r.item.name).join(", ")}.`,
      dueAt: null,
    });
    if (created) {
      await notify({
        userId: await workerUserIdOfBarn(order.barnId),
        kind: "TASK_NEW",
        title: "🎨 Việc mới: Lắp trang trí",
        body: `${order.barn.label} · ${order.items.length} món vừa được thanh toán.`,
        href: `/nong-trai/chuong/${order.barn.slug}#viec`,
      });
    }
  }

  revalidateDecor(order.barn.slug);
  return ok(`Đã xác nhận hoá đơn ${transferCode(order.id)} — ${order.items.length} món đã vào chuồng.`);
}

/** Chủ chuồng huỷ một hoá đơn chưa thanh toán. Đã xác nhận rồi thì không huỷ được. */
export async function cancelDecorOrder(orderId: string): Promise<ActionResult> {
  const order = await prisma.decorOrder.findUnique({
    where: { id: orderId },
    select: { id: true, paymentStatus: true, barn: { select: { slug: true } } },
  });
  if (!order) return nope("Không tìm thấy hoá đơn này.");

  const gate = await ownerOf(order.barn.slug);
  if ("deny" in gate) return gate.deny;
  if (order.paymentStatus === "CONFIRMED") {
    return nope("Hoá đơn đã thanh toán — liên hệ nông trại nếu cần đổi/trả.");
  }

  await prisma.decorOrder.delete({ where: { id: order.id } });
  revalidateDecor(order.barn.slug);
  return ok("Đã huỷ hoá đơn.");
}
