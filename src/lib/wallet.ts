// VÍ CỦA NGƯỜI BÁN — logic thuần, không đụng Prisma (§1.2).
//
// Vấn đề nó giải: người bán trên chợ **không có chỗ nào nhìn thấy tiền của mình**. Có
// `Payout` trong DB, có một dòng trạng thái nhỏ dưới từng tin đăng, nhưng không có con
// số nào trả lời câu hỏi duy nhất họ hỏi — *"tôi đang có bao nhiêu, bao giờ nhận được?"*.
// Và họ cũng không có cách nào **lên tiếng**: không nút nào để nói "cho tôi xin tiền",
// chỉ ngồi chờ nông trại nhớ ra.
//
// ═══ HAI BẤT BIẾN CHI PHỐI CẢ FILE NÀY — đọc trước khi đổi một dòng ═══
//
// **§9.29 (ký quỹ).** Tiền người mua chuyển về tài khoản nông trại KHÔNG lập tức thành
// tiền rút được: nó nằm ký quỹ cho tới khi lô được **giao tận tay và có ảnh trao tay**.
// Đó là toàn bộ lý do phí 20% tồn tại, và nó bảo vệ chính người bán ở vai người mua.
// Ví này **hiện khoản ký quỹ ra** thay vì giấu — biết tiền đang nằm đâu và vì sao thì
// khác hẳn với không nhìn thấy gì.
//
// **§9.29 (chống-đa-cấp).** *"Không bao giờ hiện tổng thu tích luỹ của một người ở bất
// kỳ đâu."* Vì vậy ở đây **cố ý KHÔNG có** `daNhanVnd`, không "tổng đã kiếm", không
// biểu đồ thu nhập theo tháng — dù cả ba đều dễ tính từ đúng bảng dữ liệu này và đều
// là thứ người dùng sẽ thích. Một con số "bạn đã kiếm được 4.200.000đ" là cái bảng
// điều khiển mà mọi app đa cấp đều có, và cả sản phẩm này được dựng để không phải là
// thứ đó. Lịch sử từng khoản vẫn xem được — theo TỪNG DÒNG, ở `/cho/cua-toi`; một danh
// sách giao dịch là sổ sách, một con số cộng dồn là lời mời gọi.

export type ViState = {
  /** Người mua đã trả, lô CHƯA giao. Tiền có thật nhưng chưa rút được (§9.29). */
  dangKyQuyVnd: number;
  /** Lô đã giao, `Payout` đang chờ nông trại chuyển. Đây là tiền RÚT ĐƯỢC. */
  rutDuocVnd: number;
  /** Đã bấm yêu cầu rút, nông trại chưa chuyển xong. Tập con của `rutDuocVnd`. */
  daYeuCauVnd: number;
  /** Số khoản đang chờ nông trại xử lý vì chuyển lỗi. Hiện ra để không ai mất tiền trong im lặng. */
  loiSo: number;
};

export type PayoutLite = {
  amountVnd: number;
  status: string;
  requestedAt: Date | string | null;
};

/** Tin đăng đã trả tiền nhưng chưa giao — phần đang ký quỹ. */
export type KyQuyLite = { netVnd: number; status: string };

export function tinhVi(payouts: readonly PayoutLite[], kyQuy: readonly KyQuyLite[]): ViState {
  const v: ViState = { dangKyQuyVnd: 0, rutDuocVnd: 0, daYeuCauVnd: 0, loiSo: 0 };

  for (const p of payouts) {
    if (p.status === "PENDING") {
      v.rutDuocVnd += p.amountVnd;
      if (p.requestedAt) v.daYeuCauVnd += p.amountVnd;
    } else if (p.status === "FAILED") {
      // Đếm chứ KHÔNG cộng tiền: một khoản chuyển lỗi không phải tiền đã nhận, mà cộng
      // vào "rút được" thì người ta bấm rút mãi không ra. Nó cần một người thật xử lý.
      v.loiSo += 1;
    }
    // `PAID` cố ý không cộng vào đâu cả — xem chú thích chống-đa-cấp ở đầu file.
  }

  // `PAID` ở đây là trạng thái của TIN ĐĂNG (người mua đã chuyển tiền), không phải của
  // `Payout`. Lô đã giao thì đã có `Payout` rồi, nên không có khoản nào bị đếm hai lần.
  for (const l of kyQuy) if (l.status === "PAID") v.dangKyQuyVnd += l.netVnd;

  return v;
}

/**
 * Còn gì để bấm rút không.
 *
 * Đã yêu cầu hết rồi thì trả `false` — nút phải chuyển thành dòng chữ "đang chờ nông
 * trại chuyển", chứ không phải một cái nút bấm được lần thứ hai mà không làm gì thêm.
 */
export const rutDuoc = (v: ViState) => v.rutDuocVnd - v.daYeuCauVnd > 0;
