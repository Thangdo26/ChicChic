// HÀNG RÀO TẦN SUẤT - phần thuần (§11.50).
//
// KHÔNG import Prisma, KHÔNG import `next/headers`. `lib/nhip.ts` mới là nơi đọc/ghi DB.
// Cùng cặp với messages.ts ↔ messages-meta.ts, notify.ts ↔ notify-meta.ts.
//
// Vì sao có file này: tới Đợt 16 repo có **đúng một** hàng rào tần suất - `sendingBlocked`
// của hộp thư - và nó chỉ đếm được vì mỗi tin nhắn tự nó là một dòng trong DB. Ba cửa còn
// lại **tiêu tiền thật của nông trại mỗi lần bị gọi** mà không đếm gì cả:
//
//  · `sendRegisterCode` / `sendResetCode` → mỗi lượt là một email Resend;
//  · `traCuuChuTaiKhoan`                  → mỗi lượt là một lượt gọi VietQR có tính phí;
//  · `login`                              → không tốn tiền, nhưng để trần thì mật khẩu
//                                           của người dùng là thứ dò được không giới hạn.
//
// Không cái nào có dòng nào trong DB để mà đếm ⟹ phải có một chỗ đếm riêng.

/** Một ngưỡng: `soLan` lượt trong cửa sổ `phut` phút. */
export type NguongNhip = { soLan: number; phut: number };

/**
 * Năm ngăn đếm. Tên ngăn đi thẳng vào cột `RateLimit.bucket` nên **đừng đổi chữ** - đổi là
 * mọi bộ đếm đang chạy bị bỏ lại và hàng rào mở toang đúng một cửa sổ.
 *
 * Con số chọn theo nguyên tắc: **rộng rãi với người thật, chật với máy**. Một người đăng ký
 * cần 1-2 lượt gửi mã, bấm "gửi lại" vài lần nữa là cùng; một con script thì muốn hàng
 * nghìn. Khoảng giữa đó rộng, nên không cần chỉnh chi li - chỉ cần đừng chặn nhầm cả một
 * văn phòng đi chung một địa chỉ mạng.
 */
export const NHIP = {
  /** Gửi mã OTP, theo địa chỉ mạng. Đây là ngăn CHÍNH: `email` là thứ người gọi tự bịa ra
   *  vô hạn, nên khoá theo email thôi thì không khoá được gì. */
  "gui-ma-ip": { soLan: 10, phut: 60 },
  /** Gửi mã OTP, theo email. Chồng lên `OTP_RESEND_COOLDOWN_MS`: cooldown lo chuyện bấm
   *  hai lần liền tay, ngăn này lo chuyện dội bom một hộp thư suốt buổi. */
  "gui-ma-email": { soLan: 5, phut: 60 },
  /** Đăng nhập, theo địa chỉ mạng. Rộng: cả nhà / cả văn phòng chung một IP. */
  "dang-nhap-ip": { soLan: 30, phut: 15 },
  /** Đăng nhập, theo tên đăng nhập hoặc email - đây là ngăn chống dò mật khẩu thật sự.
   *  Người gõ nhầm cần chừng 5 lần; 10 là đã nới tay. */
  "dang-nhap-ten": { soLan: 10, phut: 15 },
  /** Tra tên chủ tài khoản (VietQR), theo tài khoản đã đăng nhập. Người bán lưu số tài
   *  khoản của mình một lần, thử lại vài lần là cùng. */
  "tra-ten": { soLan: 20, phut: 60 },
  /** Gõ lại mật khẩu ở cổng ChicChic Gia đình, theo tài khoản đang đăng nhập. Đây là cửa
   *  thứ hai trước ba việc đụng dữ liệu trẻ, nên nó cũng là một chỗ dò mật khẩu - khác là
   *  kẻ dò đã ngồi sẵn trong một phiên hợp lệ (máy mượn, máy chung). Chật hơn `dang-nhap-ten`
   *  vì người thật ở đây chỉ gõ đúng một lần. */
  "xac-minh-lai": { soLan: 8, phut: 15 },
  /** Tạo hồ sơ trẻ, theo tài khoản cha mẹ. Một nhà có mấy đứa con; 10 lượt/giờ là rộng rãi
   *  với người thật và chật với một vòng lặp đang bơm bảng dữ liệu trẻ em. */
  "ho-so-tre": { soLan: 10, phut: 60 },
  /** Nút "tìm khoảnh khắc mới" của cha mẹ, theo tài khoản. Đây là hành động **đắt** - quét
   *  bảng sự kiện rồi ghi nhiều dòng - mà bấm thì không tốn gì. Người thật bấm một lần rồi
   *  thôi, vì việc nền ban đêm đã làm sẵn phần lớn. */
  "dong-bo-bai-hoc": { soLan: 12, phut: 60 },
  /** Bé gửi mong muốn cho bố mẹ, theo tài khoản cha mẹ đang mở phiên. Rộng tay: ngón tay
   *  trẻ con bấm nhiều, và bị chặn ở đây là một câu từ chối rơi vào mắt một đứa trẻ. Trần
   *  thật của tính năng nằm ở chỗ khác - hàng chờ mỗi bé và **số việc thật mỗi tuần cho
   *  nông dân** (`TRAN_CARE_WISH_TUAN`), cả hai đếm bằng dòng trong DB chứ không bằng ngăn
   *  này. Ngăn này chỉ để một vòng lặp không bơm được nghìn dòng vào bảng. */
  "mong-muon-cua-be": { soLan: 30, phut: 60 },
} as const satisfies Record<string, NguongNhip>;

export type TenNhip = keyof typeof NHIP;

/**
 * Đã vượt ngưỡng chưa.
 *
 * `soDem` là số lượt **tính cả lượt đang xét** (bộ đếm tăng trước rồi mới hỏi), nên phép so
 * là `>` chứ không phải `>=`: đặt ngưỡng 10 thì lượt thứ 10 phải đi lọt, lượt thứ 11 mới bị
 * chặn. Lệch một ở đây nghĩa là quảng cáo "10 lần" mà thực tế cho 9.
 */
export function vuotNguong(ten: TenNhip, soDem: number): boolean {
  return soDem > NHIP[ten].soLan;
}

/** Còn bao lâu nữa thì cửa sổ đếm mở lại (ms). Cửa sổ cố định: hết giờ là bộ đếm về 0. */
export function conLaiNhip(ten: TenNhip, mocCuaSo: Date | null | undefined, now = Date.now()): number {
  if (!(mocCuaSo instanceof Date) || Number.isNaN(mocCuaSo.getTime())) return 0;
  return Math.max(0, mocCuaSo.getTime() + NHIP[ten].phut * 60_000 - now);
}

/**
 * Câu nói cho người bị chặn.
 *
 * Ở đây **được phép** nói một con số cụ thể (khác hẳn `lib/hang-doi.ts`, nơi cấm hứa ngày):
 * cửa sổ đếm là phép cộng của máy, không phải lời hứa về việc một người sẽ làm gì. Nói
 * "chờ khoảng 12 phút" là nói đúng thứ mình biết chắc.
 *
 * Câu này **không được lộ** ngưỡng là bao nhiêu, và với đăng nhập thì không được lộ tài
 * khoản có tồn tại hay không - nên nó là một câu duy nhất cho mọi ngăn.
 */
export function cauChoDoi(conLaiMs: number): string {
  const phut = Math.max(1, Math.ceil(conLaiMs / 60_000));
  return `Bạn thử hơi nhiều lần rồi - nghỉ khoảng ${phut} phút nữa rồi làm lại nhé.`;
}

/**
 * Lấy địa chỉ mạng của người gọi từ các header.
 *
 * ⚠️ **THỨ TỰ Ở ĐÂY LÀ CẢ HÀNG RÀO.** `x-forwarded-for` là header **người gọi tự đặt
 * được**: Vercel nối thêm chứ không xoá đi, nên phần tử đầu tiên của nó có thể do chính
 * kẻ đang bắn viết ra. Khoá theo nó là dựng một hàng rào mà ai cũng bước qua bằng cách
 * đổi một dòng header - tệ hơn không có hàng rào, vì nó làm mình tưởng là đã có.
 *
 * Hai header đầu do **nền tảng đặt** (Vercel), người gọi không chèn được:
 *  1. `x-vercel-forwarded-for`
 *  2. `x-real-ip`
 *  3. `x-forwarded-for` - chỉ là lối lùi cho chỗ chạy không phải Vercel, và **tin được ít
 *     hơn hẳn**. Ai đem repo này đi nơi khác thì phải xem lại đúng dòng này.
 *
 * Trả `null` khi không biết - xem `lib/nhip.ts` để biết vì sao `null` **không** được gộp
 * thành một khoá chung.
 */
export function ipTuHeader(h: {
  vercel?: string | null;
  real?: string | null;
  forwarded?: string | null;
}): string | null {
  for (const raw of [h.vercel, h.real, h.forwarded]) {
    // Chuỗi có thể là "client, proxy1, proxy2" - lấy phần tử đầu.
    const dau = (raw ?? "").split(",")[0]?.trim() ?? "";
    if (dau) return dau.slice(0, 64);
  }
  return null;
}
