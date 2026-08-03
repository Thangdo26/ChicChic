import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { parsePayCode } from "@/lib/decor";
import { confirmReservationPaid, confirmDecorPaid, resolvePayCode } from "@/lib/payments";
import type { BankTxnStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WEBHOOK NGÂN HÀNG (SePay) — tiền về tài khoản thì tự kích hoạt chuồng / mở khoá trang trí,
 * không phải chờ admin ngồi đối soát tay.
 *
 * ĐÂY LÀ ENDPOINT CÔNG KHAI TRÊN INTERNET và nó mở khoá hàng trả tiền. Ba lớp bảo vệ:
 *
 * 1. **Khoá API.** Không đặt `SEPAY_WEBHOOK_KEY` thì endpoint ĐÓNG (503), không phải mở
 *    tự do — cùng nếp với `ADMIN_PASSWORD` ở middleware.ts. Quên đặt biến trên Vercel là
 *    lỗi cấu hình, không được biến thành cửa cho ai cũng tự xác nhận thanh toán.
 * 2. **Chống trùng.** `BankTxn.providerId` là unique và được ghi TRƯỚC khi xử lý. SePay
 *    gửi lại tối đa 7 lần khi server lỗi; không có chốt này thì một lần hụt hơi = cộng
 *    tiền hai lần.
 * 3. **Không đoán.** Bóc được mã, tìm đúng MỘT đơn, và tiền về đủ — thiếu bất kỳ điều nào
 *    thì chỉ ghi vào sổ cho admin xử lý, tuyệt đối không tự xác nhận.
 *
 * Vì sao luôn trả 200 sau khi đã ghi được vào sổ: tới lúc đó giao dịch đã nằm trong
 * `BankTxn`, gửi lại cũng không đổi gì. Retry chỉ có ích cho hỏng hóc TRƯỚC đó (mạng,
 * cold start, DB nghẽn) — và đúng những lần đó thì hàm này trả 5xx để SePay thử lại.
 */
export async function POST(req: Request) {
  const expected = process.env.SEPAY_WEBHOOK_KEY;
  if (!expected) {
    console.error("[sepay] chưa đặt SEPAY_WEBHOOK_KEY — endpoint đang đóng");
    return NextResponse.json({ success: false, message: "webhook chưa được cấu hình" }, { status: 503 });
  }
  if (!apiKeyOk(req.headers.get("authorization"), expected)) {
    return NextResponse.json({ success: false, message: "unauthorized" }, { status: 401 });
  }

  let body: SePayPayload;
  try {
    body = (await req.json()) as SePayPayload;
  } catch {
    return NextResponse.json({ success: false, message: "payload không phải JSON" }, { status: 400 });
  }

  const providerId = String(body?.id ?? "").trim();
  if (!providerId) {
    return NextResponse.json({ success: false, message: "thiếu id giao dịch" }, { status: 400 });
  }

  const amountVnd = Math.round(Number(body?.transferAmount ?? 0));
  // Tiền ra không liên quan tới đơn nào. Trả 200 để SePay đừng gửi lại.
  if (String(body?.transferType ?? "in") !== "in" || amountVnd <= 0) {
    return NextResponse.json({ success: true, message: "bỏ qua: không phải tiền vào" });
  }

  // Nội dung chuyển khoản nằm ở đâu tuỳ ngân hàng: SePay bóc sẵn vào `code` khi khớp
  // cấu trúc đã cấu hình, còn không thì mã nằm lẫn trong `content`/`description`.
  const content = [body?.code, body?.content, body?.description]
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .join(" ")
    .slice(0, 2000);

  const parsed = parsePayCode(content);

  // Ghi vào sổ TRƯỚC — đây là chốt chống trùng. Trùng thì dừng ngay tại đây.
  let txnId: string;
  try {
    const row = await prisma.bankTxn.create({
      data: {
        providerId,
        gateway: String(body?.gateway ?? "?").slice(0, 100),
        accountNumber: body?.accountNumber ? String(body.accountNumber).slice(0, 50) : null,
        amountVnd,
        content,
        code: parsed?.code ?? null,
        status: "UNMATCHED",
        raw: body as object,
      },
      select: { id: true },
    });
    txnId = row.id;
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ success: true, message: "giao dịch đã được ghi nhận trước đó" });
    }
    // Chưa ghi được gì cả → để SePay gửi lại.
    console.error("[sepay] không ghi được BankTxn", e);
    return NextResponse.json({ success: false, message: "lỗi máy chủ" }, { status: 500 });
  }

  // Từ đây trở đi mọi kết cục đều được ghi lại vào sổ và trả 200.
  let status: BankTxnStatus = "UNMATCHED";
  let note: string | null = null;
  let matchedId: string | null = null;

  try {
    if (!parsed) {
      note = "Không bóc được mã thanh toán trong nội dung chuyển khoản.";
    } else {
      const found = await resolvePayCode(parsed.kind, parsed.code);
      if ("error" in found) {
        note = found.error;
      } else if (found.alreadyPaid) {
        status = "DUPLICATE";
        matchedId = found.id;
        note = "Đơn này đã được xác nhận trước đó — kiểm tra xem có phải chuyển thừa không.";
      } else if (amountVnd < found.expectedVnd) {
        status = "MISMATCH";
        matchedId = found.id;
        note = `Tiền về ${amountVnd.toLocaleString("vi-VN")}đ, đơn cần ${found.expectedVnd.toLocaleString("vi-VN")}đ — thiếu, chưa xác nhận.`;
      } else {
        const res =
          found.kind === "COC"
            ? await confirmReservationPaid(found.id, "WEBHOOK")
            : await confirmDecorPaid(found.id, "WEBHOOK");
        matchedId = found.id;
        status = res.ok ? "MATCHED" : "UNMATCHED";
        note = res.ok
          ? amountVnd > found.expectedVnd
            ? `Khách chuyển thừa ${(amountVnd - found.expectedVnd).toLocaleString("vi-VN")}đ.`
            : null
          : res.message;
      }
    }
  } catch (e) {
    console.error("[sepay] lỗi khi đối soát", e);
    note = `Lỗi khi đối soát: ${e instanceof Error ? e.message : String(e)}`;
  }

  await prisma.bankTxn.update({
    where: { id: txnId },
    data: { status, note, matchedId, matchedKind: parsed?.kind ?? null },
  });

  return NextResponse.json({ success: true, status });
}

// ---------------- Phụ trợ ----------------

type SePayPayload = {
  id?: number | string;
  gateway?: string;
  accountNumber?: string;
  code?: string | null;
  content?: string;
  description?: string;
  transferType?: string;
  transferAmount?: number;
};

/**
 * SePay gửi khoá dạng `Authorization: Apikey <KEY>`.
 * So sánh theo thời gian hằng để không rò rỉ độ dài khớp qua thời gian phản hồi.
 */
function apiKeyOk(header: string | null, expected: string): boolean {
  const m = String(header ?? "").match(/^Apikey\s+(.+)$/i);
  if (!m) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** P2002 = vi phạm ràng buộc unique của Prisma (ở đây là providerId đã tồn tại). */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}
