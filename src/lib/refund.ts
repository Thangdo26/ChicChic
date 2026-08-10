// HOÀN TIỀN - phần tính toán thuần, dùng được cả hai phía.
//
// Không Prisma, không `node:*` (§1.2). Phần chạm DB nằm ở `app/refund-actions.ts`.
//
// Vì sao file này tồn tại: cho tới đợt này, MỌI khoảng trống về tiền trong repo đều lệch
// về phía nông trại - và đúng một cái lệch về phía khách. Người ta trả tiền nuôi trọn
// tháng, hôm sau bấm "hoàn trả chuồng", thì tiền ở lại nông trại và không có một dòng
// nào trong sổ nói rằng nông trại đang nợ họ. Tệ hơn: ô xác nhận hoàn trả **hứa thẳng**
// *"cọc đối soát hoàn lại"*, còn câu trả về sau khi bấm thì nói *"cọc sẽ được đối soát và
// hoàn lại theo chính sách"* - trong khi không có chính sách nào, không có đường nào, và
// tiền cọc theo thiết kế đã chốt thì **không** hoàn (nó đi vào tiền hàng kỳ đầu). Hai câu
// đó là lời hứa rỗng đặt đúng chỗ nhạy cảm nhất (§9.11).

/** Một kỳ đã trả tiền: từ ngày nào tới ngày nào, và người ta đã chuyển bao nhiêu. */
export type KyDaTra = { from: Date; to: Date; daTraVnd: number };

export type PhanHoan = {
  /** Số ngày kỳ này phủ. 0 nghĩa là dữ liệu kỳ hỏng - không hoàn gì cả. */
  tongNgay: number;
  /** Số ngày người ta đã trả tiền mà KHÔNG dùng tới. */
  ngayChuaDung: number;
  hoanVnd: number;
};

const NGAY = 86_400_000;

/** Số ngày từ `a` tới `b`, làm tròn LÊN, không bao giờ âm. */
const soNgay = (a: Date, b: Date) => Math.max(0, Math.ceil((b.getTime() - a.getTime()) / NGAY));

/**
 * Phần tiền phải trả lại của MỘT kỳ đã trả, tính tới thời điểm `moc` (lúc người ta dừng).
 *
 * Ba trường hợp cùng đi qua một công thức, và đó là lý do không tách hàm:
 *   · kỳ đã dùng hết  (`to <= moc`)   → 0 ngày chưa dùng → hoàn 0đ
 *   · kỳ đang dùng dở (`from < moc < to`) → hoàn phần ngày còn lại
 *   · kỳ chưa bắt đầu (`moc <= from`) → hoàn nguyên kỳ
 *
 * ⚠️ **Làm tròn LÊN, cố ý.** `Math.ceil` ở đây thiệt cho nông trại tối đa 1đ mỗi kỳ, và
 * đổi lại là một luật dễ nói thành lời: *khi phép chia không tròn, phần lẻ về phía người
 * đang được trả lại tiền*. Mọi chỗ khác trong repo làm tròn theo hướng có lợi cho nông
 * trại vì đó là tiền nông trại thu; ở đây tiền đi ngược chiều nên hướng làm tròn cũng
 * phải đi ngược theo. Chặn trên bằng `daTraVnd` để không bao giờ trả nhiều hơn đã nhận.
 *
 * ⚠️ Ngày đang dở được tính là **chưa dùng**. Người dừng lúc 8 giờ sáng đã được nông dân
 * cho ăn bữa đó rồi, nên về lý nông trại được giữ ngày đó - nhưng cãi nhau nửa ngày công
 * với người vừa quyết định rời đi là thứ không đáng, cả về tiền lẫn về cách chia tay.
 */
export function hoanTheoTiLe(ky: KyDaTra, moc: Date = new Date()): PhanHoan {
  const tongNgay = soNgay(ky.from, ky.to);
  if (tongNgay <= 0 || ky.daTraVnd <= 0) {
    return { tongNgay: Math.max(0, tongNgay), ngayChuaDung: 0, hoanVnd: 0 };
  }
  // Kỳ chưa tới thì `moc` nằm trước `from`; kẹp về `from` để không đếm quá số ngày kỳ có.
  const batDauTinh = moc < ky.from ? ky.from : moc;
  const ngayChuaDung = Math.min(tongNgay, soNgay(batDauTinh, ky.to));
  const hoanVnd = Math.min(ky.daTraVnd, Math.ceil((ky.daTraVnd * ngayChuaDung) / tongNgay));
  return { tongNgay, ngayChuaDung, hoanVnd };
}

/** Cộng phần hoàn của nhiều kỳ. Tiện cho chỗ hiện "bạn sẽ được trả lại bao nhiêu". */
export const tongHoan = (phan: readonly PhanHoan[]) => phan.reduce((s, p) => s + p.hoanVnd, 0);

// ---------------- Đơn chợ ----------------

/**
 * Người mua có bao nhiêu ngày để nói "hàng không đúng".
 *
 * 3 ngày, không phải 7: đây là trứng và thịt gà. Quá ba ngày thì thứ đang tranh cãi đã
 * không còn ở tình trạng ban đầu, và không ai - kể cả người mua thật thà - chứng minh
 * được điều gì nữa. Nói rõ con số ra màn hình còn hơn để nó thành một cuộc thương lượng
 * không có luật.
 */
export const MARKET_REFUND_DAYS = 3;

export const MAX_REFUND_REASON = 300;

/**
 * Đơn chợ này còn xin hoàn được không, tính từ mốc muộn nhất đang có.
 *
 * `PAID` mà chưa giao thì mốc là lúc trả tiền: **cửa sổ vẫn chạy**, vì lô không tới cũng
 * là một cách hỏng - và đó lại là trường hợp sạch nhất để hoàn (tiền còn nằm trong ký
 * quỹ, người bán chưa được chi đồng nào).
 */
export function conXinHoanDuoc(
  l: { status: string; paidAt: Date | null; deliveredAt: Date | null },
  bayGio: Date = new Date(),
): boolean {
  if (l.status !== "PAID" && l.status !== "DELIVERED") return false;
  const moc = l.deliveredAt ?? l.paidAt;
  if (!moc) return false;
  return bayGio.getTime() - moc.getTime() <= MARKET_REFUND_DAYS * NGAY;
}

// ---------------- Chữ hiện ra màn hình ----------------

export type RefundKind = "INVOICE" | "CARE" | "MARKET";
export type RefundStatus = "REQUESTED" | "APPROVED" | "PAID" | "REJECTED";

export const REFUND_KIND_VI: Record<RefundKind, string> = {
  INVOICE: "Tiền nuôi chưa dùng hết",
  CARE: "Tiền nuôi dưỡng chưa dùng hết",
  MARKET: "Đơn chợ",
};

/**
 * Bốn câu này người dùng đọc, nên chúng nói **nông trại đang ở bước nào**, không nói
 * tên trạng thái trong máy. "REQUESTED" với người ngoài là chữ vô nghĩa; "nông trại đã
 * ghi nhận" thì trả lời đúng câu họ đang hỏi.
 */
export const REFUND_STATUS_VI: Record<RefundStatus, string> = {
  REQUESTED: "Nông trại đã ghi nhận, đang xem lại",
  APPROVED: "Đã duyệt - đang xếp lịch chuyển khoản",
  PAID: "Đã chuyển trả",
  REJECTED: "Không hoàn - xem lý do bên dưới",
};

export const REFUND_STATUS_MAU: Record<RefundStatus, string> = {
  REQUESTED: "var(--yolk-deep)",
  APPROVED: "var(--yolk-deep)",
  PAID: "var(--paddy-deep)",
  REJECTED: "#B4472F",
};
