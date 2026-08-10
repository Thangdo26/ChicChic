"use server";
// NUÔI DƯỠNG ĐÀN NGHỈ HƯU — đóng tiền theo khối tháng.
//
// VÌ SAO CÓ FILE NÀY: màn kết chu kỳ nói với chủ chuồng *"Phí nuôi dưỡng 60.000đ/tháng,
// đối soát tay như các khoản khác"*, rồi bấm xong thì **không có gì cả** — không hoá
// đơn, không mã chuyển khoản, `/admin` không biết có ai vừa chọn nghỉ hưu. Một dòng
// `LifecycleDecision.retireFeeVnd = 60000` nằm im trong bảng, không ai đọc. Sản phẩm hứa
// một dịch vụ có phí rồi tự quên mất phần thu tiền (CODEMAP §11.13).
//
// Luật giống hệt trang trí và chợ, cố ý: đặt (UNPAID) → chuyển khoản → báo đã chuyển
// (REPORTED) → nông trại đối soát hoặc webhook tự khớp (CONFIRMED) → LÚC ĐÓ kỳ nuôi
// dưỡng mới được cộng thêm. Cùng enum `PaymentStatus`, cùng kiểu mã, cùng chỗ đối soát.
//
// ⚠️ **§9.32** — không có hàm nào ở đây, và sẽ không bao giờ có hàm nào, gắn hậu quả lên
// con gà vì chuyện tiền. Không huỷ nuôi dưỡng, không "trả đàn", không hạ trạng thái đàn.
// Hết hạn thì nhắc người; đàn vẫn được chăm.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { confirmCarePaid } from "@/lib/payments";
import { newPayCode } from "@/lib/decor";
import { careTotalVnd, khoiLabel, laKhoiHopLe } from "@/lib/care";
import { RETIRE_CARE_VND } from "@/data/catalog";
import { fmtVnd } from "@/lib/pricing";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Nhiều đơn chưa trả cùng lúc là mời người ta chuyển nhầm mã. Một đơn đang chờ là đủ. */
const MAX_DON_CHO = 1;

function revalidateCare(slug: string) {
  revalidatePath(`/chuong/${slug}/nghi-huu`);
  revalidatePath(`/chuong/${slug}`);
  revalidatePath("/admin");
}

type CareBarn = { id: string; slug: string; label: string; ownerId: string | null; flockId: string };

/**
 * Cổng: phải là chủ chuồng (hoặc admin), và **đàn phải đang thực sự nghỉ hưu**.
 *
 * Điều kiện thứ hai không phải cho đẹp: không có nó thì ai cũng mua được "nuôi dưỡng đàn
 * nghỉ hưu" cho một chuồng gà đang đẻ — tức là thu tiền cho một dịch vụ không tồn tại.
 */
async function chuongNghiHuu(slug: string): Promise<{ barn: CareBarn; userId: string } | { deny: ActionResult }> {
  const me = await getSessionUser();
  if (!me) return { deny: nope("Bạn cần đăng nhập để làm việc này.") };

  const row = await prisma.barn.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, label: true, ownerId: true,
      flock: { select: { id: true, stage: true } },
    },
  });
  if (!row) return { deny: nope("Không tìm thấy chuồng này.") };
  if (row.ownerId !== me.id && me.role !== "ADMIN") {
    return { deny: nope("Chuồng này không thuộc tài khoản của bạn.") };
  }
  if (!row.flock) return { deny: nope("Chuồng này chưa có đàn.") };
  if (row.flock.stage !== "RETIRED") {
    return { deny: nope("Đàn của chuồng này chưa nghỉ hưu, nên chưa có phí nuôi dưỡng.") };
  }

  const { flock, ...barn } = row;
  return { barn: { ...barn, flockId: flock.id }, userId: me.id };
}

/**
 * Đặt một khối nuôi dưỡng.
 *
 * `months` đi qua `laKhoiHopLe` chứ không dùng thẳng (§9.6): client gửi `months = 999` là
 * tự đặt cho mình một hoá đơn 60 triệu, hoặc `months = 0` là mua vĩnh viễn với giá 0đ.
 * Tiền cũng **tính lại ở server**, không nhận tổng từ client.
 */
export async function createCareOrder(barnSlug: string, months: number): Promise<ActionResult> {
  const gate = await chuongNghiHuu(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn, userId } = gate;

  if (!laKhoiHopLe(months)) return nope("Kỳ nuôi dưỡng này không có trong bảng giá.");

  const dangCho = await prisma.careOrder.count({
    where: { barnId: barn.id, paymentStatus: { not: "CONFIRMED" } },
  });
  if (dangCho >= MAX_DON_CHO) {
    return nope("Bạn đang có một kỳ chưa chuyển khoản — thanh toán hoặc huỷ kỳ đó trước nhé.");
  }

  // Ảnh chụp giá lúc mua: bảng giá đổi thì đơn này không được đổi theo.
  const monthlyVnd = RETIRE_CARE_VND;
  const totalVnd = careTotalVnd(months, monthlyVnd);

  const order = await prisma.careOrder.create({
    data: {
      barnId: barn.id, userId, flockId: barn.flockId,
      months, monthlyVnd, totalVnd,
      payCode: newPayCode("CARE"),
    },
    select: { id: true, payCode: true },
  });

  await track("care_order_created", {
    userId, barnSlug, props: { orderId: order.id, months, totalVnd },
  });

  await notify({
    userId,
    kind: "PAYMENT",
    title: `🌾 Kỳ nuôi dưỡng ${khoiLabel(months)} — ${fmtVnd(totalVnd)}`,
    body: `${barn.label} · chuyển khoản với nội dung ${order.payCode} rồi bấm "Tôi đã chuyển khoản".`,
    href: `/chuong/${barnSlug}/nghi-huu`,
  });

  revalidateCare(barnSlug);
  return ok(`Đã tạo kỳ nuôi dưỡng ${khoiLabel(months)} — ${fmtVnd(totalVnd)}. Chuyển khoản xong bấm "Tôi đã chuyển khoản" giúp mình nhé.`);
}

/** Chủ chuồng bấm "Tôi đã chuyển khoản". Bấm lại là no-op. */
export async function reportCareTransfer(orderId: string): Promise<ActionResult> {
  const order = await prisma.careOrder.findUnique({
    where: { id: orderId },
    select: { id: true, paymentStatus: true, barn: { select: { slug: true } } },
  });
  if (!order) return nope("Không tìm thấy kỳ nuôi dưỡng này.");

  const gate = await chuongNghiHuu(order.barn.slug);
  if ("deny" in gate) return gate.deny;

  if (order.paymentStatus === "CONFIRMED") return nope("Kỳ này đã được xác nhận rồi.");
  if (order.paymentStatus === "REPORTED") return nope("Bạn đã báo chuyển khoản rồi — nông trại đang đối soát.");

  await prisma.careOrder.update({
    where: { id: order.id },
    data: { paymentStatus: "REPORTED", reportedAt: new Date() },
  });
  revalidateCare(order.barn.slug);
  return ok("Đã ghi nhận! Nông trại đối soát xong là kỳ nuôi dưỡng được tính thêm.");
}

/**
 * Huỷ một kỳ chưa thanh toán.
 *
 * Không có gì phải trả về kho như hoá đơn trang trí — kỳ chưa trả tiền thì chưa phủ ngày
 * nào (`coversFrom`/`coversTo` vẫn `null`), nên xoá là xoá sạch.
 */
export async function cancelCareOrder(orderId: string): Promise<ActionResult> {
  const order = await prisma.careOrder.findUnique({
    where: { id: orderId },
    select: { id: true, paymentStatus: true, barn: { select: { slug: true } } },
  });
  if (!order) return nope("Không tìm thấy kỳ nuôi dưỡng này.");

  const gate = await chuongNghiHuu(order.barn.slug);
  if ("deny" in gate) return gate.deny;
  if (order.paymentStatus === "CONFIRMED") {
    return nope("Kỳ này đã thanh toán — liên hệ nông trại nếu cần điều chỉnh.");
  }

  // Điều kiện "chưa CONFIRMED" nằm trong WHERE: webhook có thể xác nhận đúng lúc người
  // dùng bấm huỷ, và bên thua phải là bên huỷ — xoá mất một kỳ đã trả tiền thì không
  // dựng lại được từ đâu cả.
  const { count } = await prisma.careOrder.deleteMany({
    where: { id: order.id, paymentStatus: { not: "CONFIRMED" } },
  });
  revalidateCare(order.barn.slug);
  return count > 0
    ? ok("Đã huỷ kỳ nuôi dưỡng chưa thanh toán.")
    : nope("Kỳ này vừa được xác nhận đã thanh toán — không huỷ được nữa.");
}

/**
 * Nông trại bấm xác nhận đã nhận tiền ở /admin.
 * Cổng quyền ở đây; nghiệp vụ (cộng kỳ, đặt việc chụp ảnh) nằm trong `confirmCarePaid`
 * để dùng chung với webhook ngân hàng (§9.19).
 */
export async function confirmCarePayment(orderId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");
  return confirmCarePaid(orderId, "ADMIN");
}
