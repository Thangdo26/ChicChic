"use server";
// Admin cấp tài khoản đăng nhập cho các cô chú nông dân.
// Nông dân KHÔNG tự đăng ký được: admin đặt tên đăng nhập + mật khẩu rồi đưa tận tay,
// các cô chú dùng đúng thông tin đó vào /dang-nhap.
import { prisma } from "@/lib/db";
import { revalidatePath, revalidateTag } from "next/cache";
import { hashPassword, passwordProblem } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { cleanLine, normalizeMediaUrl } from "@/lib/decor";
import { MAX_SHIP_VND } from "@/lib/delivery";
import { stamp } from "@/lib/farm-log";
import { workerLoad } from "@/lib/workers";
import { duKienHoanChuong, tongKhoan } from "@/lib/refunds";
import { fmtVnd } from "@/lib/pricing";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Trần một lần nhập kho - gõ nhầm thêm một số 0 thì sửa được, thêm bốn thì khó tin. */
const MAX_STOCK = 9999;

/**
 * Nông trại nhập thêm / điều chỉnh số hàng còn trong kho.
 *
 * Đây là con số VẬT LÝ: bao nhiêu cái đang nằm trên kệ nông trại. Người mua đặt hoá
 * đơn là trừ ngay (giữ hàng), huỷ hoá đơn là cộng lại - xem `decor-actions`.
 *
 * `delta` thay vì đặt thẳng số tuyệt đối cho luồng "nhập thêm": hai người trực cùng
 * nhập hàng thì cộng dồn đúng, còn đặt tuyệt đối thì người sau ghi đè người trước.
 * Vẫn giữ đường đặt tuyệt đối (`set`) cho lúc kiểm kê lại kệ.
 */
export async function setDecorStock(
  slug: string,
  change: { delta: number } | { set: number },
): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const item = await prisma.decorItem.findUnique({
    where: { slug: String(slug) },
    select: { id: true, name: true, stockQty: true },
  });
  if (!item) return nope("Không tìm thấy món này.");

  let after: number;
  if ("set" in change) {
    const n = Math.floor(Number(change.set));
    if (!Number.isFinite(n) || n < 0 || n > MAX_STOCK) {
      return nope(`Số lượng phải trong khoảng 0–${MAX_STOCK}.`);
    }
    await prisma.decorItem.update({ where: { id: item.id }, data: { stockQty: n } });
    after = n;
  } else {
    const d = Math.floor(Number(change.delta));
    if (!Number.isFinite(d) || d === 0 || Math.abs(d) > MAX_STOCK) {
      return nope("Số nhập vào chưa hợp lệ.");
    }
    // Cộng dồn trong MỘT câu lệnh, và chặn không cho âm ngay trong WHERE: kho âm
    // nghĩa là sổ sách nói dối, và mọi phép tính phía sau đều sai theo.
    const { count } = await prisma.decorItem.updateMany({
      where: { id: item.id, ...(d < 0 ? { stockQty: { gte: -d } } : {}) },
      data: { stockQty: { increment: d } },
    });
    if (count === 0) return nope(`Kho chỉ còn ${item.stockQty} cái "${item.name}" - không bớt được nhiều hơn thế.`);
    after = item.stockQty + d;
  }

  revalidatePath("/admin");
  // Cửa hàng đọc danh mục qua `cachedDecorItems` (TTL 1 giờ) - không đá cache thì
  // hàng vừa nhập về vẫn hiện "hết hàng" suốt một tiếng.
  revalidateTag("catalog");
  return ok(`Kho "${item.name}": ${item.stockQty} → ${after} cái.`);
}

// ---------------- Chợ: giá niêm yết & chi trả ----------------

/**
 * Nông trại đổi giá niêm yết.
 *
 * THÊM DÒNG MỚI, không sửa dòng cũ: tin đăng đã ra chợ phải tra lại được đúng giá lúc
 * bán (cùng luật với `DecorOrderItem.priceVnd`). Vì `MarketListing` chốt sẵn ba con số
 * lúc đăng nên đổi giá hôm nay **không** đụng tin đăng hôm qua - dòng mới chỉ áp cho
 * tin đăng sau đó.
 *
 * ⚠️ Đổi giá ở đây mà quên `BASE_PRICES` là mở lại đúng lỗ chênh lệch mà cả tính năng
 * này được thiết kế để né - xem chú thích ở `data/catalog.ts`.
 */
export async function setMarketPrice(input: {
  type: "EGG" | "MEAT";
  /** Rỗng = áp cho mọi giống. Trứng dùng dòng này. */
  breedSlug?: string;
  unitVnd: number;
  note?: string;
}): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const type = input?.type === "MEAT" ? "MEAT" : "EGG";
  const breedSlug = String(input?.breedSlug ?? "").trim() || null;
  const unitVnd = Math.round(Number(input?.unitVnd));
  if (!Number.isFinite(unitVnd) || unitVnd <= 0 || unitVnd > 5_000_000) {
    return nope("Giá chưa hợp lệ.");
  }
  if (breedSlug) {
    const b = await prisma.breed.findUnique({ where: { slug: breedSlug }, select: { id: true } });
    if (!b) return nope("Không có giống nào mang mã này.");
  }

  await prisma.marketPrice.create({
    data: { type, breedSlug, unitVnd, note: String(input?.note ?? "").trim().slice(0, 200) || null },
  });

  // Đo được "đổi giá xong doanh số đi đâu" - nếu không ghi lại thì sau này nhìn số
  // liệu sẽ không hiểu vì sao có một bậc thang trong biểu đồ.
  await track("price_changed", { props: { type, breedSlug, unitVnd } });

  revalidatePath("/admin");
  revalidatePath("/cho");
  return ok(
    `Đã niêm yết ${type === "EGG" ? "trứng" : "gà thịt"}${breedSlug ? ` (${breedSlug})` : ""}: ` +
      `${unitVnd.toLocaleString("vi-VN")}đ/${type === "EGG" ? "quả" : "kg"}.`,
  );
}

/**
 * Nông trại đã chuyển tiền cho người bán → đóng khoản chi.
 *
 * Chi trả LUÔN làm tay ở PoC: tự động đẩy tiền ra là chỗ mà sai một lần là mất tiền
 * thật. Bắt buộc dán ảnh biên lai - không có bằng chứng thì khoản chi này chỉ là lời nói.
 */
export async function markPayoutPaid(payoutId: string, proofUrl: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const url = normalizeMediaUrl(String(proofUrl ?? ""));
  if (!url) return nope("Dán ảnh biên lai chuyển khoản trước đã nhé.");

  const p = await prisma.payout.findUnique({
    where: { id: String(payoutId) },
    select: { id: true, userId: true, amountVnd: true, status: true },
  });
  if (!p) return nope("Không tìm thấy khoản chi này.");

  // So-sánh-rồi-đặt: hai người trực cùng bấm thì chỉ một bên ghi được.
  const { count } = await prisma.payout.updateMany({
    where: { id: p.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date(), proofUrl: url },
  });
  if (count === 0) return nope("Khoản này đã được xử lý trước đó rồi.");

  await track("payout_paid", { userId: p.userId, props: { payoutId: p.id, amountVnd: p.amountVnd } });
  await notify({
    userId: p.userId,
    kind: "PAYMENT",
    title: `💸 Nông trại đã chuyển ${p.amountVnd.toLocaleString("vi-VN")}đ cho bạn`,
    body: "Kiểm tra tài khoản ngân hàng giúp mình nhé - có ảnh biên lai trong đơn.",
    href: "/cho/cua-toi",
  });

  revalidatePath("/admin");
  revalidatePath("/cho/cua-toi");
  return ok(`Đã ghi nhận chuyển ${p.amountVnd.toLocaleString("vi-VN")}đ.`);
}

// ---------------- Bàn giao chuồng ----------------

/**
 * Chuyển một chuồng sang nông dân khác.
 *
 * Đây là mảnh còn thiếu của luồng tạm dừng (CODEMAP §11.9): `toggleWorkerActive` khoá
 * đăng nhập nhưng KHÔNG gỡ `Barn.workerId`, mà app lại chưa có đường nào đổi người
 * chăm - nên những chuồng đó đứng im, chủ chuồng trả tiền mà không có tin, và cách
 * duy nhất để cứu là sửa `workerId` tay trong Supabase.
 *
 * Ba thứ phải đi CÙNG NHAU, thiếu một là hỏng:
 *  1. `Barn.workerId` - cửa của mọi cổng quyền phía nông dân (`canViewBarn`,
 *     `threadAccess`, `logHarvest`, `postDailyUpdate` đều so với cột này).
 *  2. **Việc đang chờ** - `completeTask` kiểm `task.workerId === w.workerId`, nên việc
 *     bỏ lại ở tên người cũ thì người mới nhìn thấy cũng không đóng được, và người cũ
 *     thì không đăng nhập được nữa. Việc treo vĩnh viễn.
 *  3. **Nói cho cả ba bên biết** (§9.8) - kể cả chủ chuồng: người đang chăm gà của họ
 *     vừa đổi là chuyện họ có quyền biết, và nó vào luôn nhật ký chuồng.
 *
 * KHÔNG đụng vào lịch sử: `HarvestLot.workerId`, `BarnMedia.workerId`, `FarmUpdate`
 * giữ nguyên tên người đã làm ra chúng - sổ cũ phải nói đúng ai đã làm gì.
 */
export async function reassignBarn(barnSlug: string, toWorkerId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới bàn giao được chuồng.");

  const [barn, to] = await Promise.all([
    prisma.barn.findUnique({
      where: { slug: String(barnSlug) },
      select: {
        id: true, slug: true, label: true, ownerId: true, workerId: true,
        worker: { select: { id: true, name: true, userId: true } },
      },
    }),
    prisma.farmWorker.findUnique({
      where: { id: String(toWorkerId) },
      select: { id: true, name: true, active: true, maxBarns: true, userId: true },
    }),
  ]);
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (!to) return nope("Không tìm thấy nông dân nhận bàn giao.");
  if (barn.workerId === to.id) return nope(`${to.name} đang phụ trách chuồng này rồi.`);

  // Người nhận phải đang hoạt động - bàn giao sang một tài khoản cũng đang tạm dừng
  // là dời nguyên vẹn khoảng trống này sang chỗ khác.
  if (!to.active) return nope(`${to.name} đang tạm dừng - chọn cô/chú khác, hoặc mở lại tài khoản trước.`);

  // Trần `maxBarns` đọc LẠI ở đây chứ không tin con số trên màn hình (§9.3): danh sách
  // admin đang nhìn có thể đã cũ vài phút, mà trong lúc đó có người vừa nhận chuồng.
  const load = await workerLoad(to.id);
  if (load >= to.maxBarns) {
    return nope(`${to.name} đã kín ${to.maxBarns} chuồng - chọn giúp mình cô/chú khác nhé.`);
  }

  const from = barn.worker;
  const moved = await prisma.$transaction(async (tx) => {
    await tx.barn.update({ where: { id: barn.id }, data: { workerId: to.id } });
    // `seenAt: null` để việc hiện lại dấu "MỚI" - với người nhận thì đúng là việc mới.
    const { count } = await tx.barnTask.updateMany({
      where: { barnId: barn.id, status: "OPEN" },
      data: { workerId: to.id, seenAt: null },
    });
    return count;
  });

  // Vào nhật ký của chuồng để chủ chuồng đọc lại được sau này, không chỉ là một dòng
  // chuông rồi trôi mất.
  await stamp(barn.id, to.id, "NOTE",
    from
      ? `Nông trại chuyển việc chăm chuồng từ ${from.name} sang ${to.name}. Từ hôm nay ${to.name} là người gửi tin và ảnh cho bạn.`
      : `${to.name} bắt đầu nhận chăm chuồng này.`);

  await track("barn_reassigned", {
    barnSlug: barn.slug,
    props: { fromWorkerId: from?.id ?? null, toWorkerId: to.id, movedTasks: moved },
  });

  await notify({
    userId: to.userId,
    kind: "BARN_ASSIGNED",
    title: `🏡 Cô/chú nhận thêm chuồng ${barn.label}`,
    body: moved > 0
      ? `Nông trại vừa bàn giao chuồng này cho cô/chú, kèm ${moved} việc đang chờ.`
      : "Nông trại vừa bàn giao chuồng này cho cô/chú.",
    href: `/nong-trai/chuong/${barn.slug}#viec`,
  });
  if (from?.userId) {
    await notify({
      userId: from.userId,
      kind: "BARN_RETURNED",
      title: `Chuồng ${barn.label} đã chuyển sang người khác`,
      body: `Nông trại đã bàn giao chuồng này cho ${to.name}. Cảm ơn cô/chú đã chăm giúp.`,
      href: "/nong-trai",
    });
  }
  await notify({
    userId: barn.ownerId,
    kind: "BARN_UPDATE",
    title: `${barn.label} đổi người chăm`,
    body: from
      ? `${from.name} tạm nghỉ, nông trại đã nhờ ${to.name} tiếp tục chăm đàn gà của bạn.`
      : `Nông trại đã cử ${to.name} chăm đàn gà của bạn.`,
    href: `/chuong/${barn.slug}/nhat-ky`,
  });

  revalidatePath("/admin");
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${barn.slug}`);
  revalidatePath(`/chuong/${barn.slug}`);
  revalidatePath(`/chuong/${barn.slug}/nhat-ky`);
  revalidatePath(`/chuong/${barn.slug}/tin-nhan`);
  revalidatePath("/tai-khoan");

  return ok(
    `Đã bàn giao ${barn.label} cho ${to.name}` +
    (moved > 0 ? `, kèm ${moved} việc đang chờ.` : ".") +
    (barn.ownerId ? " Chủ chuồng đã được báo." : ""),
  );
}

// ---------------- Vùng giao hàng ----------------

/**
 * Khai / sửa một vùng giao (§11.43).
 *
 * Vì sao là bảng chứ không phải hằng số trong mã: phí giao đổi theo mùa, theo giá xăng,
 * theo việc tuần này có ai đi hướng đó không. Người trực phải tự sửa được mà không cần
 * deploy - cùng lý do với `MarketPrice`.
 *
 * ⚠️ **Sửa phí KHÔNG đổi đơn đã chốt.** `MarketOrder` chụp lại `shipVnd` lúc chốt giỏ,
 * y hệt cách tin đăng chụp giá lúc đăng. Đổi phí hôm nay mà đơn hôm qua nhảy số là mã QR
 * người ta đang cầm bỗng sai số tiền.
 *
 * ⚠️ **Tắt vùng (`active = false`) chứ đừng xoá.** Địa chỉ của người dùng trỏ vào đây;
 * xoá là làm hỏng địa chỉ của họ mà không ai báo. Tắt thì họ đọc được đúng lý do
 * ("nông trại đang tạm ngừng giao tới khu vực của bạn") và chọn lại được.
 */
export async function setDeliveryZone(input: {
  id?: string; name?: string; feeVnd?: number; active?: boolean; sortOrder?: number;
}): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới khai được vùng giao.");

  const id = String(input?.id ?? "").trim();
  const name = cleanLine(input?.name ?? "", 60);
  const feeVnd = Math.max(0, Math.min(MAX_SHIP_VND, Math.round(Number(input?.feeVnd ?? 0)) || 0));
  const sortOrder = Math.max(0, Math.min(999, Math.round(Number(input?.sortOrder ?? 0)) || 0));

  if (id) {
    const cu = await prisma.deliveryZone.findUnique({ where: { id }, select: { name: true } });
    if (!cu) return nope("Không tìm thấy vùng giao này.");
    const data: { feeVnd: number; sortOrder: number; name?: string; active?: boolean } = { feeVnd, sortOrder };
    if (name) data.name = name;
    if (typeof input?.active === "boolean") data.active = input.active;
    await prisma.deliveryZone.update({ where: { id }, data });
  } else {
    if (!name) return nope("Đặt tên vùng giúp mình nhé - đó là chữ người mua sẽ đọc.");
    const trung = await prisma.deliveryZone.findUnique({ where: { name }, select: { id: true } });
    if (trung) return nope(`Đã có vùng tên "${name}" rồi - sửa dòng đó thay vì thêm dòng mới.`);
    await prisma.deliveryZone.create({ data: { name, feeVnd, sortOrder, active: true } });
  }

  revalidatePath("/admin");
  revalidatePath("/cho");
  revalidatePath("/cho/cua-toi");
  return ok(
    feeVnd === 0
      ? `Đã lưu vùng ${name || "này"} - miễn phí giao.`
      : `Đã lưu vùng ${name || "này"} - phí ${fmtVnd(feeVnd)} một chuyến.`,
  );
}

// ---------------- Xoá hẳn một chuồng ----------------

/**
 * Xoá HẲN một chuồng khỏi nông trại (§11.42).
 *
 * ⚠️ **Đây là thao tác phá huỷ duy nhất trong cả sản phẩm, và nó không hoàn tác được.**
 * Mọi thứ khác ở đây đều đổi trạng thái; cái này xoá dòng. Đi cùng chuồng là ảnh, video,
 * việc đã làm, sổ thu hoạch, hộp thư, hoá đơn - tức là **cuốn nhật ký của một con vật
 * thật**, thứ mà cả sản phẩm này bán. Vì thế nó có ba lớp chắn, đừng gỡ lớp nào:
 *
 *  1. `isAdmin()` - như mọi thao tác ở `/admin`.
 *  2. **Gõ lại đúng slug**, kiểm ở SERVER (§9.6). Client cũng hỏi, nhưng client chỉ là
 *     mỹ quan: `"use server"` là endpoint công khai, gọi thẳng bằng một dòng fetch được.
 *  3. **Từ chối khi còn tiền đang đi.** Xem `KHOA_TIEN` bên dưới.
 *
 * **Tiền thì không bị xoá theo.** Hai nhánh, cố ý khác nhau:
 *
 *  · `Refund` mang `onDelete: SetNull` và đã chụp sẵn `barnLabel`, nên sổ nợ SỐNG SÓT
 *    nguyên vẹn - xoá chuồng không xoá được khoản nông trại đang nợ ai.
 *  · `Reservation` (đơn cọc, có `payCode` và `paidAt`) được **gỡ khỏi chuồng rồi
 *    CANCELLED**, không xoá: đó là chứng từ một lần chuyển khoản có thật.
 *  · Và nếu chuồng ĐANG CÓ CHỦ, hàm này ghi luôn khoản hoàn tiền nuôi theo tỉ lệ ngày
 *    còn lại - đúng cách `auth-actions.returnBarn` làm khi người ta tự trả chuồng. Xoá
 *    chuồng của một người đang trả tiền mà im lặng giữ phần chưa nuôi là ăn tiền của họ.
 *
 * Còn `MarketListing`/`Payout` thì **cascade theo `HarvestLot`**, nghĩa là chúng sẽ biến
 * mất thật - nên phải chặn TRƯỚC, không được để đi tới đó.
 */

/** Trạng thái tin đăng nghĩa là "tiền của người khác đang nằm trong lô này". */
const KHOA_TIEN = ["RESERVED", "PAID", "DELIVERED"] as const;

export async function deleteBarn(barnSlug: string, typedSlug: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới xoá được chuồng.");

  const slug = String(barnSlug ?? "").trim();
  const barn = await prisma.barn.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, label: true, ownerId: true, workerId: true,
      owner: { select: { name: true, email: true } },
      worker: { select: { userId: true, name: true } },
      flock: { select: { id: true } },
      _count: { select: { media: true, tasks: true, lots: true, invoices: true, messages: true } },
    },
  });
  if (!barn) return nope("Không tìm thấy chuồng này.");

  // Gõ lại slug - kiểm ở server chứ không tin cái hộp thoại bên client (§9.6).
  if (String(typedSlug ?? "").trim() !== barn.slug) {
    return nope(`Gõ đúng "${barn.slug}" vào ô xác nhận thì mới xoá được.`);
  }

  // ⛔ Tiền đang đi thì dừng lại. Lô của chuồng này có thể đang là hàng người khác đã
  // TRẢ TIỀN; xoá chuồng sẽ cuốn theo `MarketListing` và cả `Payout` - tức là xoá đúng
  // khoản nông trại đang nợ người bán, và xoá luôn thứ người mua đang chờ nhận.
  const keta = await prisma.marketListing.count({
    where: { lot: { barnId: barn.id }, status: { in: [...KHOA_TIEN] } },
  });
  if (keta > 0) {
    return nope(
      `${barn.label} còn ${keta} đơn chợ đang có tiền (đã đặt / đã trả / chờ giao). ` +
      "Giao xong và chi trả cho người bán trước đã - xoá bây giờ là xoá luôn khoản nợ đó.",
    );
  }

  // Chủ chuồng còn tiền nuôi chưa dùng hết thì ghi nợ TRƯỚC, trong cùng transaction với
  // phép xoá - hệt `returnBarn`. Tách ra là mở khe "chuồng đã mất mà nợ chưa ghi", và ở
  // đây khe đó tệ hơn: sau khi xoá thì không còn gì để tính lại nữa.
  const moc = new Date();
  const khoan = barn.ownerId ? await duKienHoanChuong(barn.id, moc) : [];
  const tong = tongKhoan(khoan);

  await prisma.$transaction(async (tx) => {
    if (barn.ownerId && khoan.length > 0) {
      await tx.refund.createMany({
        data: khoan.map((k) => ({
          userId: barn.ownerId!,
          barnId: barn.id,
          barnLabel: barn.label,
          kind: k.kind,
          sourceId: k.sourceId,
          amountVnd: k.amountVnd,
          reason: `Nông trại xoá chuồng · ${k.nhan}`,
        })),
        skipDuplicates: true,
      });
    }

    // Đơn cọc: GIỮ LẠI, chỉ gỡ khỏi chuồng. Đây là chứng từ của một lần chuyển khoản có
    // thật - `payCode` của nó còn phải khớp với sao kê ngân hàng sau này.
    await tx.reservation.updateMany({
      where: { barnId: barn.id },
      data: { barnId: null, status: "CANCELLED" },
    });

    // Những bảng KHÔNG cascade - phải tự dọn, đúng thứ tự này. Thiếu một cái là cả câu
    // lệnh xoá bật lại bằng lỗi khoá ngoại (và may là bật lại chứ không xoá nửa vời).
    await tx.lifecycleDecision.deleteMany({ where: { barnId: barn.id } });
    await tx.barnDecor.deleteMany({ where: { barnId: barn.id } });
    await tx.farmUpdate.deleteMany({ where: { barnId: barn.id } });
    if (barn.flock) {
      await tx.healthEvent.deleteMany({ where: { flockId: barn.flock.id } });
      await tx.product.deleteMany({ where: { flockId: barn.flock.id } });
      await tx.bird.deleteMany({ where: { flockId: barn.flock.id } }); // BirdGear cascade theo Bird
      await tx.flock.delete({ where: { id: barn.flock.id } });
    }

    // Còn lại đi theo cascade khai trong schema: tasks · media · messages · invoices ·
    // decorOrders(+items) · careOrders · weighIns · lots(→listings→payouts).
    await tx.barn.delete({ where: { id: barn.id } });
  }, { timeout: 20_000, maxWait: 10_000 });

  // Ghi vết TRƯỚC KHI báo ai: sau lệnh trên, dòng `Event` này là thứ duy nhất còn lại
  // nói rằng chuồng đó từng tồn tại.
  await track("barn_deleted", {
    userId: barn.ownerId,
    barnSlug: barn.slug,
    props: {
      label: barn.label,
      coChu: !!barn.ownerId,
      media: barn._count.media,
      tasks: barn._count.tasks,
      lots: barn._count.lots,
      invoices: barn._count.invoices,
      messages: barn._count.messages,
      hoanVnd: tong,
    },
  });

  // Nói thẳng, không uyển ngữ: người ta vừa mất cuốn nhật ký của con vật mình nuôi.
  if (barn.ownerId) {
    await notify({
      userId: barn.ownerId,
      kind: "BARN_UPDATE",
      title: `${barn.label} đã được nông trại gỡ khỏi tài khoản của bạn`,
      body: tong > 0
        ? `Ảnh và nhật ký của chuồng này không còn nữa. Nông trại còn nợ bạn ${fmtVnd(tong)} tiền nuôi những ngày chưa nuôi - xem ở trang Tài khoản.`
        : "Ảnh và nhật ký của chuồng này không còn nữa. Liên hệ nông trại nếu bạn cần biết lý do.",
      href: "/tai-khoan",
    });
  }
  if (barn.worker?.userId) {
    await notify({
      userId: barn.worker.userId,
      kind: "BARN_RETURNED",
      title: `${barn.label} đã được nông trại xoá`,
      body: "Chuồng này không còn trong danh sách của cô/chú nữa. Việc đang chờ của nó cũng đã bỏ.",
      href: "/nong-trai",
    });
  }

  revalidatePath("/admin");
  revalidatePath("/nong-trai");
  revalidatePath("/tai-khoan");
  revalidatePath("/chuong");
  revalidatePath("/cho");
  revalidatePath(`/chuong/${barn.slug}`);

  return ok(
    `Đã xoá ${barn.label} (${barn._count.media} ảnh/video, ${barn._count.lots} lô, ` +
    `${barn._count.invoices} hoá đơn).` +
    (tong > 0 ? ` Đã ghi nợ ${fmtVnd(tong)} hoàn lại cho chủ chuồng - xem khối ↩️ Hoàn tiền.` : "") +
    (barn.ownerId ? " Chủ chuồng đã được báo." : ""),
  );
}

/** Tên đăng nhập: chữ thường, số, dấu chấm/gạch - gõ được trên bàn phím điện thoại. */
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/**
 * Email nội bộ sinh từ tên đăng nhập. Cột User.email là unique NOT NULL nên vẫn
 * phải có giá trị, nhưng địa chỉ này KHÔNG dùng để gửi thư - nông dân đăng nhập
 * bằng username, quên mật khẩu thì admin đặt lại.
 */
const internalEmail = (username: string) => `${username}@nong-dan.chicchic.vn`;

/** Dữ liệu form cấp tài khoản. Dùng tham số thường thay cho FormData để test được. */
export type NewWorkerInput = {
  /** Có → gắn login vào hồ sơ nông dân đã tồn tại; rỗng → tạo hồ sơ mới. */
  workerId?: string;
  name?: string;
  area?: string;
  username: string;
  password: string;
  yearsExp?: number;
  maxBarns?: number;
};

function readWorkerInput(input: NewWorkerInput) {
  return {
    workerId: String(input.workerId ?? "").trim(),
    name: String(input.name ?? "").trim().slice(0, 80),
    username: String(input.username ?? "").trim().toLowerCase(),
    password: String(input.password ?? ""),
    area: String(input.area ?? "").trim().slice(0, 120),
    yearsExp: Math.max(0, Math.min(60, Number(input.yearsExp ?? 5) || 5)),
    maxBarns: Math.max(1, Math.min(50, Number(input.maxBarns ?? 15) || 15)),
  };
}

/**
 * Tạo tài khoản đăng nhập cho nông dân.
 * - Có `workerId` → gắn tài khoản vào hồ sơ nông dân đã có (vd người được seed sẵn).
 * - Không có     → tạo luôn hồ sơ nông dân mới rồi gắn tài khoản.
 */
export async function createWorkerAccount(input: NewWorkerInput): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới cấp được tài khoản.");

  const f = readWorkerInput(input);
  if (!USERNAME_RE.test(f.username)) {
    return nope("Tên đăng nhập cần 3–32 ký tự, chỉ chữ thường không dấu, số, dấu . _ -");
  }
  const pw = passwordProblem(f.password);
  if (pw) return nope(pw);

  const taken = await prisma.user.findFirst({
    where: { OR: [{ username: f.username }, { email: internalEmail(f.username) }] },
    select: { id: true },
  });
  if (taken) return nope(`Tên đăng nhập "${f.username}" đã có người dùng - chọn tên khác nhé.`);

  // Gắn vào hồ sơ nông dân có sẵn
  if (f.workerId) {
    const worker = await prisma.farmWorker.findUnique({
      where: { id: f.workerId },
      select: { id: true, name: true, userId: true },
    });
    if (!worker) return nope("Không tìm thấy hồ sơ nông dân này.");
    if (worker.userId) return nope(`${worker.name} đã có tài khoản đăng nhập rồi.`);

    const user = await prisma.user.create({
      data: {
        email: internalEmail(f.username), username: f.username, name: worker.name,
        role: "WORKER", passwordHash: await hashPassword(f.password), emailVerifiedAt: new Date(),
      },
    });
    await prisma.farmWorker.update({ where: { id: worker.id }, data: { userId: user.id } });
    await notify({
      userId: user.id, kind: "ACCOUNT",
      title: "🔑 Tài khoản của bạn đã sẵn sàng",
      body: `Đăng nhập bằng tên "${f.username}". Việc được giao sẽ hiện ở đây.`,
      href: "/nong-trai",
    });

    revalidatePath("/admin");
    return ok(`Đã cấp tài khoản "${f.username}" cho ${worker.name}.`);
  }

  // Tạo hồ sơ nông dân mới
  if (f.name.length < 2) return nope("Nhập tên cô/chú nông dân giúp mình.");
  if (f.area.length < 2) return nope("Nhập khu vực (vd: Ba Vì, Hà Nội).");

  const farm = await prisma.farm.findFirst({ select: { id: true } });
  if (!farm) return nope("Chưa có nông trại nào trong hệ thống - chạy `npm run db:seed` trước.");

  // Băm mật khẩu TRƯỚC transaction: scrypt mất ~100ms, giữ transaction mở trong lúc
  // đó là giữ luôn một kết nối của pool Supabase (chỉ có 5) mà không làm gì cả.
  const workerHash = await hashPassword(f.password);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: internalEmail(f.username), username: f.username, name: f.name,
        role: "WORKER", passwordHash: workerHash, emailVerifiedAt: new Date(),
      },
    });
    const worker = await tx.farmWorker.create({
      data: {
        name: f.name, area: f.area, farmId: farm.id, userId: user.id,
        yearsExp: f.yearsExp, maxBarns: f.maxBarns, consentMedia: true, active: true,
      },
    });
    return { user, worker };
  });

  await notify({
    userId: created.user.id, kind: "ACCOUNT",
    title: "🔑 Chào mừng cô/chú tới ChicChic",
    body: `Đăng nhập bằng tên "${f.username}". Chuồng và việc được giao sẽ hiện ở đây.`,
    href: "/nong-trai",
  });

  revalidatePath("/admin");
  revalidatePath("/nhan-chuong");
  return ok(`Đã tạo nông dân ${f.name} với tên đăng nhập "${f.username}".`);
}

/**
 * Đặt lại mật khẩu khi cô/chú quên. Ghi thẳng vào DB và **huỷ mọi phiên cũ**
 * (ai đang đăng nhập bằng mật khẩu cũ sẽ bị đăng xuất ngay).
 */
export async function resetWorkerPassword(workerId: string, password: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới đổi được mật khẩu.");

  const pw = passwordProblem(password);
  if (pw) return nope(pw);

  const worker = await prisma.farmWorker.findUnique({
    where: { id: workerId },
    select: { name: true, userId: true, user: { select: { username: true } } },
  });
  if (!worker?.userId) return nope("Nông dân này chưa có tài khoản để đổi mật khẩu.");

  const newHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: worker.userId }, data: { passwordHash: newHash } }),
    prisma.session.deleteMany({ where: { userId: worker.userId } }),
  ]);
  await notify({
    userId: worker.userId, kind: "ACCOUNT",
    title: "🔑 Mật khẩu của bạn vừa được nông trại đặt lại",
    body: "Đăng nhập lại bằng mật khẩu mới nông trại đưa cho cô/chú nhé.",
    href: "/nong-trai",
  });

  revalidatePath("/admin");
  return ok(`Đã đổi mật khẩu cho ${worker.name}${worker.user?.username ? ` (${worker.user.username})` : ""} - cô/chú cần đăng nhập lại.`);
}

/**
 * Tạm dừng / mở lại tài khoản một nông dân.
 *
 * Tạm dừng có HAI tác dụng, đừng nhầm là một:
 * 1. Ẩn khỏi danh sách chọn ở /nhan-chuong (không nhận chuồng mới).
 * 2. **Khoá đăng nhập** - và huỷ luôn mọi phiên đang mở, nếu không thì người đang
 *    đăng nhập sẵn vẫn dùng tiếp được tới khi cookie hết hạn (30 ngày).
 *
 * Chuồng đang chăm KHÔNG bị gỡ khỏi cô/chú - nhưng cô/chú cũng không gửi tin được
 * cho những chuồng đó nữa. Chỗ gọi phải cảnh báo admin điều này.
 */
export async function toggleWorkerActive(workerId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới làm được việc này.");

  const worker = await prisma.farmWorker.findUnique({
    where: { id: workerId },
    select: { name: true, active: true, userId: true, _count: { select: { barns: true } } },
  });
  if (!worker) return nope("Không tìm thấy nông dân này.");

  const suspending = worker.active;
  await prisma.farmWorker.update({ where: { id: workerId }, data: { active: !worker.active } });

  if (suspending && worker.userId) {
    // Đá ra khỏi mọi thiết bị đang đăng nhập
    await prisma.session.deleteMany({ where: { userId: worker.userId } });
  }
  await notify({
    userId: worker.userId,
    kind: "ACCOUNT",
    title: suspending ? "⏸️ Nông trại đã tạm dừng tài khoản của bạn" : "✅ Tài khoản của bạn đã mở lại",
    body: suspending
      ? "Trong lúc này cô/chú chưa đăng nhập được. Liên hệ nông trại khi cần mở lại."
      : "Cô/chú đăng nhập lại bình thường và nhận chuồng mới được rồi.",
    href: "/nong-trai",
  });

  revalidatePath("/admin");
  revalidatePath("/nhan-chuong");
  revalidatePath("/nong-trai");

  if (!suspending) return ok(`${worker.name} đăng nhập và nhận chuồng mới trở lại được rồi.`);
  return ok(
    worker._count.barns > 0
      ? `Đã tạm dừng ${worker.name}: không đăng nhập được nữa, đã đăng xuất khỏi mọi thiết bị. ${worker._count.barns} chuồng vẫn gắn tên cô/chú và sẽ KHÔNG có tin mới - bàn giao chúng ở khối "🔄 Chuồng đang không có người chăm" ngay trên.`
      : `Đã tạm dừng ${worker.name}: không đăng nhập được nữa, đã đăng xuất khỏi mọi thiết bị.`,
  );
}
