// Sổ thu hoạch — hằng số và cách nói dùng chung cho cả hai phía.
// KHÔNG import Prisma → an toàn cho client bundle (luật import §1.2).

export type LotType = "EGG" | "MEAT";
export type StorageMode = "CHILLED" | "FROZEN";
export type LotStatus = "AT_FARM" | "LISTED" | "SOLD" | "CLAIMED" | "DELIVERED" | "EXPIRED";

/**
 * Nhãn trạng thái lô cho chủ lô đọc.
 *
 * `DELIVERED` cố ý KHÔNG nói "đã giao cho người mua": cùng một giá trị enum dùng cho
 * cả lô bán trên chợ lẫn lô chính chủ nhận về, nên câu chữ phải đúng cho cả hai.
 */
export const LOT_STATUS_VI: Record<LotStatus, string> = {
  AT_FARM: "Nông trại đang giữ hộ",
  LISTED: "Đang rao trên chợ",
  SOLD: "Đã bán · chờ nông dân giao",
  CLAIMED: "Đang trên đường về nhà bạn",
  DELIVERED: "Đã trao tay",
  EXPIRED: "Hết hạn giữ hộ",
};

/** Địa chỉ giao đã CHỤP LẠI vào lô lúc xin nhận — xem `HarvestLot.deliverTo`. */
export type DeliverTo = { fullName: string; phone: string; line: string; note?: string | null };

/** Một dòng địa chỉ để nông dân đọc trên điện thoại. */
export function deliverLine(d: DeliverTo | null | undefined): string {
  if (!d) return "(chưa có địa chỉ)";
  return [d.fullName, d.phone, d.line, d.note].filter(Boolean).join(" · ");
}

/**
 * Nông trại giữ hộ một lô trong bao nhiêu ngày.
 *
 * Đếm từ lúc THU (nhặt trứng / mổ gà), **không** phải từ lúc đăng bán: đếm từ lúc
 * đăng thì người ta giữ lô 5 ngày rồi đăng thêm 7 ngày nữa, thành ra nông trại phải
 * giữ 12 ngày — trái đúng cái vừa hứa với họ.
 */
export const LOT_KEEP_DAYS = 7;

/**
 * Còn ngần này ngày là hết hạn giữ hộ → việc nền nhắc chủ lô một lần.
 *
 * Nhắc TRƯỚC chứ không phải báo SAU: "lô của bạn đã hết hạn" là một tin không làm gì
 * được nữa, còn "lô còn 2 ngày" thì người ta kịp đăng bán hoặc kịp lấy về.
 */
export const LOT_EXPIRY_WARN_DAYS = 2;

/** Hạn nông trại giữ hộ. Suy ra, KHÔNG lưu cột — lưu thì sớm muộn lệch với `collectedAt`. */
export const keepUntil = (collectedAt: Date | string) =>
  new Date(new Date(collectedAt).getTime() + LOT_KEEP_DAYS * 86_400_000);

/** Còn mấy ngày nữa hết hạn giữ hộ. Âm = đã quá hạn. */
export function daysLeft(collectedAt: Date | string): number {
  const ms = keepUntil(collectedAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export const isExpired = (collectedAt: Date | string) => daysLeft(collectedAt) <= 0;

/**
 * Câu hiện cho người xem. Nói bằng số ngày còn lại chứ không bằng một ngày tháng khô
 * khan — người mua cần biết mình đang nhận hàng còn mấy ngày, không cần làm phép trừ.
 */
export function keepLabel(collectedAt: Date | string): string {
  const d = daysLeft(collectedAt);
  if (d <= 0) return "Đã quá hạn nông trại giữ hộ";
  if (d === 1) return "Nông trại giữ hộ nốt hôm nay";
  return `Nông trại giữ hộ thêm ${d} ngày`;
}

// ---------------- Mã truy xuất công khai ----------------

/**
 * Bảng chữ của mã truy xuất — bỏ `0 O 1 I L` cho khỏi nhìn nhầm, cùng lý do với mã
 * chuyển khoản. Mã này người ta có thể phải GÕ TAY khi camera không quét được.
 */
const TRACE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/**
 * 10 ký tự trên bảng 31 ⟹ ~49 bit. Đây là một CHÌA KHOÁ (ai có đường dẫn thì xem
 * được), nên nó phải không đoán được; nhưng cũng đừng dài hơn mức cần — mã QR càng
 * nhiều ký tự thì càng nhiều ô, in ra càng nhỏ và càng khó quét.
 */
const TRACE_CODE_LEN = 10;

/** Sinh mã truy xuất cho một lô mới. Dùng `crypto.getRandomValues`, không dùng `Math.random`. */
export function newTraceCode(): string {
  const buf = new Uint8Array(TRACE_CODE_LEN);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += TRACE_ALPHABET[b % TRACE_ALPHABET.length];
  return s;
}

/** Ép mã người dùng gõ/dán về dạng chuẩn trước khi tra DB. */
export const normalizeTraceCode = (raw: string | null | undefined) =>
  String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, TRACE_CODE_LEN);

/** Đơn vị đếm của từng loại lô. */
export const unitOf = (type: LotType) => (type === "EGG" ? "quả" : "con");

export const LOT_TYPE_VI: Record<LotType, string> = { EGG: "Trứng", MEAT: "Gà thịt" };
export const LOT_TYPE_EMOJI: Record<LotType, string> = { EGG: "🥚", MEAT: "🍗" };

/**
 * Cách bảo quản — PHẢI hiện ra, không được suy từ `type` rồi viết cứng.
 * Gà thịt giữ 7 ngày nghĩa là đã cấp đông; hôm nào bán gà tươi trong ngày mà giao
 * diện vẫn ghi "đã cấp đông" thì đó là nói dối người mua (§9.11).
 */
export const STORAGE_VI: Record<StorageMode, string> = {
  CHILLED: "Ngăn mát",
  FROZEN: "Đã cấp đông",
};

/** Cách giữ mặc định theo loại — chỉ là GỢI Ý điền sẵn, nông dân vẫn đổi được. */
export const defaultStorage = (type: LotType): StorageMode =>
  type === "EGG" ? "CHILLED" : "FROZEN";

// ---------------- Chặn khoảng ----------------

/**
 * Cân một con gà. Gà ta thương phẩm ~1,2–2,5kg; để rộng ra chút cho gà Đông Tảo to.
 *
 * Vì sao phải chặn: `weightKg` do nông dân gõ tay trên điện thoại và nó nhân thẳng
 * vào giá bán trên chợ. Gõ nhầm `18` thay `1,8` là hoá đơn gấp mười lần.
 */
export const WEIGHT_MIN = 0.8;
export const WEIGHT_MAX = 5;

/** Trần một lần ghi — nhặt hơn ngần này quả trong một lượt là gõ nhầm. */
export const MAX_EGGS_PER_LOG = 300;
/** Một lượt mổ tối đa bao nhiêu con. */
export const MAX_BIRDS_PER_LOG = 50;

/** Mô tả ngắn một lô: "12 quả" · "1 con · 1,8kg". */
export function lotSummary(l: { type: LotType; qty: number; weightKg?: number | null }): string {
  const base = `${l.qty} ${unitOf(l.type)}`;
  if (l.type === "MEAT" && l.weightKg) {
    return `${base} · ${l.weightKg.toLocaleString("vi-VN")}kg`;
  }
  return base;
}
