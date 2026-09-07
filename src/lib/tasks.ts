// Metadata nhiệm vụ - dùng chung client & server, KHÔNG import Prisma.

export type TaskKind =
  | "DECOR" | "RANGE_OUT" | "RANGE_IN" | "FEED" | "CHECK" | "GEAR"
  | "DELIVER" | "HARVEST" | "RETIRE" | "HANDOVER" | "FREEZE" | "WEIGH";
export type TaskStatus = "OPEN" | "DONE" | "DECLINED";

/** Trần số chuồng một nông dân được nhận quản lý cùng lúc. */
export const WORKER_MAX_BARNS = 15;

/**
 * Việc để `OPEN` quá ngần này ngày thì việc nền nhắc nông dân một lần.
 *
 * Đây KHÔNG phải `dueAt`: phần lớn việc không có giờ hẹn (thả vườn, lắp trang trí,
 * sơ chế đàn), nên `isOverdue` không bắt được chúng. Một việc nằm im 4 ngày là chủ
 * chuồng đang chờ mà không biết mình đang chờ ai.
 */
export const TASK_STALE_DAYS = 4;

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
    // Ảnh phải thấy RÕ CON ĐÓ đang đeo - đây chính là điểm của tính năng: từ nay chủ
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
      "Nhận đúng yêu cầu của đàn, kiểm tra điều kiện thu hoạch với nông trại. " +
      "Sau khi thực hiện, cân và ghi lô vào sổ thu hoạch rồi đối soát đủ số con trước khi báo xong.",
    // Ghi lô là chỗ có ảnh lúc cân; ảnh của VIỆC này là lô đã sơ chế xong, đóng gói -
    // hai tấm nói hai chuyện khác nhau nên không thừa.
    proof: "Chụp lô gà đã sơ chế xong, đóng gói chờ giao.",
  },
  RETIRE: {
    emoji: "🌾", label: "Tiếp nhận đàn nghỉ hưu",
    doing: "Nhận việc để xác nhận nông trại tiếp tục chăm đàn theo điều khoản chủ chuồng đã đồng ý. Kiểm tra đủ số con, chuyển đàn tới nơi chăm tiếp rồi gửi minh chứng.",
    proof: "Chụp/quay đàn tại nơi tiếp tục chăm sóc và đối soát số con.",
  },
  FREEZE: {
    emoji: "🧊", label: "Cấp đông lô theo yêu cầu",
    // Chủ lô bấm "cấp đông giúp mình" - app KHÔNG tự đổi `storage` được (§9.2), vì cái
    // tủ đông nằm ngoài đời và chỉ có cô chú mới mở được nó.
    doing: "Chuyển lô ghi trong ghi chú từ ngăn mát sang tủ đông. Bọc kín và dán nhãn ngày thu giúp nhé.",
    proof: "Chụp lô đã nằm trong tủ đông, thấy được nhãn ngày.",
  },
  WEIGH: {
    emoji: "⚖️", label: "Cân mẫu đàn tuần này",
    doing:
      "Bắt vài con bất kỳ trong đàn, cân từng con rồi ghi số cân TRUNG BÌNH vào ô " +
      "\"Ghi cân nặng tuần này\" ngay dưới đây. Cân 3–5 con là đủ.",
    // Ảnh cái cân là bằng chứng §9.1 cho một con số sẽ nằm vĩnh viễn trong biểu đồ
    // lớn lên của chủ chuồng - bịa một con số ở đây là bịa cả đường cong.
    proof: "Chụp con gà đang đứng trên cân, thấy rõ số.",
  },
  HANDOVER: {
    emoji: "🏠", label: "Giao lô về nhà chủ chuồng",
    // KHÁC `DELIVER`: đây là hàng của CHÍNH chủ chuồng, không có tiền đi kèm và không
    // sinh `Payout`. Địa chỉ nằm trong ghi chú của việc, chụp lại từ lúc họ xin nhận.
    doing: "Đóng gói lô ghi trong ghi chú rồi giao tới địa chỉ chủ chuồng. Gọi trước cho họ một tiếng.",
    proof: "Chụp lúc trao hàng tận tay chủ chuồng.",
  },
};

/** Cữ ăn gợi ý - user chọn nhanh thay vì gõ giờ. */
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

/** Việc quá hạn mà chưa xong - dùng để nhắc nông dân và báo cho chủ chuồng. */
export function isOverdue(t: { status: TaskStatus; dueAt: Date | string | null }): boolean {
  return t.status === "OPEN" && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
}

export const STATUS_VI: Record<TaskStatus, string> = {
  OPEN: "Đang chờ nông dân",
  DONE: "Đã xong",
  DECLINED: "Không làm được",
};
