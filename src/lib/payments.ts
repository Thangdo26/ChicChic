// TIỀN ĐÃ VỀ - cửa duy nhất biến một khoản tiền thành "đơn đã thanh toán".
//
// Vì sao tách khỏi actions.ts / decor-actions.ts: bây giờ có HAI đường xác nhận
// (admin bấm tay ở /admin, và webhook ngân hàng tự khớp). Nếu mỗi đường tự viết
// phần "đổi trạng thái + ghi nhật ký + báo chuông + đặt việc" thì sớm muộn hai
// đường lệch nhau, và bên lệch sẽ là bên người dùng đã trả tiền mà chuồng vẫn khoá.
//
// File này KHÔNG kiểm quyền - đó là việc của chỗ gọi:
//   · server action → `isAdmin()`
//   · route webhook  → khoá API của nhà cung cấp
// Không có "use server" (giống notify.ts / task-store.ts).
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { track } from "@/lib/track";
import { upsertTask } from "@/lib/task-store";
import { stamp } from "@/lib/farm-log";
import { clampPlacement, type PayKind } from "@/lib/decor";
import { deliverLine, lotSummary, type DeliverTo, type LotType } from "@/lib/harvest";
import { khoiLabel, phuTu, themThang } from "@/lib/care";
import { hoaDonLabel } from "@/lib/billing";
import { hoaDonQuaHan } from "@/lib/invoices";

/** Ai đứng ra xác nhận - đi thẳng vào bảng đo để so hai đường với nhau. */
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
 * Tìm đơn theo mã chuyển khoản bóc được từ nội dung ngân hàng gửi về.
 *
 * Tra thẳng cột `payCode` (unique, có chỉ mục) nên chắc chắn ra 0 hoặc 1 dòng - bản cũ
 * dùng `id endsWith` vừa quét cả bảng mỗi lần tiền về, vừa có thể ra nhiều dòng vì
 * 6 ký tự cuối cuid không bảo đảm duy nhất.
 */
export async function resolvePayCode(
  kind: PayKind,
  code: string,
): Promise<ResolvedOrder | { error: string }> {
  if (kind === "COC") {
    const row = await prisma.reservation.findUnique({
      where: { payCode: code },
      select: { id: true, depositVnd: true, paymentStatus: true },
    });
    if (!row) return { error: "Không có đơn cọc nào mang mã này." };
    return {
      kind, id: row.id,
      expectedVnd: row.depositVnd,
      alreadyPaid: row.paymentStatus === "CONFIRMED",
    };
  }

  if (kind === "MARKET") {
    // Từ Đợt 13 mã chợ nằm ở ĐƠN, không ở tin đăng (§11.45).
    const don = await prisma.marketOrder.findUnique({
      where: { payCode: code },
      select: { id: true, totalVnd: true, status: true },
    });
    if (don) {
      return {
        kind, id: don.id,
        // `totalVnd` đã gồm phí giao - đó chính là số người mua phải chuyển.
        expectedVnd: don.totalVnd,
        alreadyPaid: don.status === "PAID" || don.status === "DELIVERED",
      };
    }
    // ⚠️ Mã TRƯỚC Đợt 13 nằm trên chính tin đăng. Không bỏ nhánh này: mã đó đang nằm
    // trong lịch sử chuyển khoản của người mua, và tiền về mà không tra ra đơn là một
    // khoản treo không ai biết của ai. Tin đăng cũ đã được gắn `orderId` lúc chuyển
    // tiếp dữ liệu, nên ở đây vẫn trả về ĐƠN - chỉ có một đường xử lý tiền, không hai.
    const row = await prisma.marketListing.findUnique({
      where: { payCode: code },
      select: { orderId: true, order: { select: { id: true, totalVnd: true, status: true } } },
    });
    if (!row?.order) return { error: "Không có đơn chợ nào mang mã này." };
    return {
      kind, id: row.order.id,
      expectedVnd: row.order.totalVnd,
      // Đã trả tiền rồi thì mọi trạng thái sau đó cũng tính là đã trả - chuyển thêm
      // lần nữa phải rơi vào nhánh DUPLICATE, không được cộng tiền lần hai.
      alreadyPaid: row.order.status === "PAID" || row.order.status === "DELIVERED",
    };
  }

  if (kind === "INVOICE") {
    const row = await prisma.barnInvoice.findUnique({
      where: { payCode: code },
      select: { id: true, totalVnd: true, paymentStatus: true },
    });
    if (!row) return { error: "Không có hoá đơn tiền nuôi nào mang mã này." };
    return {
      kind, id: row.id,
      expectedVnd: row.totalVnd,
      alreadyPaid: row.paymentStatus === "CONFIRMED",
    };
  }

  if (kind === "CARE") {
    const row = await prisma.careOrder.findUnique({
      where: { payCode: code },
      select: { id: true, totalVnd: true, paymentStatus: true },
    });
    if (!row) return { error: "Không có đơn nuôi dưỡng nào mang mã này." };
    return {
      kind, id: row.id,
      expectedVnd: row.totalVnd,
      alreadyPaid: row.paymentStatus === "CONFIRMED",
    };
  }

  const row = await prisma.decorOrder.findUnique({
    where: { payCode: code },
    select: { id: true, totalVnd: true, paymentStatus: true },
  });
  if (!row) return { error: "Không có hoá đơn trang trí nào mang mã này." };
  return {
    kind, id: row.id,
    expectedVnd: row.totalVnd,
    alreadyPaid: row.paymentStatus === "CONFIRMED",
  };
}

// ---------------- Đơn chợ ----------------

/**
 * Tiền của người mua đã về → lô chuyển sang "đã bán", và nông dân nhận việc GIAO.
 *
 * KHÔNG chi tiền cho người bán ở đây. Chi trả chỉ sinh ra khi lô **đã trao tay** và có
 * ảnh minh chứng (`completeTask` nhánh DELIVER). Đây là ký quỹ, và là lý do 20% phí
 * tồn tại: nông trại đứng ra bảo đảm giữa hai người không quen nhau.
 */
export async function confirmMarketPaid(
  orderId: string,
  source: PaySource,
): Promise<PayResult> {
  const don = await prisma.marketOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, payCode: true, buyerId: true, totalVnd: true, goodsVnd: true, shipVnd: true,
      deliverTo: true, zoneName: true,
      listings: {
        select: {
          id: true, priceVnd: true, netVnd: true, sellerId: true,
          lot: {
            select: {
              id: true, type: true, qty: true, weightKg: true,
              barn: { select: { id: true, slug: true, label: true, workerId: true } },
            },
          },
        },
      },
    },
  });
  if (!don) return nope("Không tìm thấy đơn chợ này.");
  if (don.listings.length === 0) return nope("Đơn này không có lô nào - chưa xác nhận được.");

  // So-sánh-rồi-đặt trong MỘT câu lệnh (§9.24): chỉ đơn đang RESERVED mới đi tiếp,
  // nên admin bấm tay và webhook chạy đồng thời thì chỉ một bên thắng.
  let already = false;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.marketOrder.updateMany({
      where: { id: don.id, status: "RESERVED" },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (count === 0) { already = true; return; }
    // Tin đăng và lô đi theo đơn. `paidAt` giữ trên từng tin đăng vì cửa sổ xin hoàn
    // tiền của đơn chợ (§11.38) tính theo TỪNG LÔ - người ta chỉ hỏng một lô trong ba.
    await tx.marketListing.updateMany({
      where: { orderId: don.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await tx.harvestLot.updateMany({
      where: { id: { in: don.listings.map((l) => l.lot.id) } },
      data: { status: "SOLD" },
    });
  }, { timeout: 20_000, maxWait: 10_000 });
  if (already) return nope("Đơn chợ này đã được xác nhận trước đó.");

  const tomTatLo = (l: (typeof don.listings)[number]) =>
    lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg });
  const tomTat = don.listings.map(tomTatLo).join(" + ");

  await track("market_paid", {
    userId: don.buyerId,
    barnSlug: don.listings[0].lot.barn.slug,
    props: {
      orderId: don.id, soLo: don.listings.length,
      goodsVnd: don.goodsVnd, shipVnd: don.shipVnd, totalVnd: don.totalVnd, source,
    },
  });

  // Hai bên nhận hai tin KHÁC NHAU - người mua cần biết bao giờ có hàng, người bán
  // cần biết bao giờ có tiền. Gộp một câu chung là bỏ mất nửa thông tin của mỗi bên.
  await notify({
    userId: don.buyerId,
    kind: "PAYMENT",
    title: `✅ Đã nhận tiền - ${don.listings.length} lô là của bạn`,
    body: "Nông trại sẽ giao tận tay và gửi ảnh lúc trao.",
    href: "/cho/cua-toi",
  });
  // Mỗi NGƯỜI BÁN một tin, gộp theo người: một đơn có thể gom lô của ba người khác nhau,
  // và bắn ba tin cho cùng một người vì họ bán ba lô là đúng kiểu dội chuông ở §9.8.
  const theoNguoiBan = new Map<string, typeof don.listings>();
  for (const l of don.listings) {
    theoNguoiBan.set(l.sellerId, [...(theoNguoiBan.get(l.sellerId) ?? []), l]);
  }
  for (const [sellerId, cua] of theoNguoiBan) {
    const tien = cua.reduce((s, l) => s + l.netVnd, 0);
    await notify({
      userId: sellerId,
      kind: "PAYMENT",
      title: `💰 ${cua.map(tomTatLo).join(" + ")} đã bán`,
      body: `Nông trại giao xong là chuyển ${tien.toLocaleString("vi-VN")}đ vào tài khoản bạn.`,
      href: "/cho/cua-toi",
    });
  }

  // ⭐ MỘT ĐƠN MỘT VIỆC GIAO (§11.44). Trước Đợt 13 việc này gộp theo CHUỒNG, nên hai
  // người mua khác nhau ở cùng một chuồng dùng chung một việc - ghi chú của người sau đè
  // người trước, và một tấm ảnh đóng cả hai đơn rồi sinh cả hai `Payout`. Nay khoá
  // `BarnTask.orderId @unique` làm chuyện đó không xảy ra được nữa.
  //
  // Việc gắn vào chuồng của LÔ ĐẦU TIÊN. Mọi lô đều đang nằm ở nông trại nên đây là một
  // chuyến xe duy nhất; cô/chú nhận việc là người của chuồng đó, và nông trại bàn giao
  // lại được nếu muốn người khác đi. Ghi chú liệt kê đủ lô của cả đơn.
  const chuong = don.listings[0].lot.barn;
  if (chuong.workerId) {
    const cacChuong = [...new Set(don.listings.map((l) => l.lot.barn.label))];
    const diaChi = deliverLine(don.deliverTo as DeliverTo | null);
    const task = await prisma.barnTask.findUnique({ where: { orderId: don.id }, select: { id: true } });
    if (!task) {
      await prisma.barnTask.create({
        data: {
          barnId: chuong.id, workerId: chuong.workerId, requestedById: don.buyerId,
          orderId: don.id, kind: "DELIVER", title: "Giao đơn đã bán",
          note:
            `Giao ${tomTat} tới: ${diaChi}` +
            (cacChuong.length > 1 ? ` · lô từ ${cacChuong.length} chuồng: ${cacChuong.join(", ")}` : ""),
        },
      });
      await notify({
        userId: await workerUserIdOfBarn(chuong.id),
        kind: "TASK_NEW",
        title: "📦 Việc mới: Giao đơn đã bán",
        body: `${tomTat} · ${don.zoneName ?? ""}`.trim(),
        href: `/nong-trai/chuong/${chuong.slug}#viec`,
      });
    }
  }

  revalidatePath("/cho");
  revalidatePath("/cho/cua-toi");
  for (const slug of new Set(don.listings.map((l) => l.lot.barn.slug))) {
    revalidatePath(`/chuong/${slug}/thu-hoach`);
  }
  revalidatePath("/admin");
  return ok(
    `Đã xác nhận đơn chợ ${don.payCode ?? don.id} - ${don.listings.length} lô, ` +
    `${don.totalVnd.toLocaleString("vi-VN")}đ. Nông dân nhận việc giao.`,
  );
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

  // So-sánh-rồi-đặt trong MỘT câu lệnh: điều kiện "chưa CONFIRMED" nằm ngay trong
  // WHERE nên hai đường xác nhận (admin bấm tay + webhook ngân hàng) chạy đồng thời
  // thì chỉ một bên đổi được trạng thái. Kiểm bằng `if` rồi mới `update` là để hở
  // đúng khe giữa hai câu lệnh - và bên thua sẽ ghi nhật ký + rung chuông lần hai.
  const { count } = await prisma.reservation.updateMany({
    where: { id: r.id, paymentStatus: { not: "CONFIRMED" } },
    data: { paymentStatus: "CONFIRMED", paidAt: new Date(), status: "CONFIRMED" },
  });
  if (count === 0) return nope("Đơn này đã được xác nhận trước đó.");
  // Tử số của "conversion xem → trả tiền thật" (playbook §7.3 chỉ số 1).
  await track("deposit_confirmed", {
    userId: r.userId,
    barnSlug: r.barn?.slug,
    props: {
      depositVnd: r.depositVnd,
      priceEstimateVnd: r.priceEstimateVnd,
      productLine: r.productLine,
      healthPlanOptIn: r.healthPlanOptIn,
      // Bao lâu từ lúc giữ chỗ tới lúc tiền về - đo được ma sát của khâu chuyển khoản tay.
      hoursToPay: Math.round((Date.now() - r.createdAt.getTime()) / 3_600_000),
      source,
    },
  });

  if (r.barn) {
    await stamp(r.barn.id, r.barn.workerId, "MILESTONE",
      "Đã nhận được cọc của bạn - chuồng chính thức kích hoạt! Mình bắt tay vào chuẩn bị đàn nhé 🎉");
    await notify({
      userId: r.barn.ownerId,
      kind: "PAYMENT",
      title: "💰 Nông trại đã nhận cọc - chuồng kích hoạt!",
      body: `${r.barn.label} · trang trí đã mở khoá, bắt đầu xếp đặt được rồi.`,
      href: `/chuong/${r.barn.slug}`,
    });
    revalidatePath(`/chuong/${r.barn.slug}`);
    revalidatePath(`/chuong/${r.barn.slug}/trang-tri`);
    revalidatePath(`/chuong/${r.barn.slug}/nhat-ky`);
  }
  revalidatePath("/admin");
  return ok(`Đã xác nhận cọc ${r.payCode ?? r.id} - chuồng kích hoạt.`);
}

// ---------------- Hoá đơn tiền nuôi ----------------

/**
 * Tiền nuôi đã về → hoá đơn đóng, và **chuồng mở khoá nếu đang bị khoá vì hoá đơn này**.
 *
 * Không có cột `locked` nào để bật/tắt: trạng thái khoá luôn được **suy ra** từ hoá đơn
 * quá hạn (`invoices.hoaDonQuaHan`). Đó là chủ ý - một cột trạng thái song song thì sớm
 * muộn cũng có ngày tiền đã về mà chuồng vẫn khoá vì quên cập nhật, và đó là kiểu lỗi
 * người dùng không bao giờ tha thứ.
 */
export async function confirmInvoicePaid(
  invoiceId: string,
  source: PaySource,
): Promise<PayResult> {
  const hd = await prisma.barnInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true, seq: true, payCode: true, totalVnd: true, grossVnd: true, creditVnd: true,
      userId: true, barnId: true, createdAt: true, periodTo: true,
      barn: {
        select: {
          slug: true, label: true, ownerId: true, workerId: true,
          flock: { select: { productLine: true } },
        },
      },
    },
  });
  if (!hd) return nope("Không tìm thấy hoá đơn này.");

  // So-sánh-rồi-đặt (§9.24): admin bấm tay và webhook chạy đồng thời thì chỉ một bên thắng.
  const { count } = await prisma.barnInvoice.updateMany({
    where: { id: hd.id, paymentStatus: { not: "CONFIRMED" } },
    data: { paymentStatus: "CONFIRMED", paidAt: new Date() },
  });
  if (count === 0) return nope("Hoá đơn này đã được xác nhận trước đó.");

  const ten = hoaDonLabel(hd.barn.flock?.productLine ?? "BROILER", hd.seq);

  await track("invoice_paid", {
    userId: hd.userId,
    barnSlug: hd.barn.slug,
    props: {
      invoiceId: hd.id, seq: hd.seq, grossVnd: hd.grossVnd, creditVnd: hd.creditVnd,
      totalVnd: hd.totalVnd,
      hoursToPay: Math.round((Date.now() - hd.createdAt.getTime()) / 3_600_000),
      source,
    },
  });

  // Còn hoá đơn quá hạn nào khác không - quyết định câu nói với người dùng. Trả xong một
  // tháng mà vẫn còn tháng khác quá hạn thì bảo "chuồng mở lại rồi" là nói sai.
  const conKhoa = await hoaDonQuaHan(hd.barnId);

  await notify({
    userId: hd.barn.ownerId,
    kind: "PAYMENT",
    title: `✅ Đã nhận ${ten.toLowerCase()}`,
    body: conKhoa
      ? `${hd.barn.label} · vẫn còn một kỳ quá hạn, thanh toán nốt là chuồng mở lại nhé.`
      : `${hd.barn.label} · cảm ơn bạn, chuồng vẫn chạy bình thường.`,
    href: `/chuong/${hd.barn.slug}`,
  });

  if (!conKhoa) {
    await stamp(hd.barnId, hd.barn.workerId, "MILESTONE",
      `Đã nhận ${ten.toLowerCase()} - cảm ơn bạn, tụi mình chăm tiếp nhé 🌾`);
  }

  revalidatePath(`/chuong/${hd.barn.slug}`);
  revalidatePath("/tai-khoan");
  revalidatePath("/admin");
  return ok(`Đã xác nhận ${ten.toLowerCase()} ${hd.payCode ?? hd.id}.`);
}

// ---------------- Nuôi dưỡng đàn nghỉ hưu ----------------

/**
 * Tiền nuôi dưỡng đã về → kéo dài kỳ nuôi dưỡng, và **đặt một việc chụp ảnh cho nông dân**.
 *
 * Cái việc chụp ảnh mới là điểm chính, không phải dòng trạng thái. Người chọn "nghỉ hưu"
 * trả tiền để đàn gà của họ được sống tiếp ở một nơi họ không nhìn thấy - thứ duy nhất
 * biến khoản đó từ *lòng tin* thành *bằng chứng* là một tấm ảnh có thật. Màn kết chu kỳ
 * đã hứa **"Bạn vẫn thi thoảng nhận ảnh"**; đây là chỗ lời hứa đó được nối vào máy móc
 * thay vì trông chờ ai đó nhớ ra.
 *
 * ⚠️ §9.32: kỳ nuôi dưỡng hết hạn **không** làm gì đàn gà cả. Hàm này chỉ biết cộng
 * thêm ngày; không có hàm đối xứng nào trừ đi, và đừng viết một cái.
 */
export async function confirmCarePaid(
  orderId: string,
  source: PaySource,
): Promise<PayResult> {
  const order = await prisma.careOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, payCode: true, months: true, totalVnd: true, monthlyVnd: true,
      userId: true, barnId: true, createdAt: true,
      barn: { select: { slug: true, label: true, ownerId: true, workerId: true } },
    },
  });
  if (!order) return nope("Không tìm thấy đơn nuôi dưỡng này.");

  // Hạn hiện tại = mốc xa nhất trong các đơn ĐÃ TRẢ của chuồng này. Đọc trong cùng
  // transaction với phép ghi để hai đơn cùng được xác nhận một lúc không đè lên nhau.
  let already = false;
  let phuDen: Date | null = null;
  await prisma.$transaction(async (tx) => {
    // So-sánh-rồi-đặt (§9.24): admin bấm tay và webhook chạy đồng thời thì chỉ một bên
    // đi tiếp - bên kia không được cộng thêm một kỳ nữa cho cùng một khoản tiền.
    const { count } = await tx.careOrder.updateMany({
      where: { id: order.id, paymentStatus: { not: "CONFIRMED" } },
      data: { paymentStatus: "CONFIRMED", paidAt: new Date() },
    });
    if (count === 0) { already = true; return; }

    const xa = await tx.careOrder.aggregate({
      where: { barnId: order.barnId, paymentStatus: "CONFIRMED", id: { not: order.id } },
      _max: { coversTo: true },
    });
    const tu = phuTu(xa._max.coversTo);
    phuDen = themThang(tu, order.months);
    await tx.careOrder.update({
      where: { id: order.id },
      data: { coversFrom: tu, coversTo: phuDen },
    });
  }, { timeout: 20_000, maxWait: 10_000 });
  if (already) return nope("Đơn nuôi dưỡng này đã được xác nhận trước đó.");

  const den = phuDen ? new Date(phuDen).toLocaleDateString("vi-VN") : "";

  await track("care_paid", {
    userId: order.userId,
    barnSlug: order.barn.slug,
    props: {
      orderId: order.id, months: order.months, monthlyVnd: order.monthlyVnd,
      totalVnd: order.totalVnd,
      hoursToPay: Math.round((Date.now() - order.createdAt.getTime()) / 3_600_000),
      source,
    },
  });

  await stamp(order.barnId, order.barn.workerId, "MILESTONE",
    `Đã nhận tiền nuôi dưỡng cho ${khoiLabel(order.months)} - các bạn gà tiếp tục an nhàn ở vườn tới ${den} 🌾`);

  await notify({
    userId: order.barn.ownerId,
    kind: "PAYMENT",
    title: `🌾 Đã nhận tiền nuôi dưỡng - ${khoiLabel(order.months)}`,
    body: `${order.barn.label} · đàn được chăm tới ${den}. Nông dân sẽ gửi bạn một tấm ảnh các bạn gà.`,
    href: `/chuong/${order.barn.slug}/nghi-huu`,
  });

  // Việc chụp ảnh - vẫn phải đính ảnh mới đóng được (§9.1). Đây là thứ chủ chuồng thực
  // sự mua: được nhìn thấy đàn gà của mình còn sống và ổn.
  if (order.barn.workerId) {
    const { created } = await upsertTask({
      barnId: order.barnId,
      workerId: order.barn.workerId,
      requestedById: order.userId,
      kind: "CHECK",
      title: "Chụp ảnh đàn gà nghỉ hưu",
      note: `Chủ chuồng vừa đóng tiền nuôi dưỡng ${khoiLabel(order.months)}. Chụp giúp một tấm các bạn gà đang ở vườn để gửi họ nhé.`,
      dueAt: null,
    });
    if (created) {
      await notify({
        userId: await workerUserIdOfBarn(order.barnId),
        kind: "TASK_NEW",
        title: "🌾 Việc mới: Chụp ảnh đàn gà nghỉ hưu",
        body: `${order.barn.label} · chủ chuồng vừa đóng tiền nuôi dưỡng.`,
        href: `/nong-trai/chuong/${order.barn.slug}#viec`,
      });
    }
  }

  revalidatePath(`/chuong/${order.barn.slug}/nghi-huu`);
  revalidatePath(`/chuong/${order.barn.slug}`);
  revalidatePath("/admin");
  return ok(`Đã xác nhận đơn nuôi dưỡng ${order.payCode ?? order.id} - đàn được chăm tới ${den}.`);
}

// ---------------- Hoá đơn trang trí ----------------

/**
 * Xác nhận đã nhận tiền trang trí → **lúc này** món mới vào chuồng.
 *
 * Đây là chỗ duy nhất `BarnDecor` được tạo từ một hoá đơn. Việc lắp đặt cho nông dân
 * đặt ở cuối, sau khi ghi xong - và nông dân vẫn phải gửi ảnh mới đóng được (§9.1).
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

  const top = await prisma.barnDecor.aggregate({ where: { barnId: order.barnId }, _max: { z: true } });
  let z = top._max.z ?? 0;
  const pieces = order.items.reduce((s, r) => s + r.qty, 0);
  // Một hoá đơn có thể lẫn cả món chuồng lẫn yếm - hai thứ đi hai đường khác nhau sau
  // khi tiền về, nên phải đếm riêng: món chuồng sinh việc LẮP cho nông dân ngay, còn
  // yếm thì chưa (chưa biết mặc cho con nào - chủ chuồng chọn sau).
  const coopPieces = order.items.filter((r) => !r.item.wearable).reduce((s, r) => s + r.qty, 0);
  const gearPieces = pieces - coopPieces;
  const names = (wearable: boolean) =>
    order.items
      .filter((r) => r.item.wearable === wearable)
      .map((r) => (r.qty > 1 ? `${r.item.name} ×${r.qty}` : r.item.name))
      .join(", ");

  // Một giao dịch: đổi trạng thái + đưa từng CÁI vào chuồng. Nửa vời thì người dùng
  // đã trả tiền mà chuồng vẫn trống.
  //
  // Tạo đúng `qty` bản cho mỗi dòng - không kiểm "đã có chưa" như bản cũ: bản cũ dựa
  // vào @@unique([barnId,itemId]) nên mua cái thứ hai sẽ bị nuốt mất mà vẫn thu tiền.
  // Xoè nhẹ vị trí mặc định để hai cái cùng loại không chồng khít lên nhau.
  let already = false;
  await prisma.$transaction(async (tx) => {
    // So-sánh-rồi-đặt: điều kiện "chưa CONFIRMED" nằm trong WHERE nên admin và webhook
    // chạy đồng thời thì chỉ MỘT bên đi tiếp. Kiểm bằng `if` trước transaction là để hở
    // khe cho cả hai cùng qua - và hậu quả là chuồng nhận gấp đôi số món đã trả tiền.
    const { count } = await tx.decorOrder.updateMany({
      where: { id: order.id, paymentStatus: { not: "CONFIRMED" } },
      data: { paymentStatus: "CONFIRMED", paidAt: new Date() },
    });
    if (count === 0) { already = true; return; }

    // MỘT câu lệnh cho tất cả các món, không phải một `create` mỗi cái. Hoá đơn có thể
    // tới 24 cái; với DB cách ~1,3s thì vòng lặp `create` nối tiếp vượt trần transaction
    // của Prisma (5s) và ném P2028 - người dùng đã trả tiền mà chuồng vẫn trống.
    //
    // ⭐ Món `wearable` (yếm) KHÔNG sinh `BarnDecor`: nó mặc lên gà chứ không lắp vào
    // chuồng. Tiền đã về nên nó vào KHO ngay (kho = đã trả tiền − đang lắp − đang đeo,
    // xem lib/decor-store), chủ chuồng chọn con gà sau ở /chuong/<slug>/dan-ga.
    // Bỏ dòng lọc này thì yếm hiện lù lù giữa hình vẽ chuồng.
    const rows = order.items.filter((row) => !row.item.wearable).flatMap((row) =>
      Array.from({ length: row.qty }, (_, n) => ({
        barnId: order.barnId,
        itemId: row.itemId,
        ...clampPlacement({
          x: row.item.defaultX + n * 14,
          y: row.item.defaultY + (n % 2) * 10,
          scale: 1,
        }),
        z: ++z,
      })),
    );
    if (rows.length > 0) await tx.barnDecor.createMany({ data: rows });
  }, { timeout: 20_000, maxWait: 10_000 });
  if (already) return nope("Hoá đơn này đã được xác nhận trước đó.");

  await track("decor_paid", {
    userId: order.userId,
    barnSlug: order.barn.slug,
    props: {
      orderId: order.id,
      lines: order.items.length,
      pieces,
      coopPieces,
      gearPieces,
      totalVnd: order.totalVnd,
      hoursToPay: Math.round((Date.now() - order.createdAt.getTime()) / 3_600_000),
      source,
    },
  });

  // Hoá đơn chỉ có yếm thì đừng bảo người ta "kéo tới chỗ bạn muốn" - chẳng có gì để
  // kéo, và lối đi tiếp là trang Đàn gà chứ không phải trang Trang trí.
  await notify({
    userId: order.barn.ownerId,
    kind: "PAYMENT",
    title: coopPieces === 0
      ? `🧣 Đã nhận tiền - ${gearPieces} yếm vào kho`
      : `🎨 Đã nhận tiền trang trí - ${pieces} món mở khoá`,
    body: coopPieces === 0
      ? `${order.barn.label} · mở trang Đàn gà chọn con để mặc, nông dân sẽ mặc thật rồi chụp ảnh gửi bạn.`
      : `${order.barn.label} · kéo tới chỗ bạn muốn rồi bấm lưu, nông dân sẽ lắp thật theo đó.`,
    href: coopPieces === 0
      ? `/chuong/${order.barn.slug}/dan-ga`
      : `/chuong/${order.barn.slug}/trang-tri`,
  });

  // Nông dân nhận việc lắp - vẫn phải đính ảnh mới đóng được (§9.1).
  //
  // CHỈ khi có món lắp vào chuồng. Yếm chưa sinh việc ở đây được: lúc này chưa biết
  // mặc cho con nào. Việc GEAR sinh khi chủ chuồng chọn con gà (`actions.wearGear`).
  if (order.barn.workerId && coopPieces > 0) {
    const { created } = await upsertTask({
      barnId: order.barnId,
      workerId: order.barn.workerId,
      requestedById: order.userId,
      kind: "DECOR",
      title: "Lắp trang trí",
      note: `Chủ chuồng vừa thanh toán ${coopPieces} món: ${names(false)}.`,
      dueAt: null,
    });
    if (created) {
      await notify({
        userId: await workerUserIdOfBarn(order.barnId),
        kind: "TASK_NEW",
        title: "🎨 Việc mới: Lắp trang trí",
        body: `${order.barn.label} · ${coopPieces} món vừa được thanh toán.`,
        href: `/nong-trai/chuong/${order.barn.slug}#viec`,
      });
    }
  }

  revalidatePath(`/chuong/${order.barn.slug}/trang-tri`);
  revalidatePath(`/chuong/${order.barn.slug}/dan-ga`);
  revalidatePath(`/chuong/${order.barn.slug}`);
  revalidatePath("/admin");
  return ok(
    `Đã xác nhận hoá đơn ${order.payCode ?? order.id} - ` +
      [coopPieces > 0 && `${coopPieces} món vào chuồng`, gearPieces > 0 && `${gearPieces} yếm vào kho`]
        .filter(Boolean)
        .join(" · "),
  );
}
