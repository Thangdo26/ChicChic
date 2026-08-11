// CHỢ NÔNG TRẠI - giá niêm yết và phép chia tiền.
//
// Chợ này KHÔNG phải chỗ rao vặt. Hàng không rời nông trại: người bán không nhận được
// lô của mình (bận, đi xa) thì chuyển QUYỀN NHẬN cho người khác, nông trại giao thẳng
// cho người mua. Nhờ vậy không có khoảng trống an toàn thực phẩm khi chuyển tay, và
// truy xuất không đứt - lô vẫn gắn chuồng, vẫn có ảnh nông dân chụp.
//
// Giá do NÔNG TRẠI niêm yết, người bán không tự đặt. Điều đó xoá rủi ro đầu cơ, nhưng
// tạo ra một mức giá đầu ra công khai - nên `BASE_PRICES` (giá nhận nuôi) phải được
// đặt sao cho **thực nhận sau phí ≈ chi phí nuôi**. Xem chú thích ở `data/catalog.ts`.
//
// File này KHÔNG import Prisma → an toàn cho client bundle (luật import §1.2).
import type { LotType } from "@/lib/harvest";

/** Phần trăm nông trại giữ lại: bảo quản + đóng gói + giao tận tay + đứng ra bảo đảm. */
export const MARKET_FEE_PERCENT = 20;

/**
 * Trần số lô một người được bán trong 30 ngày.
 *
 * Đây là hàng rào chống biến sản phẩm thành kênh kinh doanh: chợ là chỗ **thoát hàng
 * khi bận**, không phải kênh bán buôn. Bỏ trần này ra thì người ta nhận 15 chuồng rồi
 * bán lại toàn bộ sản lượng - lúc đó ChicChic không còn là dịch vụ nuôi hộ nữa.
 */
export const MAX_LISTINGS_PER_MONTH = 2;

/**
 * Người mua bấm mua mà không chuyển tiền thì giữ chỗ bao lâu.
 *
 * Hết hạn này, người khác bấm mua là ĐOẠT được - kiểm ngay trong `WHERE` của câu lệnh
 * đặt chỗ, nên không cần job nền nào (repo chưa có job nào, §11.10).
 */
export const RESERVE_HOLD_MINUTES = 24 * 60;

/** Số tiền một lô, chia làm ba phần. `net` LUÔN là hiệu, không tính riêng. */
export type Money = { priceVnd: number; feePercent: number; feeVnd: number; netVnd: number };

/**
 * Tính tiền cho một lô từ giá niêm yết.
 *
 * @param unitVnd EGG: đồng/quả · MEAT: đồng/kg
 * @param lot     `qty` cho trứng, `weightKg` cho gà thịt
 *
 * ⚠️ `netVnd` phải là `priceVnd − feeVnd`, KHÔNG phải `Math.round(priceVnd * 0.8)`:
 * hai phép làm tròn độc lập lệch nhau 1đ ở một số giá trị, và khi đó
 * `feeVnd + netVnd !== priceVnd` - sổ tiền không cân, và không ai biết mất đồng nào.
 */
export function lotMoney(
  unitVnd: number,
  lot: { type: LotType; qty: number; weightKg?: number | null },
  feePercent: number = MARKET_FEE_PERCENT,
): Money {
  const raw = lot.type === "EGG" ? unitVnd * lot.qty : unitVnd * (lot.weightKg ?? 0);
  // Làm tròn về đồng: ngân hàng không chuyển được số lẻ, và mã QR mang số nguyên.
  const priceVnd = Math.round(raw);
  const feeVnd = Math.round((priceVnd * feePercent) / 100);
  return { priceVnd, feePercent, feeVnd, netVnd: priceVnd - feeVnd };
}

export type PriceRow = { type: string; breedSlug: string | null; unitVnd: number; effectiveFrom: Date };

/**
 * Giá đang áp dụng cho một (loại, giống).
 *
 * Khớp GIỐNG trước, không có thì rơi về dòng `breedSlug = null`. Trứng chỉ cần một
 * dòng null (giá như nhau mọi giống); gà thịt mỗi giống một dòng.
 *
 * Chỉ xét dòng đã tới hiệu lực - cho phép nông trại đặt giá trước cho ngày mai.
 */
export function priceFor(
  rows: PriceRow[],
  type: LotType,
  breedSlug: string | null | undefined,
): number | null {
  const now = Date.now();
  const live = rows
    .filter((r) => r.type === type && new Date(r.effectiveFrom).getTime() <= now)
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());

  const exact = breedSlug ? live.find((r) => r.breedSlug === breedSlug) : undefined;
  const fallback = live.find((r) => r.breedSlug === null);
  const row = exact ?? fallback;
  return row ? row.unitVnd : null;
}

/** Trạng thái một ĐƠN chợ, chữ cho người mua đọc (§11.45). */
export const MARKET_ORDER_VI: Record<string, string> = {
  OPEN: "Giỏ đang mở",
  RESERVED: "Chờ bạn chuyển khoản",
  PAID: "Đã thanh toán · chờ nông dân giao",
  DELIVERED: "Đã giao",
  CANCELLED: "Đã huỷ",
};

export const LISTING_STATUS_VI: Record<string, string> = {
  LISTED: "Đang rao",
  RESERVED: "Có người đặt · chờ chuyển khoản",
  PAID: "Đã thanh toán · chờ nông dân giao",
  DELIVERED: "Đã giao",
  CANCELLED: "Đã huỷ",
};

export const PAYOUT_STATUS_VI: Record<string, string> = {
  PENDING: "Chờ nông trại chuyển",
  PAID: "Đã chuyển",
  FAILED: "Chuyển lỗi",
};
