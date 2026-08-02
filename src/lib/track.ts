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
  | "task_done" // hoàn thành việc kèm minh chứng
  | "task_declined"
  | "worker_daily_update"; // nhật ký hằng ngày — nhịp nội dung

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
