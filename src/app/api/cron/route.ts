import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDailyJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bốn việc, mỗi việc vài lượt đi–về DB. Mặc định 10 giây là quá sát khi nông trại có
// nhiều chuồng; 60 giây là trần của gói Hobby trên Vercel.
export const maxDuration = 60;

/**
 * VIỆC NỀN THEO NGÀY — cửa vào duy nhất của `lib/jobs.ts`.
 *
 * Vercel Cron gọi endpoint này theo lịch trong `vercel.json`, kèm sẵn header
 * `Authorization: Bearer $CRON_SECRET` (Vercel tự gắn khi dự án có biến `CRON_SECRET`).
 *
 * ĐÂY LÀ ENDPOINT CÔNG KHAI TRÊN INTERNET và nó đổi trạng thái đàn, rút tin đăng, huỷ
 * hoá đơn. Nên cùng luật fail-closed với webhook ngân hàng (§9.20): **chưa đặt
 * `CRON_SECRET` thì đóng (503), không phải mở tự do.** Quên đặt biến trên Vercel là lỗi
 * cấu hình — không được biến thành cửa cho ai cũng bấm huỷ hoá đơn của người khác.
 *
 * Trả 500 khi có việc hỏng để lần chạy hiện ĐỎ trong tab Cron Jobs của Vercel: một job
 * âm thầm hỏng vài tuần thì tới lúc phát hiện đã có cả trăm lô sai trạng thái. Ba việc
 * còn lại vẫn chạy xong — xem `runDailyJobs`.
 *
 * Gọi tay để thử (dev hoặc production):
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron
 * Chạy lại nhiều lần là an toàn: mọi việc đều so-sánh-rồi-đặt, lần thứ hai không tìm
 * thấy gì để làm.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cron] chưa đặt CRON_SECRET — endpoint đang đóng");
    return NextResponse.json({ ok: false, message: "cron chưa được cấu hình" }, { status: 503 });
  }
  if (!bearerOk(req.headers.get("authorization"), expected)) {
    return NextResponse.json({ ok: false, message: "unauthorized" }, { status: 401 });
  }

  const report = await runDailyJobs();
  console.log("[cron] xong", JSON.stringify(report));
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}

/** So khoá kiểu chống dò theo thời gian — cùng cách với webhook SePay. */
function bearerOk(header: string | null, expected: string): boolean {
  const got = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // `timingSafeEqual` ném lỗi khi hai bên khác độ dài — độ dài không phải bí mật.
  return a.length === b.length && timingSafeEqual(a, b);
}
