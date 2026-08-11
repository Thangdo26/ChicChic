// GIAO HÀNG - vùng giao, phí một chuyến, và phép cộng ra số phải chuyển.
//
// Không import Prisma → dùng được cả ở client (luật §1.2). Phần chạm DB nằm ở
// `harvest-actions` (địa chỉ), `market-actions` (giỏ hàng) và `admin-actions` (khai vùng).
//
// ⚠️ VÌ SAO PHÍ GẮN VÀO *MỘT CHUYẾN*, KHÔNG PHẢI MỘT LÔ:
// mọi lô trên chợ này đều **đang nằm ở nông trại** - đó là tiền đề của cả tính năng
// ("hàng không rời nông trại", §9.29). Nên mua 1 lô hay 5 lô cùng lúc thì vẫn là **một
// chuyến xe tới một địa chỉ**, và tính phí năm lần là thu tiền cho thứ không xảy ra.
// Đây chính là lý do giỏ hàng và phí giao phải ra đời cùng nhau, không tách được.

/** Một vùng nông trại nhận chở tới. `feeVnd = 0` là freeship. */
export type VungGiao = { id: string; name: string; feeVnd: number };

/** Địa chỉ đủ dùng để quyết định - cố ý không nhận cả hàng `Address`. */
export type DiaChiGon = { line: string; zoneId: string | null } | null;

/** Trần phí một chuyến. Gõ nhầm thêm một số 0 thì sửa được, thêm bốn thì khó tin. */
export const MAX_SHIP_VND = 2_000_000;

/**
 * Vì sao một người CHƯA đặt hàng được. `null` = không vướng gì.
 *
 * Trả về **lý do**, không phải `false`: chỗ gọi cần nói cho người dùng biết phải làm gì
 * tiếp, và ba lý do dưới đây dẫn tới ba câu khác hẳn nhau.
 */
export type VuongMac = "chua-co-dia-chi" | "chua-chon-vung" | "vung-ngung-giao";

export function vuongMacGiaoHang(diaChi: DiaChiGon, vung: VungGiao | null | undefined): VuongMac | null {
  if (!diaChi) return "chua-co-dia-chi";
  // Địa chỉ có từ trước Đợt 13 không mang vùng. Không tự đoán vùng từ chuỗi `line` -
  // đoán sai ở đây là thu nhầm tiền, hoặc hứa giao tới nơi không ai đi tới.
  if (!diaChi.zoneId) return "chua-chon-vung";
  if (!vung) return "vung-ngung-giao";
  return null;
}

export const VUONG_MAC_VI: Record<VuongMac, string> = {
  "chua-co-dia-chi": "Điền địa chỉ nhận hàng trước rồi mới đặt được nhé.",
  "chua-chon-vung": "Địa chỉ của bạn chưa chọn khu vực giao - mở ô địa chỉ chọn lại giúp mình nhé.",
  "vung-ngung-giao": "Nông trại đang tạm ngừng giao tới khu vực của bạn - liên hệ nông trại nhé.",
};

/**
 * Phí một chuyến tới vùng này.
 *
 * Kẹp về 0 khi âm và về trần khi quá lớn: cột `feeVnd` do người trực gõ tay ở `/admin`,
 * và số tiền người mua phải trả thì không được phụ thuộc vào một lần gõ nhầm.
 */
export function phiGiao(vung: VungGiao | null | undefined): number {
  if (!vung) return 0;
  return Math.min(MAX_SHIP_VND, Math.max(0, Math.round(vung.feeVnd)));
}

export const laFreeship = (vung: VungGiao | null | undefined) => phiGiao(vung) === 0;

/** Số tiền một đơn: tiền hàng + đúng MỘT phí chuyến. */
export type TienDon = { goodsVnd: number; shipVnd: number; totalVnd: number };

/**
 * Cộng tiền một đơn.
 *
 * `totalVnd` LUÔN là tổng, không tính riêng - cùng luật với `Money.netVnd` ở
 * `lib/market.ts`. Ở đây là phép cộng số nguyên nên không có rủi ro làm tròn, nhưng để
 * hai chỗ tự cộng lấy là mở đường cho hai con số khác nhau trên cùng một màn hình.
 *
 * Giỏ rỗng thì **không tính phí giao**: không có chuyến xe nào cả, và một cái giỏ trống
 * hiện "phí giao 30.000đ" là con số vô nghĩa đầu tiên người dùng nhìn thấy.
 */
export function tienDon(giaTungLo: readonly number[], vung: VungGiao | null | undefined): TienDon {
  const goodsVnd = giaTungLo.reduce((s, v) => s + Math.max(0, Math.round(v)), 0);
  const shipVnd = giaTungLo.length === 0 ? 0 : phiGiao(vung);
  return { goodsVnd, shipVnd, totalVnd: goodsVnd + shipVnd };
}

/** Câu ngắn hiện cạnh dòng phí. */
export function nhanPhiGiao(vung: VungGiao | null | undefined): string {
  if (!vung) return "chưa chọn khu vực";
  return laFreeship(vung) ? `${vung.name} · miễn phí giao` : vung.name;
}
