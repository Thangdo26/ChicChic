// Metadata nhiệm vụ — dùng chung client & server, KHÔNG import Prisma.

export type TaskKind = "DECOR" | "RANGE_OUT" | "RANGE_IN" | "FEED" | "CHECK" | "GEAR" | "DELIVER" | "HARVEST";
export type TaskStatus = "OPEN" | "DONE" | "DECLINED";

/** Trần số chuồng một nông dân được nhận quản lý cùng lúc. */
export const WORKER_MAX_BARNS = 15;

export const TASK_META: Record<
  TaskKind,
  { emoji: string; label: string; /** việc nông dân phải làm ngoài đời */ doing: string; /** ảnh/video cần chụp lại */ proof: string }
> = {
  DECOR: {
    emoji: "🎨", label: "Lắp trang trí",
    doing: "Lắp/xếp lại đồ trang trí đúng bố cục chủ chuồng đã vẽ.",
    proof: "Chụp góc chuồng sau khi lắp xong.",
  },
  RANGE_OUT: {
    emoji: "🌿", label: "Thả đàn ra vườn",
    doing: "Lùa đàn ra khu quây thả, kiểm tra rào và nước.",
    proof: "Quay/chụp đàn đang ở ngoài vườn.",
  },
  RANGE_IN: {
    emoji: "🏡", label: "Gọi đàn về chuồng",
    doing: "Gọi đàn về, đếm đủ số con rồi đóng cửa chuồng.",
    proof: "Chụp đàn đã vào chuồng.",
  },
  FEED: {
    emoji: "🌾", label: "Cho ăn theo giờ hẹn",
    doing: "Cho ăn đúng cữ chủ chuồng hẹn, đúng khẩu phần của đàn.",
    proof: "Quay ngắn cảnh đàn đang ăn.",
  },
  CHECK: {
    emoji: "👀", label: "Ngó chuồng & báo hiện trạng",
    doing: "Ra tận chuồng xem đàn, ghi lại điều bất thường nếu có.",
    proof: "Chụp/quay hiện trạng chuồng lúc kiểm tra.",
  },
  GEAR: {
    emoji: "🧣", label: "Mặc / tháo yếm cho gà",
    doing: "Mặc yếm đúng màu cho đúng con ghi trong ghi chú (hoặc tháo ra nếu được yêu cầu). Không có màu đó thì bấm \"Không làm được\" kèm lý do.",
    // Ảnh phải thấy RÕ CON ĐÓ đang đeo — đây chính là điểm của tính năng: từ nay chủ
    // chuồng nhìn ảnh là nhận ra con mình đặt tên.
    proof: "Chụp cận con gà đó đang đeo yếm, thấy rõ màu.",
  },
  DELIVER: {
    emoji: "📦", label: "Giao lô đã bán",
    doing: "Đóng gói lô ghi trong ghi chú rồi giao tận tay người mua.",
    // Ảnh này là thứ MỞ KHOÁ TIỀN cho người bán: không có nó thì đơn không sang
    // DELIVERED, và không có DELIVERED thì nông trại không chi trả (§9.29).
    proof: "Chụp lúc trao hàng cho người mua.",
  },
  HARVEST: {
    emoji: "🍲", label: "Sơ chế đàn & ghi lô vào sổ",
    doing:
      "Chủ chuồng đã chọn NHẬN THỊT. Mổ và sơ chế đàn theo đúng quy định giết mổ & kiểm dịch, " +
      "cân từng lô rồi ghi vào sổ thu hoạch của chuồng (ô \"Ghi lô thu hoạch\" ngay dưới đây).",
    // Ghi lô là chỗ có ảnh lúc cân; ảnh của VIỆC này là lô đã sơ chế xong, đóng gói —
    // hai tấm nói hai chuyện khác nhau nên không thừa.
    proof: "Chụp lô gà đã sơ chế xong, đóng gói chờ giao.",
  },
};

/** Cữ ăn gợi ý — user chọn nhanh thay vì gõ giờ. */
export const FEED_SLOTS = [
  { value: "06:30", label: "Cữ sáng · 06:30" },
  { value: "11:00", label: "Cữ trưa · 11:00" },
  { value: "16:30", label: "Cữ chiều · 16:30" },
] as const;

/**
 * Giờ hẹn "HH:mm" → mốc thời gian gần nhất chưa trôi qua (hôm nay, hoặc mai nếu đã qua giờ).
 * Chạy ở client rồi gửi ISO lên server để khỏi lệch múi giờ máy chủ.
 */
export function nextOccurrence(hhmm: string, now = new Date()): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const at = new Date(now);
  at.setHours(h || 0, m || 0, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

/** Việc quá hạn mà chưa xong — dùng để nhắc nông dân và báo cho chủ chuồng. */
export function isOverdue(t: { status: TaskStatus; dueAt: Date | string | null }): boolean {
  return t.status === "OPEN" && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
}

export const STATUS_VI: Record<TaskStatus, string> = {
  OPEN: "Đang chờ nông dân",
  DONE: "Đã xong",
  DECLINED: "Không làm được",
};
