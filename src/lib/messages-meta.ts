// Phần dùng chung của hộp thư — KHÔNG import Prisma, để client bundle dùng được.
// (lib/messages.ts mới là nơi đọc/ghi DB và kiểm quyền, chỉ chạy phía server.)
// Cùng cặp với notify.ts ↔ notify-meta.ts.

/** Vai hiển thị trong khung hộp thư. ADMIN là chế độ chỉ đọc của nông trại. */
export type ThreadRole = "OWNER" | "WORKER" | "ADMIN";

/** Hai bên TRONG cuộc — chỉ hai vai này gửi được tin. Nông trại không nằm ở đây. */
export type PartyRole = "OWNER" | "WORKER";

export const MAX_BODY = 1000;

export type MessageVM = {
  id: string;
  author: PartyRole;
  body: string;
  mine: boolean;
  flagged: boolean;
  reported: boolean;
  /** Loại vi phạm người báo cáo đã chọn (null nếu chưa ai báo cáo) */
  reportReason: string | null;
  createdAt: string;
};

/**
 * Loại vi phạm người dùng chọn khi báo cáo. Danh sách ĐÓNG và cố ý ngắn — hỏi quá
 * nhiều thì không ai báo cáo, mà đây là đường duy nhất mở khoá cho nông trại đọc
 * hộp thư (CODEMAP §9.17).
 */
export const REPORT_REASONS = [
  { id: "NGOAI_APP", label: "Rủ trao đổi ngoài app", hint: "Xin số điện thoại, Zalo, hẹn giao dịch riêng" },
  { id: "HUA_HEN", label: "Hứa hẹn sai sự thật", hint: "Cam kết số trứng, ngày thu hoạch, lợi nhuận" },
  { id: "XUC_PHAM", label: "Lời lẽ xúc phạm", hint: "Nói nặng lời, doạ dẫm, quấy rối" },
  { id: "LUA_DAO", label: "Có dấu hiệu lừa đảo", hint: "Đòi chuyển tiền riêng, mạo danh nông trại" },
  { id: "KHAC", label: "Lý do khác", hint: "Nông trại sẽ đọc cả hộp thư để hiểu bối cảnh" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export const isReportReason = (v: string): v is ReportReason =>
  REPORT_REASONS.some((r) => r.id === v);

export const reportLabel = (id: string | null) =>
  REPORT_REASONS.find((r) => r.id === id)?.label ?? "Không rõ";

export const CONTACT_WARNING =
  "Mình thấy tin này có vẻ trao đổi liên hệ riêng. Nhắn ngoài app thì nông trại không có " +
  "bằng chứng để bênh bạn khi có tranh chấp — cứ trao đổi ở đây cho an toàn nhé.";
