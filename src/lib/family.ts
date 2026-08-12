// FAMILY LEARNING - phần chạm vào môi trường và DB.
//
// ⚠️ **CHỈ SERVER.** File này đọc `process.env` và (từ Epic 1) đọc/ghi Prisma. Component
// client tuyệt đối không được import - luật §1.2 của CODEMAP. Phần thuần dùng chung nằm
// ở `lib/family-gates.ts`.
//
// Và nó **không phải server action**: giống `lib/task-store.ts`, ở đây cố ý không có
// `"use server"` nên không gọi được từ client. Nó *tin* dữ liệu đưa vào, nên chỉ được
// gọi từ action đã kiểm quyền.
import { coBatFamily } from "@/lib/family-gates";

/**
 * Cờ tổng của cả chương trình - kill switch ở §22.3 của spec.
 *
 * Tên biến **không** có tiền tố `NEXT_PUBLIC_`, và đó là chủ ý: biến `NEXT_PUBLIC_*` bị
 * nướng vào bundle lúc build và ai mở DevTools cũng đọc được, tức là tắt tính năng mà
 * vẫn để lộ rằng nó tồn tại và sắp có gì. Cờ này phải là quyết định của **server**.
 *
 * Đọc mỗi lần gọi chứ không chụp vào hằng số ở đầu module: đổi biến trên Vercel rồi
 * restart là ăn ngay, không cần deploy lại. Với một kill switch thì khoảng cách giữa
 * "quyết định tắt" và "thật sự tắt" là thứ đáng trả giá vài phép đọc biến.
 */
export function batFamily(): boolean {
  return coBatFamily(process.env.FAMILY_LEARNING_ENABLED);
}
