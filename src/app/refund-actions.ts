"use server";
// HOÀN TIỀN - thao tác của người dùng và của nông trại.
//
// Đọc `lib/refund.ts` (tính thuần) và `lib/refunds.ts` (chạm DB) trước.
//
// Hoàn tiền tiền nuôi KHÔNG có action riêng ở đây: nó sinh ra từ chính lúc chủ chuồng
// bấm **hoàn trả chuồng** (`auth-actions.returnBarn`), trong cùng transaction với phép
// gỡ quyền sở hữu. Cố ý gộp: tách ra thành hai nút là mở đường cho cảnh chuồng đã trả
// mà khoản nợ chưa được ghi - và bên chịu thiệt luôn là người vừa rời đi.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { cleanLine } from "@/lib/decor";
import { fmtVnd } from "@/lib/pricing";
import { lotSummary, type LotType } from "@/lib/harvest";
import { conXinHoanDuoc, MARKET_REFUND_DAYS, MAX_REFUND_REASON } from "@/lib/refund";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

// ---------------- Người mua báo hàng không đúng ----------------

/**
 * Người mua xin hoàn tiền một đơn chợ.
 *
 * Đây là **cái duy nhất người mua có** trong tay ở một chợ mà hàng không rời nông trại
 * và tiền đã chuyển đi trước. Không có nó thì câu quảng cáo *"nông trại đứng ra bảo
 * đảm"* - thứ biện minh cho phí 20% - chỉ là một dòng chữ.
 *
 * KHÔNG tự trả tiền, và cố ý không: người trực phải xem ảnh trao tay, hỏi nông dân, rồi
 * mới quyết. Một nút tự hoàn là một nút rút tiền của người bán mà người bán không được
 * nói gì.
 */
export async function requestMarketRefund(
  listingId: string,
  rawReason: string,
): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const reason = cleanLine(rawReason, MAX_REFUND_REASON);
  if (reason.length < 10) {
    return nope("Kể giúp mình hàng không đúng ở chỗ nào (ít nhất 10 ký tự) - nông trại cần đủ thông tin để xử lý.");
  }

  const l = await prisma.marketListing.findUnique({
    where: { id: String(listingId) },
    select: {
      id: true, status: true, priceVnd: true, buyerId: true, sellerId: true,
      paidAt: true, deliveredAt: true,
      lot: { select: { type: true, qty: true, weightKg: true, barn: { select: { id: true, label: true } } } },
    },
  });
  if (!l) return nope("Không tìm thấy đơn chợ này.");
  // §9.23: lọc theo NGƯỜI, không tin id client gửi lên.
  if (l.buyerId !== me.id) return nope("Đơn này không phải đơn bạn mua.");
  if (!conXinHoanDuoc(l)) {
    return nope(
      l.status === "PAID" || l.status === "DELIVERED"
        ? `Đã quá ${MARKET_REFUND_DAYS} ngày kể từ lúc giao - nhắn cho nông trại trong hộp thư chuồng giúp mình nhé.`
        : "Đơn này chưa tới bước thanh toán nên chưa có gì để hoàn.",
    );
  }

  const tomTat = lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg });

  // Chống trùng bằng `@@unique([kind, sourceId])` chứ không bằng "tìm rồi tạo": bấm hai
  // lần / hai tab là chuyện thường, và ở đây hậu quả là hai lần trả tiền cho một đơn.
  try {
    await prisma.refund.create({
      data: {
        userId: me.id,
        barnId: l.lot.barn.id,
        barnLabel: l.lot.barn.label,
        kind: "MARKET",
        sourceId: l.id,
        // Hoàn TRỌN giá, kể cả phần phí 20%. Nông trại giữ phí vì đã đứng ra bảo đảm;
        // lô hỏng nghĩa là chính việc bảo đảm đó không thành, nên giữ lại phí là thu
        // tiền cho một việc chưa làm được.
        amountVnd: l.priceVnd,
        reason,
      },
    });
  } catch {
    return nope("Bạn đã gửi yêu cầu cho đơn này rồi - nông trại đang xem lại.");
  }

  await track("refund_requested", {
    userId: me.id,
    props: { kind: "MARKET", listingId: l.id, amountVnd: l.priceVnd },
  });

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const a of admins) {
    await notify({
      userId: a.id,
      kind: "PAYMENT",
      title: `↩️ Xin hoàn tiền đơn chợ - ${fmtVnd(l.priceVnd)}`,
      body: `${tomTat} · ${reason.slice(0, 80)}`,
      href: "/admin#hoan-tien",
    });
  }

  revalidatePath("/cho/cua-toi");
  revalidatePath("/admin");
  return ok("Đã gửi cho nông trại. Người trực sẽ xem lại và trả lời bạn - thường trong ngày.");
}

// ---------------- Nông trại quyết ----------------

/**
 * Duyệt hoặc từ chối một khoản hoàn.
 *
 * Từ chối **bắt buộc có lý do**: một dòng "đã từ chối" trống không là cách nhanh nhất
 * biến một người khó chịu thành một người mất lòng tin. Duyệt thì không bắt, vì duyệt
 * đã là câu trả lời rồi.
 */
export async function decideRefund(
  refundId: string,
  dongY: boolean,
  rawNote: string,
): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const note = cleanLine(rawNote, MAX_REFUND_REASON);
  if (!dongY && note.length < 5) return nope("Từ chối thì phải ghi lý do - người ta sẽ đọc câu này.");

  const r = await prisma.refund.findUnique({
    where: { id: String(refundId) },
    select: { id: true, userId: true, amountVnd: true, kind: true, barnLabel: true },
  });
  if (!r) return nope("Không tìm thấy khoản hoàn này.");

  // So-sánh-rồi-đặt (§9.24): chỉ khoản còn REQUESTED mới đổi được, nên hai người trực
  // bấm cùng lúc thì đúng một bên thắng.
  const { count } = await prisma.refund.updateMany({
    where: { id: r.id, status: "REQUESTED" },
    data: {
      status: dongY ? "APPROVED" : "REJECTED",
      adminNote: note || null,
      decidedAt: new Date(),
    },
  });
  if (count === 0) return nope("Khoản này đã được xử lý trước đó rồi.");

  await notify({
    userId: r.userId,
    kind: "PAYMENT",
    title: dongY
      ? `✅ Nông trại đã duyệt hoàn ${fmtVnd(r.amountVnd)}`
      : "Nông trại chưa hoàn được khoản này",
    body: dongY
      ? "Tiền sẽ về tài khoản bạn đã điền. Nông trại chuyển tay nên có thể mất một hai ngày làm việc."
      : note,
    href: r.kind === "MARKET" ? "/cho/cua-toi" : "/tai-khoan",
  });

  revalidatePath("/admin");
  revalidatePath("/tai-khoan");
  revalidatePath("/cho/cua-toi");
  return ok(dongY ? `Đã duyệt - còn lại là chuyển khoản rồi bấm "đã chuyển".` : "Đã ghi từ chối và báo cho người dùng.");
}

/**
 * Người trực đã chuyển khoản xong → đóng sổ khoản này.
 *
 * `paidVnd` nhận riêng thay vì mặc định bằng `amountVnd`: người trực hay làm tròn lên
 * cho chẵn, hoặc cộng bù phí ngân hàng. Sổ phải nói **số thật đã rời tài khoản**, không
 * phải số app tính ra - nếu không thì đối soát cuối tháng lệch mà không ai biết lệch ở đâu.
 */
export async function markRefundPaid(
  refundId: string,
  rawPaidVnd: number,
  rawNote: string,
  rawProofUrl: string,
): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const paidVnd = Math.round(Number(rawPaidVnd));
  if (!Number.isFinite(paidVnd) || paidVnd <= 0) return nope("Số tiền đã chuyển phải là số dương.");

  const r = await prisma.refund.findUnique({
    where: { id: String(refundId) },
    select: { id: true, userId: true, amountVnd: true, kind: true, sourceId: true, status: true },
  });
  if (!r) return nope("Không tìm thấy khoản hoàn này.");
  if (paidVnd > r.amountVnd * 2) {
    // Chặn lỗi gõ thừa số 0, không phải chặn lòng hào phóng. Gấp đôi là cái trần rộng
    // rãi mà một lần gõ nhầm phím vẫn không lọt qua được.
    return nope(`Số này gấp hơn hai lần khoản đề xuất (${fmtVnd(r.amountVnd)}) - kiểm lại giúp mình.`);
  }

  const acc = await prisma.payoutAccount.findUnique({
    where: { userId: r.userId },
    select: { bankName: true, accountNo: true, holderName: true },
  });

  // Chỉ khoản ĐÃ DUYỆT mới đóng được: bỏ qua bước duyệt là bỏ luôn chỗ ghi lại
  // "vì sao nông trại đồng ý", thứ duy nhất còn lại khi có tranh cãi ba tháng sau.
  const { count } = await prisma.refund.updateMany({
    where: { id: r.id, status: "APPROVED" },
    data: {
      status: "PAID",
      paidVnd,
      paidAt: new Date(),
      adminNote: cleanLine(rawNote, MAX_REFUND_REASON) || undefined,
      proofUrl: cleanLine(rawProofUrl, 500) || undefined,
      bankSnapshot: acc ?? undefined,
    },
  });
  if (count === 0) {
    return nope(
      r.status === "PAID" ? "Khoản này đã đóng sổ rồi." : "Phải duyệt khoản này trước khi đánh dấu đã chuyển.",
    );
  }

  // Đơn chợ được hoàn thì tin đăng phải đóng lại - để nguyên `PAID` nghĩa là người mua
  // vừa được trả tiền mà đơn vẫn nằm chờ nông dân đi giao.
  //
  // ⚠️ CHỈ đóng khi lô **chưa trao tay**. Đã `DELIVERED` thì hàng đã đi rồi: đổi trạng
  // thái ngược lại là viết lại một sự thật ngoài đời (§9.2), và còn xoá mất chính tấm
  // ảnh trao tay đang là bằng chứng của cả hai bên.
  if (r.kind === "MARKET") {
    await prisma.$transaction(async (tx) => {
      const { count: huy } = await tx.marketListing.updateMany({
        where: { id: r.sourceId, status: "PAID" },
        data: { status: "CANCELLED" },
      });
      if (huy > 0) {
        const l = await tx.marketListing.findUnique({ where: { id: r.sourceId }, select: { lotId: true } });
        if (l) await tx.harvestLot.updateMany({ where: { id: l.lotId, status: "SOLD" }, data: { status: "AT_FARM" } });
      }
    }, { timeout: 20_000, maxWait: 10_000 });
  }

  await track("refund_paid", {
    userId: r.userId,
    props: { kind: r.kind, refundId: r.id, amountVnd: r.amountVnd, paidVnd },
  });

  await notify({
    userId: r.userId,
    kind: "PAYMENT",
    title: `💸 Nông trại đã chuyển trả ${fmtVnd(paidVnd)}`,
    body: acc
      ? `Về ${acc.bankName} ${acc.accountNo.slice(-4).padStart(acc.accountNo.length, "•")}. Ngân hàng thường mất vài phút.`
      : "Kiểm giúp mình tài khoản nhận tiền nhé.",
    href: r.kind === "MARKET" ? "/cho/cua-toi" : "/tai-khoan",
  });

  revalidatePath("/admin");
  revalidatePath("/tai-khoan");
  revalidatePath("/cho/cua-toi");
  revalidatePath("/cho");
  return ok(`Đã đóng sổ khoản hoàn ${fmtVnd(paidVnd)}.`);
}
