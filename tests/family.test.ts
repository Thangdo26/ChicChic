// FAMILY LEARNING - Epic 0: cờ tổng và ranh giới tầng.
//
// Đợt này chưa có route nào, chưa có bảng nào. Thứ duy nhất có thật là **một cái công
// tắc**, và một cái công tắc thì chỉ đáng tin khi biết chắc nó nghiêng về phía nào lúc
// không ai đụng tới. Repo này đã có hai tiền lệ đi hai hướng ngược nhau, đều đúng:
// `SEPAY_WEBHOOK_KEY` trống ⟹ **đóng** (§9.20), còn bộ đếm tần suất hỏng ⟹ **mở** (§9.35).
// Cờ này thuộc nhóm đầu, và bộ kiểm ở đây khoá đúng điều đó.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILY_PROGRAM_VERSION, coBatFamily } from "@/lib/family-gates";

const doc = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");

describe("cờ tổng Family Learning", () => {
  it("⭐ không đặt gì thì TẮT - hỏng thì đóng, không phải mở", () => {
    // Mở nhầm ở đây là màn hình dành cho trẻ em hiện ra khi chưa ai duyệt nội dung.
    expect(coBatFamily(undefined)).toBe(false);
    expect(coBatFamily(null)).toBe(false);
    expect(coBatFamily("")).toBe(false);
    expect(coBatFamily("   ")).toBe(false);
  });

  it("nhận đúng ba chữ bật, không đoán thêm", () => {
    for (const v of ["1", "true", "on", "TRUE", " On "]) expect(coBatFamily(v), v).toBe(true);
  });

  it("⭐ chữ lạ là TẮT, kể cả chữ nghe như đang bật", () => {
    // `"yes"` và `"enabled"` là hai chữ người ta hay gõ theo phản xạ. Đoán bừa ở đây
    // nghĩa là một hôm nào đó tính năng bật lên vì ai đó gõ nhầm - đúng kiểu sự cố
    // không ai dựng lại được.
    for (const v of ["0", "false", "off", "yes", "enabled", "bat", "no"]) {
      expect(coBatFamily(v), v).toBe(false);
    }
  });

  it("phiên bản chương trình là chuỗi không rỗng", () => {
    // Nó được chụp vào `FamilyEnrollment.programVersion`, tức là nằm vĩnh viễn trong hồ
    // sơ của một gia đình thật. Rỗng thì bản cam kết họ đã ký thành vô danh.
    expect(FAMILY_PROGRAM_VERSION.trim().length).toBeGreaterThan(0);
  });
});

describe("ranh giới tầng - đường dây", () => {
  const gates = boChuThich(doc("src/lib/family-gates.ts"));
  const family = boChuThich(doc("src/lib/family.ts"));

  it("⭐ phần thuần không đụng Prisma, không đụng next/headers, không đọc biến môi trường", () => {
    // Cùng khuôn `nhip-meta.ts` ↔ `nhip.ts`. Kéo một trong ba thứ này vào là bộ kiểm
    // một giây không chạy được nữa, và luật quyền lại rơi về chỗ không ai phủ.
    expect(gates).not.toContain("@/lib/db");
    expect(gates).not.toContain("next/headers");
    expect(gates).not.toContain("process.env");
  });

  it("⭐ cờ KHÔNG được là biến NEXT_PUBLIC_", () => {
    // Biến `NEXT_PUBLIC_*` bị nướng vào bundle lúc build: tắt tính năng mà vẫn khoe ra
    // rằng nó tồn tại và sắp có gì. Kill switch phải là quyết định của server.
    expect(family).toContain("process.env.FAMILY_LEARNING_ENABLED");
    expect(family).not.toContain("NEXT_PUBLIC_FAMILY");
  });

  it("cờ đọc mỗi lần gọi, không chụp vào hằng số ở đầu module", () => {
    // Chụp vào hằng số thì đổi biến trên Vercel phải deploy lại mới ăn - với một kill
    // switch, khoảng cách giữa "quyết định tắt" và "thật sự tắt" là thứ không nên có.
    const truocHam = family.slice(0, family.indexOf("export function batFamily"));
    expect(truocHam).not.toContain("process.env");
  });

  it("`.env.example` có khai cờ này kèm lời dặn", () => {
    // Biến môi trường không khai ở đây thì người dựng hệ thống không có cách nào biết
    // nó tồn tại - đúng cách `CRON_SECRET` từng nằm im và bốn việc nền không chạy.
    const env = doc(".env.example");
    expect(env).toContain("FAMILY_LEARNING_ENABLED");
    expect(env).toContain("NO-GO");
  });
});
