// TIỀN ĐÃ VỀ — cửa duy nhất biến một khoản tiền thành "đơn đã thanh toán".
//
// Vì sao tách khỏi actions.ts / decor-actions.ts: bây giờ có HAI đường xác nhận
// (admin bấm tay ở /admin, và webhook ngân hàng tự khớp). Nếu mỗi đường tự viết
// phần "đổi trạng thái + ghi nhật ký + báo chuông + đặt việc" thì sớm muộn hai
// đường lệch nhau, và bên lệch sẽ là bên người dùng đã trả tiền mà chuồng vẫn khoá.
//
// File này KHÔNG kiểm quyền — đó là việc của chỗ gọi:
//   · server action → `isAdmin()`
//   · route webhook  → khoá API của nhà cung cấp
// Không có "use server" (giống notify.ts / task-store.ts).
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { track } from "@/lib/track";
import { upsertTask } from "@/lib/task-store";
import { stamp } from "@/lib/farm-log";
import { clampPlacement, transferCode, decorCode, type PayKind } from "@/lib/decor";

/** Ai đứng ra xác nhận — đi thẳng vào bảng đo để so hai đường với nhau. */
export type PaySource = "ADMIN" | "WEBHOOK";

export type PayResult = { ok: boolean; message: string };
const ok = (message: string): PayResult => ({ ok: true, message });
const nope = (message: string): PayResult => ({ ok: false, message });

// ---------------- Tra đơn từ mã chuyển khoản ----------------

export type ResolvedOrder = {
  kind: PayKind;
  id: string;
  /** Số tiền đơn này đang chờ. Tiền về ít hơn thì KHÔNG tự xác nhận. */
  expectedVnd: number;
  alreadyPaid: boolean;
};

/**
 * Tìm đơn ứng với 6 ký tự cuối id bóc được từ nội dung chuyển khoản.
 *
 * Trả `{ error }` khi **không chắc chắn tuyệt đối** — kể cả khi tìm được nhiều hơn
 * một đơn. Sáu ký tự là ngắn, về lý thuyết có thể trùng; chọn đại một đơn nghĩa là
 * cộng tiền của người này vào chuồng của người kia.
 */
export async function resolvePayCode(
  kind: PayKind,
  suffix: string,
): Promise<ResolvedOrder | { error: string }> {
  if (kind === "COC") {
    const rows = await prisma.reservation.findMany({
      where: { id: { endsWith: suffix } },
      select: { id: true, depositVnd: true, paymentStatus: true },
      take: 2,
    });
    if (rows.length === 0) return { error: "Không có đơn cọc nào mang mã này." };
    if (rows.length > 1) return { error: "Mã trùng nhiều đơn cọc — cần đối soát tay." };
    return {
      kind, id: rows[0].id,
      expectedVnd: rows[0].depositVnd,
      alreadyPaid: rows[0].paymentStatus === "CONFIRMED",
    };
  }

  const rows = await prisma.decorOrder.findMany({
    where: { id: { endsWith: suffix } },
    select: { id: true, totalVnd: true, paymentStatus: true },
    take: 2,
  });
  if (rows.length === 0) return { error: "Không có hoá đơn trang trí nào mang mã này." };
  if (rows.length > 1) return { error: "Mã trùng nhiều hoá đơn — cần đối soát tay." };
  return {
    kind, id: rows[0].id,
    expectedVnd: rows[0].totalVnd,
    alreadyPaid: rows[0].paymentStatus === "CONFIRMED",
  };
}

// ---------------- Cọc giữ chỗ ----------------

/**
 * Xác nhận đã nhận cọc → kích hoạt chuồng. Idempotent: gọi lại lần hai bị từ chối,
 * không tạo thêm nhật ký hay thông báo nào.
 */
export async function confirmReservationPaid(
  reservationId: string,
  source: PaySource,
): Promise<PayResult> {
  const r = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { barn: true },
  });
  if (!r) return nope("Không tìm thấy đơn này.");
  if (r.paymentStatus === "CONFIRMED") return nope("Đơn này đã được xác nhận trước đó.");

  await prisma.reservation.update({
    where: { id: r.id },
    data: { paymentStatus: "CONFIRMED", paidAt: new Date(), status: "CONFIRMED" },
  });
  // Tử số của "conversion xem → trả tiền thật" (playbook §7.3 chỉ số 1).
  await track("deposit_confirmed", {
    userId: r.userId,
    barnSlug: r.barn?.slug,
    props: {
      depositVnd: r.depositVnd,
      priceEstimateVnd: r.priceEstimateVnd,
      productLine: r.productLine,
      healthPlanOptIn: r.healthPlanOptIn,
      // Bao lâu từ lúc giữ chỗ tới lúc tiền về — đo được ma sát của khâu chuyển khoản tay.
      hoursToPay: Math.round((Date.now() - r.createdAt.getTime()) / 3_600_000),
      source,
    },
  });

  if (r.barn) {
    await stamp(r.barn.id, r.barn.workerId, "MILESTONE",
      "Đã nhận được cọc của bạn — chuồng chính thức kích hoạt! Mình bắt tay vào chuẩn bị đàn nhé 🎉");
    await notify({
      userId: r.barn.ownerId,
      kind: "PAYMENT",
      title: "💰 Nông trại đã nhận cọc — chuồng kích hoạt!",
      body: `${r.barn.label} · trang trí đã mở khoá, bắt đầu xếp đặt được rồi.`,
      href: `/chuong/${r.barn.slug}`,
    });
    revalidatePath(`/chuong/${r.barn.slug}`);
    revalidatePath(`/chuong/${r.barn.slug}/trang-tri`);
    revalidatePath(`/chuong/${r.barn.slug}/nhat-ky`);
  }
  revalidatePath("/admin");
  return ok(`Đã xác nhận cọc ${transferCode(r.id)} — chuồng kích hoạt.`);
}

// ---------------- Hoá đơn trang trí ----------------

/**
 * Xác nhận đã nhận tiền trang trí → **lúc này** món mới vào chuồng.
 *
 * Đây là chỗ duy nhất `BarnDecor` được tạo từ một hoá đơn. Việc lắp đặt cho nông dân
 * đặt ở cuối, sau khi ghi xong — và nông dân vẫn phải gửi ảnh mới đóng được (§9.1).
 */
export async function confirmDecorPaid(
  orderId: string,
  source: PaySource,
): Promise<PayResult> {
  const order = await prisma.decorOrder.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { item: true } },
      barn: { select: { id: true, slug: true, label: true, ownerId: true, workerId: true } },
    },
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
    userId: order.userId,
    barnSlug: order.barn.slug,
    props: {
      orderId: order.id,
      count: order.items.length,
      totalVnd: order.totalVnd,
      hoursToPay: Math.round((Date.now() - order.createdAt.getTime()) / 3_600_000),
      source,
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
      barnId: order.barnId,
      workerId: order.barn.workerId,
      requestedById: order.userId,
      kind: "DECOR",
      title: "Lắp trang trí",
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

  revalidatePath(`/chuong/${order.barn.slug}/trang-tri`);
  revalidatePath(`/chuong/${order.barn.slug}`);
  revalidatePath("/admin");
  return ok(`Đã xác nhận hoá đơn ${decorCode(order.id)} — ${order.items.length} món đã vào chuồng.`);
}
