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

// ---------------- Cọc ----------------

/** Mã nội dung chuyển khoản — để nông trại đối soát đúng đơn. */
export const transferCode = (reservationId: string) =>
  `CHIC ${reservationId.slice(-6).toUpperCase()}`;

// ---------------- Media ----------------

export type MediaKind = "video-file" | "embed" | "image";

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

/** Tiến độ nuôi thật, tính từ ngày vào đàn — thay cho số cứng "Ngày 41/75". */
export function flockProgress(startDate: Date | string, cycleDays: number) {
  const day = Math.max(1, Math.floor((Date.now() - new Date(startDate).getTime()) / 86_400_000) + 1);
  const total = Math.max(1, cycleDays);
  return { day: Math.min(day, total), total, pct: Math.min(100, Math.round((day / total) * 100)) };
}
