// HOÁ ĐƠN TIỀN NUÔI — phần tính toán thuần, dùng được cả hai phía.
//
// Không Prisma, không `node:*` (§1.2). Phần chạm DB nằm ở `lib/invoices.ts`.
//
// Bối cảnh: cho tới đợt này, sản phẩm thu **đúng 50.000đ tiền cọc** rồi thôi. Chuồng kích
// hoạt, nông trại nuôi thật, tốn thật — còn `Reservation.priceEstimateVnd` (tiền nuôi +
// công + thức ăn + gói "An tâm") nằm im như một con số ước tính không ai đòi. Đây là lỗ
// doanh thu lớn nhất của repo, và nó kín vì nó núp trong chữ "ước tính".
import { themThang } from "@/lib/care";

/**
 * Hoá đơn đầu phát hành **sau khi chuồng kích hoạt 1 ngày**.
 *
 * Không phát ngay lúc cọc về: khoảnh khắc đó người ta vừa nhận chuồng, đang đặt tên cho
 * mấy con gà. Dí hoá đơn vào đúng lúc ấy là đổi một niềm vui lấy một nghĩa vụ. Một ngày
 * đủ để họ xem chuồng, nhận tấm ảnh đầu, rồi mới nói chuyện tiền.
 */
export const INVOICE_DELAY_DAYS = 1;

/**
 * Từ lúc phát hành tới lúc chuồng bị khoá.
 *
 * 7 ngày, không phải 2–3: đây là chuyển khoản TAY, và người ta có thể đi công tác, có thể
 * đợi lương. Khoá một người chỉ vì họ bận ba ngày là mất một khách hàng thật để đổi lấy
 * một con số đúng lịch.
 */
export const INVOICE_GRACE_DAYS = 7;

/** Nhắc trước khi khoá — báo sau khi đã khoá là tin không làm gì được nữa (§9.28). */
export const INVOICE_NHAC_TRUOC_NGAY = 3;

/**
 * Gà đẻ trả **hằng tháng**, gà thịt trả **một lần cho cả lứa**.
 *
 * Không phải lựa chọn tuỳ hứng: bảng giá đã in `"/ tháng"` cho gà đẻ và `"/ lứa"` cho gà
 * thịt **từ đầu**, và người mua đã đọc đúng dòng đó. Gộp trọn 140 ngày gà đẻ vào một hoá
 * đơn ~970.000đ là nói khác với thứ họ đã đồng ý.
 */
export const laDinhKy = (productLine: string) => productLine === "LAYER";

/** Kỳ mà hoá đơn thứ `seq` phủ. `moc` = lúc chuồng kích hoạt (cọc được xác nhận). */
export function kyHoaDon(
  productLine: string,
  seq: number,
  moc: Date,
  cycleDays: number,
): { from: Date; to: Date } {
  if (!laDinhKy(productLine)) {
    // Gà thịt: đúng một hoá đơn, phủ trọn lứa.
    const to = new Date(moc);
    to.setDate(to.getDate() + Math.max(1, cycleDays));
    return { from: new Date(moc), to };
  }
  const from = themThang(moc, seq - 1);
  return { from, to: themThang(moc, seq) };
}

/** Lúc hoá đơn thứ `seq` được phát hành. */
export function phatHanhLuc(productLine: string, seq: number, moc: Date): Date {
  // Hoá đơn ĐẦU chậm một ngày so với lúc kích hoạt (xem `INVOICE_DELAY_DAYS`).
  if (seq <= 1) {
    const d = new Date(moc);
    d.setDate(d.getDate() + INVOICE_DELAY_DAYS);
    return d;
  }
  // Các tháng sau: phát hành ngay đầu kỳ — trả TRƯỚC cho tháng sắp nuôi, không đòi sau.
  return themThang(moc, seq - 1);
}

/**
 * Tới thời điểm `bayGio`, chuồng này **đáng lẽ phải có bao nhiêu hoá đơn**.
 *
 * Đây là hàm quyết định "có sinh thêm hoá đơn không". Trả 0 nghĩa là chưa tới lúc — và
 * chưa tới lúc thì tuyệt đối đừng tạo hàng: một hoá đơn phát sớm là một lời đòi tiền sai.
 */
export function soHoaDonCanCo(
  productLine: string,
  moc: Date | null | undefined,
  bayGio: Date = new Date(),
  { toiDa = 60 }: { toiDa?: number } = {},
): number {
  if (!moc) return 0; // chuồng chưa kích hoạt thì chưa nợ gì
  if (bayGio < phatHanhLuc(productLine, 1, moc)) return 0;
  if (!laDinhKy(productLine)) return 1;

  // Gà đẻ: thêm một hoá đơn mỗi khi qua một mốc tháng. Trần `toiDa` là chốt an toàn —
  // một `moc` sai (dữ liệu cũ, lệch múi giờ) không được đẻ ra hàng nghìn hoá đơn.
  let n = 1;
  while (n < toiDa && bayGio >= phatHanhLuc(productLine, n + 1, moc)) n++;
  return n;
}

/**
 * Số tiền phải chuyển của một hoá đơn.
 *
 * `creditVnd` là tiền cọc trừ vào — **chỉ hoá đơn đầu**. Chủ dự án chốt: cọc 50k đi vào
 * tiền hàng chứ không giữ riêng rồi hoàn lại, nên mọi câu chữ "cọc hoàn lại" trên app
 * phải sửa theo, nếu không là nói dối người trả tiền.
 *
 * Kẹp sàn 0: cọc lớn hơn giá kỳ (chuồng rẻ, hoặc cọc đổi sau này) thì hoá đơn về 0đ chứ
 * không ra số âm — số âm ở đây nghĩa là app đang đòi ngược tiền của chính mình.
 */
export const tienPhaiTra = (grossVnd: number, creditVnd: number) =>
  Math.max(0, Math.round(grossVnd) - Math.round(creditVnd));

/** Hạn chót của một hoá đơn phát hành lúc `luc`. */
export function hanChot(luc: Date): Date {
  const d = new Date(luc);
  d.setDate(d.getDate() + INVOICE_GRACE_DAYS);
  return d;
}

export type InvoiceTinhTrang = "chua-toi-han" | "sap-den-han" | "qua-han" | "da-tra";

export function invoiceTinhTrang(
  hd: { paymentStatus: string; dueAt: Date },
  bayGio: Date = new Date(),
): InvoiceTinhTrang {
  if (hd.paymentStatus === "CONFIRMED") return "da-tra";
  const conLai = Math.ceil((hd.dueAt.getTime() - bayGio.getTime()) / 86_400_000);
  if (conLai < 0) return "qua-han";
  return conLai <= INVOICE_NHAC_TRUOC_NGAY ? "sap-den-han" : "chua-toi-han";
}

/**
 * Tên gọi của một kỳ, hiện cho người trả tiền đọc.
 *
 * Gà đẻ phải nói rõ **"tháng thứ mấy"**: một người nhận hai hoá đơn giống hệt nhau cách
 * nhau 30 ngày sẽ tưởng bị tính trùng, và đó là một cuộc gọi khiếu nại đáng lẽ không cần có.
 */
export const hoaDonLabel = (productLine: string, seq: number) =>
  laDinhKy(productLine) ? `Tiền nuôi tháng ${seq}` : "Tiền nuôi trọn lứa";
