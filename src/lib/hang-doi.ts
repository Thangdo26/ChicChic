// HÀNG ĐỢI TIỀN - "ai đang chờ, và chờ bao lâu rồi".
//
// Không Prisma, không `node:*` (§1.2) → dùng được cả ở client.
//
// ⚠️ VÌ SAO FILE NÀY RA ĐỜI (Đợt 16). Nông trại nợ người dùng tiền theo **hai chiều**:
// `Refund` (nông trại trả lại người mua) và `Payout` (nông trại trả người bán). Cả hai
// đều **chi trả bằng tay**, cố ý (§9.29) - và cả hai đều **không có gì tự nhắc**:
// `lib/jobs.ts` trước đợt này nhắc tới `Refund` đúng **0 lần** và `Payout` đúng **0 lần**.
//
// Hậu quả không phải là một lỗi kỹ thuật mà là một cách im lặng:
//  · người trực quên một khoản ⟹ không màn hình nào đỏ lên, không chuông nào kêu;
//  · người đang chờ chỉ đọc được chữ *"đang chờ nông trại"* - không biết đã bao lâu,
//    không biết mình đứng thứ mấy, và không có ai để hỏi.
//
// Một người chờ tiền mà không biết mình đang chờ gì là người mất niềm tin nhanh nhất -
// nhanh hơn cả người bị từ chối. Nên luật của file này: **mọi khoản treo đều phải nói
// được nó đã treo bao lâu**, và quá một mốc thì phải tự gõ cửa người trực.
//
// Đây là em ruột của `DECOR_REPORTED_NUDGE_HOURS` và `MARKET_REPORTED_NUDGE_HOURS`: cùng
// một hình dạng (loại không bao giờ tự huỷ ⟹ ít nhất phải kêu lên), khác ở chỗ hai cái
// kia là tiền ĐANG TỚI, còn ở đây là tiền ĐANG ĐI.

/**
 * Yêu cầu hoàn tiền `REQUESTED` quá ngần này giờ mà chưa ai duyệt → nhắc quản trị.
 *
 * Ngắn hơn `NHAC_CHI_TRA_GIO` một nửa, cố ý: người xin hoàn tiền là người **đang thấy
 * mình bị thiệt** (hàng hỏng, chuồng trả lại). Họ chờ kém hơn hẳn người bán đang đợi
 * một khoản đã chắc chắn là của mình.
 */
export const NHAC_HOAN_GIO = 24;

/**
 * Khoản chi cho người bán đã **được yêu cầu rút** quá ngần này giờ mà chưa chuyển.
 *
 * Chỉ đếm từ `requestedAt`, KHÔNG từ lúc khoản sinh ra: `Payout` sinh ngay lúc giao
 * hàng xong, còn người bán có thể để đó vài tuần không rút. Đếm từ lúc sinh là gõ cửa
 * người trực về những khoản chưa ai đòi.
 */
export const NHAC_CHI_TRA_GIO = 48;

/** Đã chờ bao lâu, tính bằng mili giây. Mốc rỗng ⟹ `null` = "chưa bắt đầu chờ". */
export function daCho(tu: Date | string | null | undefined, now: number = Date.now()): number | null {
  if (!tu) return null;
  const t = new Date(tu).getTime();
  if (Number.isNaN(t)) return null;
  // Kẹp về 0: đồng hồ máy chủ lệch vài giây là chuyện thường, mà "đã chờ -3 giây" thì
  // không đọc được thành gì cả.
  return Math.max(0, now - t);
}

/**
 * "vừa gửi" · "3 giờ trước" · "2 ngày trước".
 *
 * Cố ý **thô hơn** `decor.timeAgo`: đây là chữ đứng cạnh một khoản tiền, và ở đó độ
 * chính xác tới phút không giúp gì mà chỉ làm dòng chữ dài ra. Thứ người đọc cần là
 * "lâu chưa", không phải "chính xác bao nhiêu".
 */
export function daChoVi(ms: number | null): string {
  if (ms === null) return "chưa gửi";
  const gio = Math.floor(ms / 3_600_000);
  if (gio < 1) return "vừa gửi";
  if (gio < 24) return `${gio} giờ trước`;
  return `${Math.floor(gio / 24)} ngày trước`;
}

/** Khoản này đã treo quá mốc phải gõ cửa chưa. Mốc rỗng ⟹ `false` (chưa ai đòi). */
export function quaHanXuLy(
  tu: Date | string | null | undefined,
  gioHan: number,
  now: number = Date.now(),
): boolean {
  const ms = daCho(tu, now);
  return ms !== null && ms >= gioHan * 3_600_000;
}

/**
 * Câu đứng cạnh một khoản người dùng đang chờ.
 *
 * ⚠️ **Không bao giờ hứa một ngày cụ thể.** Chi trả làm tay bởi một người thật (§9.29),
 * nên "sẽ xong trước thứ Sáu" là lời hứa hệ thống không giữ được - và một lời hứa hụt ở
 * đúng chỗ tiền bạc thì đắt hơn nhiều so với việc nói thật rằng chưa biết. Thứ hàm này
 * làm là khác hẳn: **thừa nhận thời gian đã trôi**. Người chờ 5 ngày cần đọc được rằng
 * hệ thống biết họ đã chờ 5 ngày.
 */
export function cauDangCho(ms: number | null, gioHan: number): string {
  if (ms === null) return "Chưa gửi yêu cầu.";
  const lau = ms >= gioHan * 3_600_000;
  return lau
    ? `Đã gửi ${daChoVi(ms)} - lâu hơn thường lệ. Nông trại đã được nhắc; nhắn cho nông trại nếu bạn cần gấp.`
    : `Đã gửi ${daChoVi(ms)}. Nông trại chuyển khoản tay kèm ảnh biên lai - thường trong vài ngày làm việc.`;
}
