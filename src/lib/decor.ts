// Helper dùng chung cho decor + media. Không import Prisma → an toàn cho client bundle.

/** Vùng đặt decor hợp lệ trong khung SVG 240×180 của chuồng. */
export const DECOR_BOUNDS = { minX: 14, maxX: 226, minY: 24, maxY: 174, minScale: 0.6, maxScale: 1.8 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 10) / 10;

/** Ép vị trí/cỡ về vùng hợp lệ. Dùng ở CẢ client (khi kéo) và server (khi lưu). */
export function clampPlacement(p: { x: number; y: number; scale: number }) {
  const b = DECOR_BOUNDS;
  return {
    x: round(clamp(Number(p.x) || 0, b.minX, b.maxX)),
    y: round(clamp(Number(p.y) || 0, b.minY, b.maxY)),
    scale: round(clamp(Number(p.scale) || 1, b.minScale, b.maxScale)),
  };
}

export const SCALE_STEP = 0.15;

/** Trần số bản của CÙNG một món trong một chuồng — quá số này là kín khung vẽ. */
export const MAX_PER_ITEM = 8;
/** Trần tổng số món lắp trong một chuồng. Vượt thì hình chuồng thành mớ hỗn độn. */
export const MAX_DECOR_PER_BARN = 24;

/**
 * Món nào có mặt chữ, và chữ dài tối đa bao nhiêu — khoá theo `svgKey` vì đây là
 * thuộc tính của HÌNH VẼ, không phải của dữ liệu bán hàng (thêm cột DB cho nó là sai chỗ).
 * Món không có tên ở đây thì không nhận chữ; `setDecorText` sẽ từ chối.
 */
export const DECOR_TEXT: Record<string, number> = { bien: 14, bang: 22 };

export const acceptsText = (svgKey: string) => svgKey in DECOR_TEXT;

/**
 * Món nào sơn được màu, và sơn được những màu nào — khoá theo `svgKey`, cùng lý do
 * với `DECOR_TEXT`: đây là thuộc tính của HÌNH VẼ, không phải của dữ liệu bán hàng.
 *
 * Màu gắn vào TỪNG CÁI (`BarnDecor.colorHex`), không gắn vào loại món: mua 5 đoạn
 * hàng rào thì mỗi đoạn một màu mới ra được cái sân riêng của người chơi.
 *
 * Danh sách đóng, và `setDecorStyle` chỉ nhận màu nằm trong đây — không cho gõ mã màu
 * tự do: nông trại phải sơn thật, và một ô input màu tự do là lời hứa không giữ được.
 */
export const DECOR_COLORS: Record<string, string[]> = {
  rao: ["#C9A26B", "#8C5A3B", "#6FA45A", "#E4572E", "#F2F0E6"],
  chong: ["#E4572E", "#F0A202", "#2EC4B6", "#26415E", "#F2F0E6"],
};

export const acceptsColor = (svgKey: string) => svgKey in DECOR_COLORS;

/** Kiểu dáng của một cái — đổi hình, không đổi giá. */
export type DecorVariant = { id: string; label: string };

/**
 * Món nào có nhiều kiểu dáng. Phần tử ĐẦU TIÊN là kiểu mặc định (ứng với `variant = null`),
 * nên đừng đảo thứ tự: mọi cái đã lắp trước khi có cột này đều đang mang `null`.
 */
export const DECOR_VARIANTS: Record<string, DecorVariant[]> = {
  rao: [
    { id: "thang", label: "Rào thẳng" },
    { id: "cong", label: "Cổng ra vào" },
    { id: "thap", label: "Rào thấp" },
  ],
};

export const acceptsVariant = (svgKey: string) => svgKey in DECOR_VARIANTS;

/** Màu hợp lệ cho món này? Dùng ở CẢ client (ẩn nút) và server (cổng thật). */
export const isValidColor = (svgKey: string, hex: string) =>
  (DECOR_COLORS[svgKey] ?? []).includes(hex);

/** Kiểu dáng hợp lệ cho món này? */
export const isValidVariant = (svgKey: string, id: string) =>
  (DECOR_VARIANTS[svgKey] ?? []).some((v) => v.id === id);

/** Ký tự điều khiển + zero-width: gõ vào thì vô hình, nhưng làm vỡ SVG một dòng và log. */
const INVISIBLE = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200D\\uFEFF]", "g");

/**
 * Làm sạch một dòng chữ do người dùng gõ (tên chuồng, chữ trên biển).
 *
 * Cho phép chữ hoa/thường, dấu tiếng Việt và emoji — đây là tên riêng của người ta,
 * không phải mã định danh. Chỉ bỏ ký tự vô hình, gộp khoảng trắng, và cắt theo độ dài.
 *
 * ⚠️ Cắt bằng `Array.from` chứ không phải `.slice()`: emoji là cặp surrogate, cắt bằng
 * slice sẽ để lại nửa ký tự và hiện ra ô vuông vỡ.
 */
export function cleanLine(raw: unknown, max: number): string {
  const s = String(raw ?? "").replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  return Array.from(s).slice(0, max).join("").trim();
}

/** Trần độ dài tên chuồng. Dài hơn thì vỡ mọi thẻ và mọi tiêu đề thông báo. */
export const MAX_BARN_NAME = 50;

/** Tên chuồng mặc định khi chủ chuồng không đặt tên riêng. */
export const defaultBarnName = (isLayer: boolean) =>
  isLayer ? "Chuồng Nhà mình" : "Chuồng Mùa vụ";

/**
 * Tên NGẮN để khắc lên biển trong hình vẽ (biển chỉ vừa ~12 ký tự).
 *
 * Đoạn bóc này trước đây bị chép nguyên văn ở 5 file — sửa một chỗ là bốn chỗ kia lệch.
 * Phần bỏ tiền tố/ngoặc kép giữ lại vì chuồng tạo trước bản này còn mang tên dạng
 * `Chuồng "Nhà mình"`; tên do người dùng tự đặt thì đi qua đây không đổi gì.
 */
export const barnDisplayName = (label: string) =>
  label.replace(/^Chuồng\s*/i, "").replace(/["“”]/g, "").trim() || label;

// ---------------- Tài khoản ----------------

/** Câu phải gõ đúng nguyên văn để hoàn trả chuồng — dùng chung client & server. */
export const RETURN_PHRASE = "Xác nhận hoàn trả chuồng cho trang trại";

// ---------------- Mã chuyển khoản ----------------

/**
 * Mã nội dung chuyển khoản — nông trại VÀ webhook ngân hàng dựa vào đây để biết
 * khoản tiền vừa về là của đơn nào.
 *
 * Ba ràng buộc, rút ra từ bản đầu tiên làm sai (`CHIC ABC123`):
 *
 * 1. **Không khoảng trắng.** Mỗi app ngân hàng xử lý khoảng trắng một kiểu, và
 *    người gõ tay hay bỏ sót. Một chuỗi liền là thứ duy nhất đi qua được tất cả.
 * 2. **Có ký tự phân loại.** Cọc chuồng nằm ở bảng `Reservation`, hoá đơn trang trí
 *    ở `DecorOrder`. Dùng chung một định dạng thì webhook nhận "CHICABC123" không
 *    biết tra bảng nào — và tra nhầm bảng thì xác nhận nhầm tiền của người khác.
 * 3. **Chỉ A–Z 0–9.** Không dấu, không ký tự lạ, để ngân hàng không tự ý đổi.
 */
export const PAY_PREFIX = "CHIC";

/** Loại đơn, đứng ngay sau tiền tố. C = cọc chuồng · D = trang trí · M = chợ. */
export type PayKind = "COC" | "DECOR" | "MARKET";
const KIND_CHAR: Record<PayKind, string> = { COC: "C", DECOR: "D", MARKET: "M" };
const CHAR_KIND: Record<string, PayKind> = { C: "COC", D: "DECOR", M: "MARKET" };

/** Sáu ký tự: đủ phân biệt ở quy mô này, đủ ngắn để gõ tay không sai. */
export const PAY_CODE_LEN = 6;

/**
 * Bảng chữ cái của mã. Bỏ `0 O 1 I L` — người ta đọc mã trên màn hình rồi gõ tay vào
 * app ngân hàng, mà số 0 và chữ O thì nhìn giống hệt nhau.
 */
const PAY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Sinh mã chuyển khoản mới, NGẪU NHIÊN — không suy ra từ id nữa.
 *
 * Bản cũ cắt 6 ký tự cuối của cuid. Hai hệ quả xấu: (1) tra đơn phải dùng
 * `id endsWith` ⟹ `LIKE '%…'`, quét toàn bảng mỗi lần tiền về; (2) không có gì bảo
 * đảm duy nhất, hai đơn trùng đuôi thì webhook đành bó tay. Cột `payCode` unique
 * giải quyết cả hai: tra bằng chỉ mục, và DB tự chặn trùng.
 *
 * `crypto.getRandomValues` có ở cả trình duyệt lẫn Node — file này client-safe.
 */
export function newPayCode(kind: PayKind): string {
  const buf = new Uint8Array(PAY_CODE_LEN);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += PAY_ALPHABET[b % PAY_ALPHABET.length];
  return `${PAY_PREFIX}${KIND_CHAR[kind]}${s}`;
}

/**
 * Công thức CŨ (cắt đuôi id). Chỉ còn dùng để bù `payCode` cho những đơn tạo trước
 * khi có cột này — giữ nguyên mã mà khách đã nhìn thấy. Đừng dùng cho đơn mới.
 */
export const legacyPayCode = (kind: PayKind, id: string) =>
  `${PAY_PREFIX}${KIND_CHAR[kind]}${id.slice(-PAY_CODE_LEN).toUpperCase()}`;

const PAY_RE = new RegExp(`${PAY_PREFIX}[\\s.\\-_]*([CDM])[\\s.\\-_]*([A-Z0-9]{${PAY_CODE_LEN}})`);

/**
 * Bóc mã ra khỏi nội dung chuyển khoản THẬT — ngân hàng trả về đại loại
 * "CT tu 0123456 CHICCAYVFPM GD 987654-060825".
 *
 * Nhận diện rộng rãi có chủ đích (chữ hoa/thường, có chèn dấu chấm/gạch), nhưng
 * trả `null` ngay khi không chắc. **Chỗ gọi phải coi `null` là "để admin đối soát
 * tay"** — đoán bừa rồi tự xác nhận là mở khoá chuồng cho người chưa trả tiền.
 */
export function parsePayCode(
  raw: string | null | undefined,
): { kind: PayKind; code: string } | null {
  const m = String(raw ?? "").toUpperCase().match(PAY_RE);
  if (!m) return null;
  // Dựng lại mã ở dạng chuẩn (liền, viết hoa) để tra thẳng cột payCode — nội dung
  // ngân hàng gửi về có thể chèn dấu chấm/gạch giữa các phần.
  return { kind: CHAR_KIND[m[1]], code: `${PAY_PREFIX}${m[1]}${m[2]}` };
}

// ---------------- Media ----------------

export type MediaKind = "video-file" | "embed" | "image";

/**
 * Trần số ảnh/video tự giới thiệu của một nông dân — hồ sơ để khách xem nhanh,
 * không phải album. Để ở đây (không để trong worker-profile-actions.ts) vì file
 * `"use server"` chỉ được phép export hàm async.
 */
export const MAX_INTRO_MEDIA = 8;

const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i;
const VIMEO = /vimeo\.com\/(?:video\/)?(\d+)/i;

/** Chuẩn hoá URL người dùng dán: link YouTube/Vimeo → dạng nhúng được. */
export function normalizeMediaUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  // chỉ nhận đường dẫn nội bộ hoặc http(s) — chặn javascript:, data: …
  if (!url.startsWith("/") && !/^https?:\/\//i.test(url)) return null;
  if (url.length > 2000) return null;

  const yt = url.match(YT);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vm = url.match(VIMEO);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}

/** Cách hiển thị một URL media: file video, nhúng iframe, hay ảnh. */
export function mediaKind(url: string): MediaKind {
  if (/\.(mp4|webm|ogv|mov)(\?|#|$)/i.test(url)) return "video-file";
  if (/(youtube(-nocookie)?\.com\/embed|player\.vimeo\.com)/i.test(url)) return "embed";
  return "image";
}

export const fmtDuration = (s?: number | null) =>
  s == null ? null : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// ---------------- Ngày tháng ----------------

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** "Hôm nay" / "Hôm qua" / "Thứ Ba, 12/03" — nhãn nhóm cho dòng thời gian. */
export function dayLabel(d: Date | string) {
  const date = new Date(d);
  const diff = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (diff <= 0) return "Hôm nay";
  if (diff === 1) return "Hôm qua";
  if (diff < 7) return `${diff} ngày trước`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function isToday(d: Date | string) {
  return startOfDay(new Date(d)).getTime() === startOfDay(new Date()).getTime();
}

export function timeAgo(d: Date | string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} ngày trước`;
  return new Date(d).toLocaleDateString("vi-VN");
}

export const hhmm = (d: Date | string) =>
  new Date(d).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/** Tuổi tính từ năm sinh. Lưu năm sinh chứ không lưu tuổi để dữ liệu không bị cũ. */
export function ageFromBirthYear(birthYear?: number | null): number | null {
  if (!birthYear) return null;
  const age = new Date().getFullYear() - birthYear;
  return age > 0 && age < 120 ? age : null;
}

/** Tiến độ nuôi thật, tính từ ngày vào đàn — thay cho số cứng "Ngày 41/75". */
export function flockProgress(startDate: Date | string, cycleDays: number) {
  const day = Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / 86_400_000) + 1);
  const total = Math.max(1, cycleDays);
  return { day: Math.min(day, total), total, pct: Math.min(100, Math.round((day / total) * 100)) };
}
