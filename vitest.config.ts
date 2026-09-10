import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Bộ kiểm chạy lại được của repo (CODEMAP §11.18).
 *
 * ⚠️ CỐ Ý KHÔNG nối vào DB và KHÔNG dựng máy chủ. Chỉ nhận những file trong
 * `tests/` - mà những file đó chỉ được import các lib **client-safe** (không đụng
 * Prisma). Vì sao giới hạn như vậy:
 *
 *  · DB của repo này là Supabase THẬT có dữ liệu thật của chủ dự án. Một bộ test
 *    chạy vài chục lần mỗi ngày mà ghi vào đó là chuyện chỉ cần sai một lần.
 *  · Server action cần ngữ cảnh request của Next (`cookies()`, `revalidatePath`),
 *    không gọi được từ ngoài (§10) - muốn phủ chúng thì phải dựng máy chủ, và đó
 *    là một tầng khác hẳn về chi phí lẫn độ ổn định.
 *
 * Nên bộ này phủ **tầng logic thuần**: phép tính tiền, ranh giới ngày tháng, làm
 * sạch chữ người dùng gõ, và những bảng tra mà thiếu một khoá là sập lúc chạy.
 * Phần cổng quyền và ghi DB vẫn kiểm bằng tay theo công thức ở CODEMAP §10.
 */
export default defineConfig({
  // Next giữ JSX cho build riêng; Vite 8 cần transform để render component trong test.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
