// HÀNG ĐỢI TIỀN - §11.49.
//
// Nông trại nợ người dùng theo hai chiều (`Refund` ra người mua, `Payout` ra người bán),
// cả hai đều **chi trả bằng tay** (§9.29). Trước Đợt 16 `lib/jobs.ts` nhắc tới `Refund`
// đúng 0 lần và `Payout` đúng 0 lần - tức quên một khoản là im lặng tuyệt đối, ở đúng
// chỗ nhạy cảm nhất của cả sản phẩm.
//
// Bộ này khoá hai thứ:
//  1. **Phép đo thời gian chờ** - hàm thuần, và nó là thứ quyết định cả câu chữ người
//     dùng đọc lẫn việc có gõ cửa người trực hay không.
//  2. **Đường dây** - việc nền có thật sự soi hai bảng đó không, và bốn cửa huỷ đơn có
//     giữ đúng ranh giới không.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NHAC_CHI_TRA_GIO, NHAC_HOAN_GIO, cauDangCho, daCho, daChoVi, quaHanXuLy,
} from "@/lib/hang-doi";

const T0 = new Date("2026-08-11T12:00:00Z").getTime();
const truoc = (gio: number) => new Date(T0 - gio * 3_600_000);

describe("đã chờ bao lâu", () => {
  it("đếm từ mốc gửi", () => {
    expect(daCho(truoc(5), T0)).toBe(5 * 3_600_000);
  });

  it("chưa gửi thì là null, KHÔNG phải 0", () => {
    // 0 đọc ra thành "vừa gửi xong"; null là "chưa có ai đang chờ". Trộn hai cái này là
    // gõ cửa người trực về những khoản chưa ai đòi - đúng thứ `NHAC_CHI_TRA_GIO` tránh.
    expect(daCho(null, T0)).toBeNull();
    expect(daCho(undefined, T0)).toBeNull();
    expect(daCho("khong-phai-ngay", T0)).toBeNull();
  });

  it("đồng hồ lệch về tương lai thì kẹp về 0, không ra số âm", () => {
    // Máy chủ lệch vài giây là chuyện thường, mà "đã chờ -3 giây" thì không đọc được.
    expect(daCho(new Date(T0 + 9_000), T0)).toBe(0);
  });
});

describe("chữ cho người đang chờ đọc", () => {
  it("thô theo giờ rồi theo ngày - không cần chính xác tới phút", () => {
    expect(daChoVi(0)).toBe("vừa gửi");
    expect(daChoVi(59 * 60_000)).toBe("vừa gửi");
    expect(daChoVi(5 * 3_600_000)).toBe("5 giờ trước");
    expect(daChoVi(23 * 3_600_000)).toBe("23 giờ trước");
    expect(daChoVi(50 * 3_600_000)).toBe("2 ngày trước");
  });

  it("chưa gửi thì nói chưa gửi, không nói 'vừa gửi'", () => {
    expect(daChoVi(null)).toBe("chưa gửi");
  });

  it("⭐ KHÔNG BAO GIỜ hứa một ngày cụ thể", () => {
    // Chi trả làm tay bởi một người thật (§9.29). "Xong trước thứ Sáu" là lời hứa hệ
    // thống không giữ được, và một lời hứa hụt ở chỗ tiền bạc đắt hơn nhiều so với việc
    // nói thật rằng chưa biết. Quét cả hai nhánh chữ.
    for (const ms of [1 * 3_600_000, 200 * 3_600_000]) {
      const cau = cauDangCho(ms, NHAC_HOAN_GIO);
      expect(cau).not.toMatch(/thứ (Hai|Ba|Tư|Năm|Sáu|Bảy)|ngày mai|trong \d+ ngày nữa|chậm nhất/i);
    }
  });

  it("quá mốc thì THỪA NHẬN là lâu và nói nông trại đã được nhắc", () => {
    // Người chờ 5 ngày cần đọc được rằng hệ thống biết họ đã chờ 5 ngày. Một câu đọc y
    // hệt nhau ở giờ thứ nhất và tuần thứ hai là thứ làm người ta nghĩ mình bị quên.
    const som = cauDangCho(2 * 3_600_000, NHAC_HOAN_GIO);
    const lau = cauDangCho(200 * 3_600_000, NHAC_HOAN_GIO);
    expect(som).not.toBe(lau);
    expect(lau).toContain("lâu hơn thường lệ");
    expect(lau).toContain("đã được nhắc");
    expect(som).toContain("2 giờ trước");
  });

  it("chưa gửi thì không nói 'đang chờ'", () => {
    expect(cauDangCho(null, NHAC_HOAN_GIO)).toBe("Chưa gửi yêu cầu.");
  });
});

describe("mốc gõ cửa người trực", () => {
  it("chưa tới mốc thì im, tới mốc thì kêu", () => {
    expect(quaHanXuLy(truoc(NHAC_HOAN_GIO - 1), NHAC_HOAN_GIO, T0)).toBe(false);
    expect(quaHanXuLy(truoc(NHAC_HOAN_GIO), NHAC_HOAN_GIO, T0)).toBe(true);
  });

  it("⭐ mốc RỖNG thì KHÔNG bao giờ quá hạn", () => {
    // `Payout.requestedAt = null` nghĩa là người bán chưa bấm rút. Coi null là "đã chờ
    // từ đầu thời gian" thì mọi khoản chưa ai đòi đều kêu lên, và người trực tắt chuông.
    expect(quaHanXuLy(null, NHAC_CHI_TRA_GIO, T0)).toBe(false);
    expect(quaHanXuLy(undefined, NHAC_CHI_TRA_GIO, T0)).toBe(false);
  });

  it("hoàn tiền nhắc SỚM HƠN chi trả", () => {
    // Người xin hoàn tiền đang thấy mình bị thiệt (hàng hỏng, chuồng trả lại); người bán
    // đang đợi một khoản đã chắc chắn là của mình. Hai loại kiên nhẫn khác nhau.
    expect(NHAC_HOAN_GIO).toBeLessThan(NHAC_CHI_TRA_GIO);
    expect(NHAC_HOAN_GIO).toBeGreaterThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// ĐƯỜNG DÂY - đọc mã nguồn.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, "..", "src");
const doc = (p: string) => readFileSync(join(SRC, ...p.split("/")), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
function thanHam(src: string, ten: string): string {
  const khuc = boChuThich(src).split(/(?:export )?async function /).slice(1);
  return khuc.find((k) => k.slice(0, k.indexOf("(")).trim() === ten) ?? "";
}

describe("§11.49 - việc nền phải SOI cả hai bảng tiền nợ", () => {
  const jobs = boChuThich(doc("lib/jobs.ts"));

  it("cron đọc bảng Refund", () => {
    // Con số cũ là **0 lần**. Đây là phép kiểm giữ cho nó không quay về 0.
    expect(jobs).toContain("prisma.refund.findMany");
    expect(jobs).toContain("NHAC_HOAN_GIO");
  });

  it("cron đọc bảng Payout", () => {
    expect(jobs).toContain("prisma.payout.findMany");
    expect(jobs).toContain("NHAC_CHI_TRA_GIO");
  });

  it("chỉ nhắc khoản chi NGƯỜI BÁN ĐÃ ĐÒI", () => {
    // `requestedAt: { not: null, ... }` - thiếu vế `not: null` là gõ cửa về mọi khoản
    // chưa ai yêu cầu rút, tức làm phiền vì một chuyện không ai đang đợi.
    expect(jobs).toMatch(/requestedAt:\s*\{\s*not:\s*null/);
  });

  it("giỏ rỗng bỏ quên được dọn, và dọn bằng XOÁ chứ không phải CANCELLED", () => {
    const than = thanHam(doc("lib/jobs.ts"), "cleanupEmptyCarts");
    expect(than).not.toBe("");
    expect(than).toContain("deleteMany");
    expect(than).toContain("listings: { none: {} }");
    // Chỉ giỏ CŨ: xoá giỏ dưới tay người đang gom là một thứ nhấp nháy không lý do.
    expect(than).toMatch(/createdAt:\s*\{\s*lt:/);
  });
});

describe("§11.49 - người mua tự huỷ được đơn CHƯA trả tiền", () => {
  const than = thanHam(doc("app/market-actions.ts"), "huyDon");

  it("có cửa huỷ và nó kiểm đúng chủ đơn", () => {
    expect(than).not.toBe("");
    expect(than).toContain("getSessionUser()");
    expect(than).toContain("don.buyerId !== me.id");
  });

  it("⭐ TỪ CHỐI đơn đã báo chuyển khoản", () => {
    // §9.34: `REPORTED` là đơn người mua đã nói "tôi chuyển rồi". Cho huỷ ở đây là mở
    // đúng cửa vừa đóng - tiền có thể đang trên đường mà lô đã nhả cho người khác.
    expect(than).toContain('don.status === "REPORTED"');
  });

  it("từ chối cả đơn đã thanh toán và đã giao", () => {
    expect(than).toContain('don.status === "PAID"');
    expect(than).toContain('don.status === "DELIVERED"');
  });

  it("xoá payCode khi huỷ - khoản chuyển muộn không được khớp vào đơn đã chết (§9.22)", () => {
    expect(than).toMatch(/payCode:\s*null/);
  });

  it("nhả lô và huỷ đơn trong CÙNG một transaction", () => {
    // Nửa vời theo chiều ngược lại là đơn đã huỷ mà lô vẫn bị giữ: không ai mua được,
    // và không ai đi tìm nữa vì đơn đã biến mất khỏi màn hình.
    expect(than).toContain("$transaction");
    expect(than).toContain("marketListing.updateMany");
  });

  it("tự kiểm: thanHam cắt đúng thân hàm", () => {
    const bo = thanHam(doc("app/market-actions.ts"), "boKhoiGio");
    expect(bo).not.toBe("");
    expect(bo).not.toContain("$transaction");
  });
});

describe("hai chỗ đọc giỏ phải đọc CÙNG một giỏ", () => {
  it("chotGio và gioDangMo cùng lấy giỏ CŨ NHẤT", () => {
    // Lỗi thật, đo được lúc thử tay Đợt 16: `gioDangMo` (chỗ bỏ hàng vào) có
    // `orderBy: createdAt asc`, `chotGio` thì không có `orderBy` nào - Postgres chọn
    // tuỳ ý. Tài khoản có hai giỏ `OPEN` (chuyện `gioDangMo` cố ý chấp nhận) thì bỏ
    // hàng vào xong bấm "Chốt đơn" nhận được **"Giỏ của bạn đang trống"**.
    const src = doc("app/market-actions.ts");
    for (const ham of ["chotGio", "gioDangMo"]) {
      const than = thanHam(src, ham);
      expect(than, `khong tim thay ${ham}`).not.toBe("");
      expect(than, `${ham} thieu orderBy`).toMatch(/orderBy:\s*\{\s*createdAt:\s*"asc"\s*\}/);
    }
  });
});
