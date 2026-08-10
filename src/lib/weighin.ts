// SỔ LỚN của đàn gà thịt - logic thuần, không đụng Prisma (§1.2).
//
// Vấn đề nó giải: một lứa gà thịt nuôi ~75 ngày, và trong suốt 75 ngày đó app không
// nói được câu nào **cụ thể** về đàn. Chủ chuồng gà đẻ ngày nào cũng có quả trứng để
// nhìn; chủ chuồng gà thịt mở app ra thấy đúng một thanh tiến độ nhích một vạch - không
// có gì để mong, không có gì kể với ai. Cân nặng là con số **đổi mỗi tuần và đổi theo
// hướng tốt lên**, đúng thứ đang thiếu.
//
// ⚠️ Luật của cả file này: **không bịa một con số nào.** Không nội suy tuần bị bỏ lỡ,
// không "dự đoán tuần tới", không vẽ đường cong chuẩn để so. Một đường cong đẹp mà bịa
// thì đúng bằng lời hứa của kẻ đi lừa - và sản phẩm này bán chính cái sự không-bịa đó
// (§9.11). Chỉ có gì cân được thì hiện nấy, thiếu tuần nào thì để trống tuần ấy.

/** Cân mẫu bao nhiêu con là đủ để con số có nghĩa. Dưới mức này thì nói rõ là ít. */
export const WEIGH_MAU_TOI_THIEU = 3;

/** Trần vệ sinh cho ô nhập: gà thịt thương phẩm không con nào tới 10kg. */
export const WEIGH_GAM_MIN = 30;
export const WEIGH_GAM_MAX = 10_000;

/**
 * Tuần thứ mấy của lứa, tính từ ngày bắt đầu. Tuần đầu là **1**, không phải 0 -
 * cô chú và chủ chuồng đều đếm "tuần thứ nhất", không ai nói "tuần thứ không".
 */
export function tuanThu(startDate: Date | string, at: Date | string = new Date()): number {
  const d0 = new Date(startDate).getTime();
  const d1 = new Date(at).getTime();
  const ngay = Math.floor((d1 - d0) / 86_400_000);
  return Math.max(1, Math.floor(ngay / 7) + 1);
}

/** Ép số cân người dùng gõ về khoảng hợp lệ (§9.6 - client gõ gì cũng phải chặn ở server). */
export function clampGram(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < WEIGH_GAM_MIN || n > WEIGH_GAM_MAX) return null;
  return n;
}

export function clampSample(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(50, n);
}

/**
 * Gam → chữ người đọc.
 *
 * Dưới 1kg thì hiện gam (gà con tuần đầu ~150g, viết "0,2kg" là mất hết ý nghĩa);
 * từ 1kg trở lên thì hiện kg một chữ số thập phân.
 */
export function canLabel(gram: number): string {
  if (gram < 1000) return `${Math.round(gram)}g`;
  return `${(gram / 1000).toFixed(1).replace(".", ",")}kg`;
}

export type WeighPoint = { weekNo: number; avgGram: number; sample: number };

/**
 * Tăng bao nhiêu gam so với lần cân **liền trước trong danh sách**.
 *
 * Trả `null` cho điểm đầu tiên - không có gì để so. Cố ý **không** so với ngày bắt đầu
 * lứa bằng một con số giả định: không ai cân đàn lúc mới thả, nên mọi số ở đó là bịa.
 */
export function tangSoVoiTruoc(points: WeighPoint[], i: number): number | null {
  if (i <= 0 || i >= points.length) return null;
  return points[i].avgGram - points[i - 1].avgGram;
}

/**
 * Có nên nhắc cân tuần này không.
 *
 * `tuanDaCan` là các tuần đã có số. Trả tuần cần cân, hoặc `null` nếu tuần này đã cân
 * rồi. **Không đòi bù các tuần đã trôi qua**: quá khứ thì không cân lại được, và một
 * danh sách việc tồn đọng dài dằng dặc chỉ làm cô chú tắt thông báo (§9.8).
 */
export function tuanCanCan(
  startDate: Date | string,
  tuanDaCan: readonly number[],
  bayGio: Date = new Date(),
): number | null {
  const t = tuanThu(startDate, bayGio);
  return tuanDaCan.includes(t) ? null : t;
}

/** Câu mô tả độ tin cậy của một lần cân. Nói thẳng khi mẫu ít, đừng để người đọc tự đoán. */
export function mauLabel(sample: number): string {
  if (sample <= 1) return "cân 1 con";
  return sample < WEIGH_MAU_TOI_THIEU ? `cân ${sample} con (mẫu ít)` : `cân ${sample} con`;
}
