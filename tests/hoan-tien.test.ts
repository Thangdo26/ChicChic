// HOÀN TIỀN (`lib/refund.ts`) - và cái lỗ rò mà nó được viết ra để vá.
//
// Hai thứ khác hẳn nhau cùng ở trong file này, cố ý:
//
//  1. **Phép chia theo ngày.** Đây là chỗ duy nhất trong repo tiền đi NGƯỢC chiều - từ
//     nông trại về người dùng - nên mọi hướng làm tròn, mọi phép kẹp đều phải ngược với
//     phần còn lại. Rất dễ bị "sửa cho nhất quán" bởi người đọc lướt.
//  2. **Luật "chưa có chủ ≠ được xem".** Khoá lại bằng bề mặt mã nguồn, cùng cách
//     `tests/vi-tien.test.ts` khoá §9.29.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MARKET_REFUND_DAYS, REFUND_KIND_VI, REFUND_STATUS_MAU, REFUND_STATUS_VI,
  conXinHoanDuoc, hoanTheoTiLe, tongHoan,
} from "@/lib/refund";

const NGAY = 86_400_000;
const d = (ms: number) => new Date(ms);
/** Một kỳ 30 ngày, đã trả 300.000đ - 10.000đ mỗi ngày cho dễ nhẩm. */
const KY = { from: d(0), to: d(30 * NGAY), daTraVnd: 300_000 };

describe("chia theo ngày", () => {
  it("kỳ đã nuôi trọn thì không hoàn đồng nào", () => {
    expect(hoanTheoTiLe(KY, d(30 * NGAY)).hoanVnd).toBe(0);
    // Và cả sau đó nữa - dừng muộn hơn không làm số âm.
    expect(hoanTheoTiLe(KY, d(90 * NGAY)).hoanVnd).toBe(0);
  });

  it("dừng giữa kỳ thì hoàn đúng phần ngày còn lại", () => {
    const p = hoanTheoTiLe(KY, d(10 * NGAY));
    expect(p.tongNgay).toBe(30);
    expect(p.ngayChuaDung).toBe(20);
    expect(p.hoanVnd).toBe(200_000);
  });

  it("kỳ CHƯA bắt đầu thì hoàn nguyên kỳ, không hoàn hơn", () => {
    // Trả trước tháng sau rồi dừng hôm nay: cả tháng đó chưa nuôi ngày nào.
    const p = hoanTheoTiLe({ from: d(60 * NGAY), to: d(90 * NGAY), daTraVnd: 300_000 }, d(10 * NGAY));
    expect(p.ngayChuaDung).toBe(30);
    expect(p.hoanVnd).toBe(300_000);
  });

  it("KHÔNG BAO GIỜ trả nhiều hơn số đã nhận", () => {
    // Kẹp trên là hàng rào cuối. Mốc lùi xa tuỳ ý cũng không vượt được `daTraVnd`.
    for (const moc of [-1000 * NGAY, -1 * NGAY, 0]) {
      expect(hoanTheoTiLe(KY, d(moc)).hoanVnd).toBeLessThanOrEqual(KY.daTraVnd);
    }
    expect(hoanTheoTiLe(KY, d(-1000 * NGAY)).hoanVnd).toBe(300_000);
  });

  it("phần lẻ về phía NGƯỜI ĐƯỢC TRẢ LẠI, không về phía nông trại", () => {
    // 100đ chia 3 ngày, còn 1 ngày → 33,33đ. Làm tròn xuống là 33đ; ở đây phải là 34đ.
    // Một đồng, nhưng nó là cả cái luật: chỗ này tiền đi ngược chiều với mọi chỗ khác
    // trong repo, nên hướng làm tròn cũng phải ngược theo (xem chú thích trong lib).
    const p = hoanTheoTiLe({ from: d(0), to: d(3 * NGAY), daTraVnd: 100 }, d(2 * NGAY));
    expect(p.hoanVnd).toBe(34);
  });

  it("ngày đang dở tính là CHƯA dùng", () => {
    // Dừng lúc giữa ngày thứ 10 → còn 20 ngày trọn + phần lẻ của ngày thứ 10 = 21.
    const p = hoanTheoTiLe(KY, d(9.5 * NGAY));
    expect(p.ngayChuaDung).toBe(21);
  });

  it("kỳ rỗng hoặc chưa trả tiền thì hoàn 0, không chia cho 0", () => {
    expect(hoanTheoTiLe({ from: d(0), to: d(0), daTraVnd: 300_000 }, d(0)).hoanVnd).toBe(0);
    expect(hoanTheoTiLe({ from: d(0), to: d(30 * NGAY), daTraVnd: 0 }, d(0)).hoanVnd).toBe(0);
    // Kỳ ngược đời (to < from) - dữ liệu hỏng thì im lặng trả 0, đừng ra số âm.
    const nguoc = hoanTheoTiLe({ from: d(30 * NGAY), to: d(0), daTraVnd: 300_000 }, d(0));
    expect(nguoc.hoanVnd).toBe(0);
    expect(nguoc.tongNgay).toBe(0);
  });

  it("cộng nhiều kỳ", () => {
    expect(tongHoan([hoanTheoTiLe(KY, d(10 * NGAY)), hoanTheoTiLe(KY, d(20 * NGAY))])).toBe(300_000);
    expect(tongHoan([])).toBe(0);
  });
});

describe("cửa sổ báo hàng không đúng", () => {
  const bay = d(10 * NGAY);
  const lo = (over: Partial<Parameters<typeof conXinHoanDuoc>[0]>) =>
    conXinHoanDuoc({ status: "DELIVERED", paidAt: null, deliveredAt: bay, ...over }, bay);

  it("vừa giao xong thì xin được", () => {
    expect(lo({})).toBe(true);
  });

  it("quá hạn thì thôi - trứng và thịt gà không chờ được lâu hơn", () => {
    expect(lo({ deliveredAt: d(bay.getTime() - (MARKET_REFUND_DAYS + 1) * NGAY) })).toBe(false);
    // Đúng ngay biên thì VẪN được: biên phải nghiêng về phía người mua.
    expect(lo({ deliveredAt: d(bay.getTime() - MARKET_REFUND_DAYS * NGAY) })).toBe(true);
  });

  it("đã trả tiền mà lô không tới cũng là một cách hỏng", () => {
    expect(lo({ status: "PAID", deliveredAt: null, paidAt: bay })).toBe(true);
  });

  it("đơn chưa tới bước trả tiền thì không có gì để hoàn", () => {
    for (const status of ["LISTED", "RESERVED", "CANCELLED"]) {
      expect(lo({ status })).toBe(false);
    }
  });

  it("thiếu cả hai dấu thời gian thì từ chối, không đoán", () => {
    expect(lo({ status: "PAID", paidAt: null, deliveredAt: null })).toBe(false);
  });
});

describe("chữ hiện ra màn hình", () => {
  it("đủ tên tiếng Việt cho MỌI trạng thái trong schema", () => {
    // Thêm một giá trị vào `enum RefundStatus` mà quên chỗ này thì người dùng đọc được
    // chữ "APPROVED" giữa một trang tiếng Việt.
    const schema = readFileSync(join(__dirname, "..", "prisma", "schema.prisma"), "utf8");
    const khoi = (ten: string) =>
      (schema.match(new RegExp(`enum ${ten} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "")
        .split("\n").map((l) => l.trim().split(/[\s/]/)[0]).filter(Boolean);

    const statuses = khoi("RefundStatus");
    const kinds = khoi("RefundKind");
    expect(statuses.length).toBeGreaterThan(0);
    expect(kinds.length).toBeGreaterThan(0);
    for (const s of statuses) {
      expect(REFUND_STATUS_VI, `thiếu chữ cho ${s}`).toHaveProperty(s);
      expect(REFUND_STATUS_MAU, `thiếu màu cho ${s}`).toHaveProperty(s);
    }
    for (const k of kinds) expect(REFUND_KIND_VI, `thiếu chữ cho ${k}`).toHaveProperty(k);
  });

  it("không câu nào nhắc tới tên trạng thái trong máy", () => {
    for (const v of Object.values(REFUND_STATUS_VI)) {
      expect(v).not.toMatch(/REQUESTED|APPROVED|REJECTED|PAID/);
    }
  });
});

describe("§9.5 - CHƯA CÓ CHỦ không phải là quyền được xem", () => {
  // Bỏ chú thích: cả hai file đều CÓ nhắc `!ownerId` trong phần giải thích **vì sao
  // không được dùng nó**, và đó là chỗ duy nhất chuỗi ấy được phép xuất hiện.
  const sach = (p: string[]) =>
    readFileSync(join(__dirname, "..", "src", ...p), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const auth = sach(["lib", "auth.ts"]);
  const gates = sach(["lib", "gates.ts"]);

  it("không cổng nào mở chuồng chỉ vì chuồng chưa có chủ", () => {
    // Đây từng là một lỗ rò THẬT, đo trên bản chạy thật chứ không phải suy luận:
    // `returnBarn` đặt `ownerId = null`, nên mọi chuồng người ta hoàn trả lập tức mở
    // toang cho khách vãng lai - tên chuồng, cả cuốn nhật ký ảnh, lời nông dân viết
    // dưới từng tấm. Lúc phát hiện có 3 chuồng thật đang như vậy.
    for (const src of [auth, gates]) {
      expect(src).not.toMatch(/!\s*barn\.ownerId/);
      expect(src).not.toMatch(/isPublic\s*\|\|/);
    }
  });

  it("hai cánh cửa gọi CHUNG một luật, không chép tay hai bản", () => {
    // Trước đợt 11, `canViewBarn` và `barnViewer` là hai bản chép tay của cùng một luật -
    // và lỗ rò nằm ở CẢ HAI. Việc người vá nhớ vá cả hai là may, không phải thiết kế.
    // Nay luật ở `lib/gates.quyenXemChuong`; bảng quyết định đầy đủ ở `cong-quyen.test.ts`.
    for (const ham of ["canViewBarn", "barnViewer"]) {
      const than = auth.slice(auth.indexOf(`export async function ${ham}`), auth.indexOf(`export async function ${ham}`) + 700);
      expect(than, `${ham} phải gọi quyenXemChuong`).toContain("quyenXemChuong(");
    }
    // Và `isPublic` vẫn là cột duy nhất mở chuồng ra, ở chỗ mới của nó.
    expect(gates).toContain("barn.isPublic");
  });
});
