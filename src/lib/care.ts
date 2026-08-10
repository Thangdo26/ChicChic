// NUÔI DƯỠNG ĐÀN NGHỈ HƯU - phần tính toán thuần, dùng được cả hai phía.
//
// Không Prisma, không `node:*` (§1.2): trang mua khối tháng là client component và cần
// đúng những con số này để hiện bảng giá.
//
// ⚠️ ĐỌC §9.32 TRƯỚC KHI THÊM GÌ VÀO FILE NÀY. Hết hạn nuôi dưỡng chỉ được sinh ra
// **lời nhắc gửi cho người**, không bao giờ sinh ra hậu quả lên con gà. Không có hàm nào
// ở đây trả về "được phép làm gì với đàn", và đó là chủ ý.
import { CARE_MONTH_BLOCKS, RETIRE_CARE_VND, type CareMonths } from "@/data/catalog";

export { CARE_MONTH_BLOCKS, type CareMonths };

/** Số tháng client gửi lên có nằm trong bảng không (§9.6 - không tin client). */
export function laKhoiHopLe(months: unknown): months is CareMonths {
  return (CARE_MONTH_BLOCKS as readonly number[]).includes(Number(months));
}

/**
 * Tiền của một khối. Tính lại ở server mỗi lần, **không nhận tổng từ client**.
 * `monthlyVnd` cho phép truyền giá đã chốt của đơn cũ vào để hiện lại cho đúng.
 */
export const careTotalVnd = (months: number, monthlyVnd = RETIRE_CARE_VND) =>
  Math.max(0, Math.round(months * monthlyVnd));

/** "3 tháng" / "1 năm" - 12 đọc thành năm cho tự nhiên. */
export const khoiLabel = (months: number) => (months === 12 ? "1 năm" : `${months} tháng`);

/**
 * Cộng tháng vào một mốc thời gian.
 *
 * Dùng `setMonth` của JS chứ không cộng 30 ngày: mua 6 tháng từ 31/1 thì phải ra 31/7,
 * không phải "180 ngày sau". Ngày 31 rơi vào tháng ngắn thì JS tự tràn sang đầu tháng
 * sau (31/1 + 1 tháng = 3/3) - chấp nhận được ở đây vì lệch tối đa vài ngày và luôn lệch
 * về phía **có lợi cho người trả tiền**.
 */
export function themThang(moc: Date, months: number): Date {
  const d = new Date(moc);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Đơn mới phủ từ lúc nào.
 *
 * Mua nối tiếp khi vẫn còn hạn thì phủ **từ lúc hạn cũ hết**, không phải từ hôm nay -
 * nếu không thì trả tiền sớm là mất phần chồng lấn. Hạn đã hết rồi thì phủ từ bây giờ:
 * quãng đứt ở giữa là quãng nông trại đã nuôi không công, và **không truy thu** (§9.32).
 */
export const phuTu = (hanHienTai: Date | null | undefined, bayGio = new Date()): Date =>
  hanHienTai && hanHienTai > bayGio ? new Date(hanHienTai) : new Date(bayGio);

/** Còn bao nhiêu ngày nữa hết hạn. Âm = đã quá hạn ngần ấy ngày. */
export const ngayConLai = (hanDen: Date | null | undefined, bayGio = new Date()): number | null =>
  hanDen ? Math.ceil((hanDen.getTime() - bayGio.getTime()) / 86_400_000) : null;

/** Sắp hết hạn thì nhắc TRƯỚC - báo sau khi đã hết là tin không làm gì được nữa. */
export const CARE_NHAC_TRUOC_NGAY = 14;

export type CareTinhTrang = "chua-mua" | "con-han" | "sap-het" | "het-han";

export function tinhTrang(hanDen: Date | null | undefined, bayGio = new Date()): CareTinhTrang {
  const n = ngayConLai(hanDen, bayGio);
  if (n === null) return "chua-mua";
  if (n < 0) return "het-han";
  return n <= CARE_NHAC_TRUOC_NGAY ? "sap-het" : "con-han";
}

/**
 * Câu hiện cho chủ chuồng.
 *
 * Cả bốn câu **cố ý không doạ**: không "gà sẽ bị…", không "nếu không đóng thì…". Nông
 * trại vẫn nuôi (§9.32), nên câu đúng là câu nói thật chuyện tiền và cảm ơn, không phải
 * câu tạo áp lực bằng con vật của người ta.
 */
export const CARE_TINH_TRANG_VI: Record<CareTinhTrang, string> = {
  "chua-mua": "Chưa có kỳ nuôi dưỡng nào được đóng",
  "con-han": "Đã đóng đủ",
  "sap-het": "Sắp tới kỳ đóng tiếp",
  "het-han": "Đã quá kỳ đóng - đàn vẫn được chăm bình thường",
};
