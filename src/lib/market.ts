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
 * Người mua giữ chỗ được bao lâu, tính TỪ LÚC BỎ VÀO GIỎ tới lúc báo đã chuyển khoản.
 *
 * ⚠️ **Một khoảng duy nhất cho cả hai bước**, không phải 3 giờ gom giỏ rồi thêm 3 giờ
 * nữa để trả tiền: mốc đếm là `MarketListing.reservedAt` (đặt lúc vào giỏ) và `chotGio`
 * **không** đụng vào nó. Đếm lại từ lúc chốt là mở đường gia hạn vô hạn - bỏ ra, bỏ vào,
 * chốt lại, và lô nằm ngoài chợ mãi mãi.
 *
 * Vì sao 3 giờ chứ không phải 24: bỏ vào giỏ là **rút lô khỏi chợ thật** - người khác
 * nhìn thấy nó ở dạng "đang có người giữ" và không mua được. Giữ một ngày cho một lô
 * trứng còn hạn 7 ngày là lấy mất của người bán một phần bảy cơ hội bán, chỉ vì ai đó
 * bấm nhầm rồi đóng tab.
 *
 * Ba đường nhả, cố ý chồng nhau vì không đường nào đủ một mình:
 *  1. **Lười** - `themVaoGio` nhả ngay trong `WHERE`, nhưng chỉ khi có NGƯỜI KHÁC bấm mua;
 *  2. **Việc nền** - `jobs.releaseStaleHolds` nhả cả đơn, kể cả khi không ai vào chợ;
 *  3. **Lúc hiển thị** - `trangThaiRao` coi chỗ giữ quá hạn là "còn mua được", nên màn
 *     hình đúng ngay cả khi hai đường trên chưa chạy (gói Vercel Hobby chỉ chạy cron
 *     1 lần/ngày - xem §11.30).
 */
export const RESERVE_HOLD_MINUTES = 3 * 60;

/**
 * Đơn `REPORTED` (đã bấm "Tôi đã chuyển khoản") quá ngần này giờ mà chưa ai đối soát
 * → việc nền nhắc quản trị.
 *
 * Loại này CỐ Ý không bao giờ tự huỷ (§9.34) - cùng luật với hoá đơn trang trí - nên nó
 * giữ lô vô hạn nếu người trực quên. Không tự huỷ được thì ít nhất phải kêu lên.
 */
export const MARKET_REPORTED_NUDGE_HOURS = 24;

/** Hạn giữ chỗ của một lô đã vào giỏ. `null` = chưa có mốc (lô đang rao). */
export function hanGiuCho(reservedAt: Date | string | null | undefined): Date | null {
  if (!reservedAt) return null;
  return new Date(new Date(reservedAt).getTime() + RESERVE_HOLD_MINUTES * 60_000);
}

/**
 * Một lô trên chợ, dưới mắt MỘT người xem cụ thể.
 *
 * ⚠️ Đây là hàm quyết định thứ người dùng nhìn thấy VÀ bấm được, nên nó là hàm thuần và
 * có bảng kiểm riêng. Trước Đợt 15 câu truy vấn của `/cho` **giấu hẳn** lô người khác
 * đang giữ: người bán thấy lô mình biến mất khỏi chợ mà không hiểu vì sao, người mua
 * quay lại tưởng đã bán hết. Nay lô vẫn đứng đó, có nhãn, và **hết hạn giữ là mua được
 * ngay** - không chờ việc nền nào cả.
 */
export type TrangThaiRao =
  /** Ai cũng bỏ vào giỏ được (chưa ai giữ, hoặc chỗ giữ đã quá hạn). */
  | "dang-rao"
  /** Đang nằm trong giỏ của CHÍNH người xem - bỏ ra được. */
  | "trong-gio"
  /** Người xem đã chốt đơn này rồi, đang chờ chính họ chuyển khoản - không bỏ ra được. */
  | "cho-toi-tra"
  /** Người KHÁC đang giữ chỗ và còn hạn. */
  | "nguoi-khac-giu";

export type LoTrenCho = {
  status: string;
  buyerId: string | null;
  reservedAt: Date | string | null;
  /** Trạng thái ĐƠN gom lô này. `null` = chưa vào giỏ nào, hoặc tin đăng trước Đợt 13. */
  orderStatus: string | null;
};

export function trangThaiRao(
  l: LoTrenCho,
  meId: string,
  now: number = Date.now(),
): { trang: TrangThaiRao; conLaiMs: number } {
  if (l.status !== "RESERVED") return { trang: "dang-rao", conLaiMs: 0 };

  const han = hanGiuCho(l.reservedAt);
  const conLaiMs = han ? Math.max(0, han.getTime() - now) : 0;
  const cuaToi = !!l.buyerId && l.buyerId === meId;

  // ⚠️ Đơn ĐÃ CHỐT / ĐÃ BÁO CHUYỂN của chính tôi thì KHÔNG bao giờ hiện là "hết hạn, mua
  // lại đi" dù đồng hồ đã chạy hết: tiền của họ có thể đang trên đường, và câu "lô này
  // đang rao" ở đúng lúc đó là câu tệ nhất màn hình có thể nói.
  if (cuaToi && (l.orderStatus === "RESERVED" || l.orderStatus === "REPORTED")) {
    return { trang: "cho-toi-tra", conLaiMs };
  }
  // Người khác đã bấm "tôi đã chuyển khoản" ⟹ không ai đoạt được nữa, kể cả khi quá hạn.
  if (!cuaToi && l.orderStatus === "REPORTED") return { trang: "nguoi-khac-giu", conLaiMs };

  if (conLaiMs === 0) return { trang: "dang-rao", conLaiMs: 0 };
  return { trang: cuaToi ? "trong-gio" : "nguoi-khac-giu", conLaiMs };
}

/**
 * Còn bao lâu nữa thì ĐƠN này mất chỗ giữ. `null` = không lô nào có mốc.
 *
 * ⚠️ Lấy `min`, không phải `max` và cũng không phải lô đầu danh sách: mỗi lô mang mốc
 * `reservedAt` riêng (lúc chính nó vào giỏ), nên lô vào sớm nhất là lô rơi trước. Hiện
 * hạn dài nhất là hứa một khoảng thời gian mà lô đầu tiên đã không còn nằm trong đó.
 */
export function conLaiCuaDon(
  lo: readonly { reservedAt: Date | string | null }[],
  now: number = Date.now(),
): number | null {
  const moc = lo.map((l) => hanGiuCho(l.reservedAt)).filter((h): h is Date => !!h);
  if (moc.length === 0) return null;
  return Math.max(0, Math.min(...moc.map((h) => h.getTime())) - now);
}

/** "còn 2 giờ 14 phút" - chữ cạnh nhãn giữ chỗ. Cắt ở phút, không đếm giây. */
export function conLaiVi(ms: number): string {
  const phut = Math.max(0, Math.floor(ms / 60_000));
  if (phut === 0) return "sắp hết hạn";
  const gio = Math.floor(phut / 60);
  const le = phut % 60;
  if (gio === 0) return `còn ${le} phút`;
  return le === 0 ? `còn ${gio} giờ` : `còn ${gio} giờ ${le} phút`;
}

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
  REPORTED: "Bạn đã báo chuyển · nông trại đang đối soát",
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
