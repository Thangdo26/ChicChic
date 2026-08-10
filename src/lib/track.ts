// Đo đạc — ghi lại những gì người dùng THỰC SỰ làm, để trả lời được 5 chỉ số PoC
// (playbook §7.3) mà không phải đếm tay trên DB.
//
// File này KHÔNG có "use server" (giống lib/notify.ts và lib/task-store.ts): nó tin
// dữ liệu đưa vào, nên chỉ được gọi từ action/route/page đã kiểm quyền xong.
//
// Nguyên tắc: đo đạc hỏng thì im lặng bỏ qua. Không bao giờ để một dòng thống kê
// làm hỏng việc nhận chuồng hay việc nông dân vừa làm xong.
import { prisma } from "@/lib/db";

/**
 * Danh sách đóng — thêm sự kiện thì thêm ở đây trước, để tên không trôi mỗi nơi
 * một kiểu (thứ giết mọi hệ thống analytics tự làm).
 */
export type EventName =
  /** Chủ chuồng chọn một con gà để mặc yếm — đo xem tính năng "nhận ra từng con" có được dùng thật không. */
  | "gear_worn"
  /** Nông dân ghi một lô thu hoạch. Đây là NGUỒN của mọi con số sản lượng thật. */
  | "harvest_logged"
  /**
   * Chủ chuồng xin nhận một lô về tận nhà. Đo cái này để biết người ta thật sự nuôi
   * để ĂN hay để bán lại — câu hỏi định vị quan trọng nhất còn chưa có số liệu.
   */
  | "lot_claimed"
  /** Chợ: đăng bán · giữ chỗ · tiền về · nông trại đã chi cho người bán. */
  | "listing_created"
  | "listing_reserved"
  | "market_paid"
  | "payout_paid"
  /** Nông trại đổi giá niêm yết — để sau này hiểu vì sao doanh số có một bậc thang. */
  | "price_changed"
  /**
   * Nuôi dưỡng đàn nghỉ hưu: đặt kỳ · tiền về.
   *
   * Hai con số đáng theo dõi nhất của sản phẩm nằm ở đây, và trước đợt này **không đo
   * được**: (1) bao nhiêu người chọn nghỉ hưu rồi thật sự đóng tiền — tức "lòng tốt" có
   * chuyển thành doanh thu không, hay chỉ là một nút bấm miễn phí; (2) họ đóng kỳ mấy
   * tháng — tức người ta cam kết với con vật của mình xa tới đâu.
   */
  | "care_order_created"
  | "care_paid"
  /**
   * Hoá đơn tiền nuôi: phát hành · tiền về · chuồng bị khoá vì quá hạn.
   *
   * Đây là **phễu doanh thu chính** và trước đợt này nó không tồn tại: sản phẩm thu đúng
   * 50k cọc rồi thôi. Ba con số cần đọc cùng nhau — bao nhiêu hoá đơn phát ra, bao nhiêu
   * được trả, và bao nhiêu chuồng phải khoá. Tỉ lệ thứ ba mà cao thì vấn đề nằm ở GIÁ
   * hoặc ở cách nói, không phải ở việc nhắc chưa đủ rát.
   */
  | "invoice_issued"
  | "invoice_paid"
  | "barn_locked_unpaid"
  // Phễu tiền
  | "barn_reserved" // giữ chỗ thành công → mẫu số của conversion
  | "deposit_reported" // người dùng báo đã chuyển khoản
  | "deposit_confirmed" // nông trại xác nhận nhận tiền → tử số của conversion
  | "barn_returned" // hoàn trả chuồng → churn
  // Gắn bó của chủ chuồng
  | "barn_opened" // mở dashboard chuồng → tín hiệu DAU/giữ chân
  | "task_requested" // giao việc cho nông dân
  | "decor_installed" // lắp một món trang trí → tỉ lệ mua decor
  | "end_of_lay_decided" // chọn thịt / nghỉ hưu / lứa mới
  // Vận hành của nông dân
  | "barn_reassigned" // nông trại bàn giao một chuồng sang người khác
  | "task_done" // hoàn thành việc kèm minh chứng
  | "task_declined"
  | "worker_daily_update" // nhật ký hằng ngày — nhịp nội dung
  // Hộp thư của chuồng
  | "message_sent" // một tin trong hộp thư — đo mức hỏi–đáp thật giữa hai bên
  | "message_to_task" // tin nhắn được chuyển thành việc có minh chứng
  | "message_reported" // báo cáo vi phạm — theo dõi chất lượng cuộc trò chuyện
  // Trang trí trả phí
  | "decor_ordered" // đặt mua món trang trí → mẫu số của phễu decor
  | "decor_paid"; // nông trại xác nhận tiền decor → tử số

export type TrackInput = {
  userId?: string | null;
  barnSlug?: string | null;
  /** Số liệu kèm theo: giá tiền, loại việc, số con… Giữ nhỏ và phẳng. */
  props?: Record<string, string | number | boolean | null>;
};

/** Ghi một sự kiện. Lỗi được nuốt — xem chú thích đầu file. */
export async function track(name: EventName, input: TrackInput = {}): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        name,
        userId: input.userId ?? null,
        barnSlug: input.barnSlug ?? null,
        props: input.props ?? undefined,
      },
    });
  } catch (e) {
    console.error(`[track] không ghi được sự kiện "${name}"`, e);
  }
}
