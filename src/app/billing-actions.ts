"use server";
// HOÁ ĐƠN TIỀN NUÔI — thao tác của chủ chuồng và của nông trại.
//
// Xem `lib/billing.ts` (tính toán thuần) và `lib/invoices.ts` (chạm DB) trước.
//
// ⚠️ §9.33 — "khoá chuồng" ở đây **chỉ khoá trong app**: không xem được trang chuồng,
// không giao việc, không mua trang trí. Đàn gà vẫn được nông dân cho ăn và chăm bình
// thường, và cổng nông dân **không** bị đụng tới. Đừng bao giờ nối trạng thái khoá vào
// bất cứ thứ gì chạm `Flock`/`Bird`, và đừng chặn việc của nông dân bằng nó.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { track } from "@/lib/track";
import { confirmInvoicePaid } from "@/lib/payments";
import { billingCuaChuong, ensureInvoices } from "@/lib/invoices";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/**
 * Sinh hoá đơn còn thiếu cho một chuồng — **gọi lúc chủ chuồng mở trang**.
 *
 * VÌ SAO KHÔNG GHI THẲNG TRONG LÚC RENDER: Server Component không được có tác dụng phụ
 * (bot và prefetch cũng kích hoạt, `revalidatePath` không gọi được trong render, và React
 * có thể render hai lần). Nên trang chỉ ĐỌC, còn phép ghi đi qua một action do client gọi
 * sau khi trang đã hiện — cùng nếp với `usePayWatch`.
 *
 * Việc nền hằng ngày cũng gọi `ensureInvoices`, nên người không bao giờ mở app vẫn có hoá
 * đơn. Hai đường cùng ghi được là lý do phải chống trùng bằng `@@unique([barnId, seq])`
 * chứ không bằng "đếm rồi tạo".
 */
export async function ensureBarnInvoices(barnSlug: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập.");

  const b = await billingCuaChuong(barnSlug);
  if (!b) return nope("Không tìm thấy chuồng này.");
  if (b.ownerId !== me.id && me.role !== "ADMIN") {
    return nope("Chuồng này không thuộc tài khoản của bạn.");
  }

  const them = await ensureInvoices(b);
  if (them > 0) {
    await track("invoice_issued", { userId: me.id, barnSlug, props: { count: them } });
    revalidatePath(`/chuong/${barnSlug}`);
    revalidatePath("/tai-khoan");
  }
  return ok(them > 0 ? `Đã phát hành ${them} hoá đơn.` : "Không có hoá đơn mới.");
}

/** Chủ chuồng bấm "Tôi đã chuyển khoản". Bấm lại là no-op. */
export async function reportInvoiceTransfer(invoiceId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập.");

  const hd = await prisma.barnInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, paymentStatus: true, userId: true, barn: { select: { slug: true } } },
  });
  if (!hd) return nope("Không tìm thấy hoá đơn này.");
  if (hd.userId !== me.id && me.role !== "ADMIN") {
    return nope("Hoá đơn này không thuộc tài khoản của bạn.");
  }
  if (hd.paymentStatus === "CONFIRMED") return nope("Hoá đơn này đã được xác nhận rồi.");
  if (hd.paymentStatus === "REPORTED") return nope("Bạn đã báo chuyển khoản rồi — nông trại đang đối soát.");

  await prisma.barnInvoice.update({
    where: { id: hd.id },
    data: { paymentStatus: "REPORTED", reportedAt: new Date() },
  });
  revalidatePath(`/chuong/${hd.barn.slug}`);
  revalidatePath("/admin");
  return ok("Đã ghi nhận! Nông trại đối soát xong là chuồng chạy tiếp bình thường.");
}

/**
 * Nông trại bấm xác nhận đã nhận tiền ở /admin.
 * Cổng quyền ở đây; nghiệp vụ nằm trong `confirmInvoicePaid` để dùng chung với webhook (§9.19).
 */
export async function confirmInvoicePayment(invoiceId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");
  return confirmInvoicePaid(invoiceId, "ADMIN");
}

/**
 * Nông trại gia hạn thêm cho một hoá đơn — mở khoá chuồng mà **không** cần tiền về trước.
 *
 * Vì sao cần: người thật có hoàn cảnh thật (đi viện, mất việc, chuyển khoản lỗi ngân
 * hàng). Không có nút này thì cách duy nhất để giúp họ là đi sửa DB bằng tay, và cái đó
 * thì không ai ghi lại được. Một nút có ghi log tốt hơn một lệnh SQL không ai thấy.
 */
export async function extendInvoiceDue(invoiceId: string, days: number): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 1 || n > 90) return nope("Chỉ gia hạn được 1–90 ngày.");

  const hd = await prisma.barnInvoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, dueAt: true, paymentStatus: true, barn: { select: { slug: true } } },
  });
  if (!hd) return nope("Không tìm thấy hoá đơn này.");
  if (hd.paymentStatus === "CONFIRMED") return nope("Hoá đơn này đã thanh toán rồi.");

  // Gia hạn từ HÔM NAY, không phải từ hạn cũ: hoá đơn quá hạn hai tháng mà cộng 7 ngày
  // vào hạn cũ thì vẫn quá hạn, tức bấm nút xong chuồng vẫn khoá.
  const moi = new Date();
  moi.setDate(moi.getDate() + n);
  await prisma.barnInvoice.update({ where: { id: hd.id }, data: { dueAt: moi } });

  revalidatePath(`/chuong/${hd.barn.slug}`);
  revalidatePath("/admin");
  return ok(`Đã gia hạn tới ${moi.toLocaleDateString("vi-VN")} — chuồng mở lại ngay.`);
}
