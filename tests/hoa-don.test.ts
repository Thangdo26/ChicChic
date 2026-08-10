// HOÁ ĐƠN TIỀN NUÔI (`lib/billing.ts`) — §7.16, §9.33.
//
// Đây là bộ kiểm đáng lo nhất trong repo: sai một dòng ở đây là **người thật bị tính sai
// tiền**, và họ chỉ phát hiện ra khi đã chuyển khoản. Không có phép kiểm nào ở đây là
// "cho đủ" — mỗi cái tương ứng một cách app có thể đòi sai.
import { describe, expect, it } from "vitest";
import {
  INVOICE_DELAY_DAYS, INVOICE_GRACE_DAYS, INVOICE_NHAC_TRUOC_NGAY,
  hanChot, hoaDonLabel, invoiceTinhTrang, kyHoaDon, laDinhKy,
  phatHanhLuc, soHoaDonCanCo, tienPhaiTra,
} from "@/lib/billing";

const NGAY = 86_400_000;
const moc = new Date("2026-03-10T09:00:00Z");
const sau = (n: number) => new Date(moc.getTime() + n * NGAY);

describe("hai dòng, hai nhịp", () => {
  it("gà đẻ trả hằng tháng, gà thịt trả một lần", () => {
    expect(laDinhKy("LAYER")).toBe(true);
    expect(laDinhKy("BROILER")).toBe(false);
  });

  it("gà thịt chỉ có ĐÚNG MỘT hoá đơn, dù bao lâu trôi qua", () => {
    // Đây là chỗ dễ sai nhất: dùng nhầm nhánh định kỳ cho gà thịt là mỗi tháng đòi thêm
    // một lần trọn giá lứa.
    for (const n of [1, 30, 200, 3000]) {
      expect(soHoaDonCanCo("BROILER", moc, sau(n))).toBe(1);
    }
  });

  it("gà thịt: hoá đơn phủ trọn lứa theo cycleDays", () => {
    const ky = kyHoaDon("BROILER", 1, moc, 75);
    expect(Math.round((ky.to.getTime() - ky.from.getTime()) / NGAY)).toBe(75);
  });
});

describe("thời điểm phát hành — phát sớm là đòi tiền sai", () => {
  it("chưa qua 1 ngày kể từ lúc kích hoạt thì CHƯA có hoá đơn nào", () => {
    expect(INVOICE_DELAY_DAYS).toBeGreaterThan(0);
    expect(soHoaDonCanCo("LAYER", moc, moc)).toBe(0);
    expect(soHoaDonCanCo("LAYER", moc, sau(0.5))).toBe(0);
    expect(soHoaDonCanCo("BROILER", moc, sau(0.9))).toBe(0);
  });

  it("qua 1 ngày thì có hoá đơn đầu", () => {
    expect(soHoaDonCanCo("LAYER", moc, sau(1.1))).toBe(1);
    expect(soHoaDonCanCo("BROILER", moc, sau(1.1))).toBe(1);
  });

  it("chuồng chưa kích hoạt (chưa cọc) thì KHÔNG nợ gì", () => {
    expect(soHoaDonCanCo("LAYER", null, sau(999))).toBe(0);
    expect(soHoaDonCanCo("BROILER", undefined, sau(999))).toBe(0);
  });
});

describe("gà đẻ — mỗi tháng một hoá đơn, không hơn không kém", () => {
  it("đếm đúng theo mốc THÁNG, không phải mỗi 30 ngày", () => {
    expect(soHoaDonCanCo("LAYER", moc, sau(2))).toBe(1);
    expect(soHoaDonCanCo("LAYER", moc, sau(29))).toBe(1);   // chưa tới mốc tháng
    expect(soHoaDonCanCo("LAYER", moc, sau(32))).toBe(2);
    expect(soHoaDonCanCo("LAYER", moc, sau(63))).toBe(3);
  });

  it("kỳ nối nhau KHÔNG hở, KHÔNG chồng", () => {
    // Hở một ngày là một ngày nuôi không ai trả; chồng một ngày là tính tiền hai lần.
    for (let seq = 1; seq <= 6; seq++) {
      const a = kyHoaDon("LAYER", seq, moc, 140);
      const b = kyHoaDon("LAYER", seq + 1, moc, 140);
      expect(a.to.getTime()).toBe(b.from.getTime());
    }
  });

  it("hoá đơn tháng sau phát hành ĐẦU kỳ — trả trước, không đòi sau", () => {
    const ky2 = kyHoaDon("LAYER", 2, moc, 140);
    expect(phatHanhLuc("LAYER", 2, moc).getTime()).toBe(ky2.from.getTime());
  });

  it("có trần — mốc sai không đẻ ra hàng nghìn hoá đơn", () => {
    const raatXa = new Date(moc.getTime() + 300 * 365 * NGAY);
    expect(soHoaDonCanCo("LAYER", moc, raatXa)).toBeLessThanOrEqual(60);
  });
});

describe("tiền — cọc trừ vào hoá đơn đầu", () => {
  it("hoá đơn đầu trừ đúng tiền cọc", () => {
    expect(tienPhaiTra(395_000, 50_000)).toBe(345_000);
  });

  it("không có cọc thì trả trọn", () => {
    expect(tienPhaiTra(218_000, 0)).toBe(218_000);
  });

  it("cọc lớn hơn giá kỳ thì về 0đ, KHÔNG ra số âm", () => {
    // Số âm ở đây nghĩa là app đang đòi ngược tiền của chính mình.
    expect(tienPhaiTra(30_000, 50_000)).toBe(0);
  });

  it("làm tròn về số nguyên đồng", () => {
    expect(Number.isInteger(tienPhaiTra(395_000.4, 50_000.6))).toBe(true);
  });
});

describe("hạn chót và trạng thái", () => {
  it("có khoảng ân hạn thật, không khoá ngay hôm sau", () => {
    // Chuyển khoản TAY: người ta có thể đi công tác, có thể đợi lương. Khoá vì bận ba
    // ngày là mất một khách hàng thật để đổi lấy một con số đúng lịch.
    expect(INVOICE_GRACE_DAYS).toBeGreaterThanOrEqual(5);
  });

  it("nhắc TRƯỚC khi khoá — báo sau là tin không làm gì được nữa", () => {
    expect(INVOICE_NHAC_TRUOC_NGAY).toBeGreaterThan(0);
    expect(INVOICE_NHAC_TRUOC_NGAY).toBeLessThan(INVOICE_GRACE_DAYS);
  });

  it("hạn tính từ lúc PHÁT HÀNH, không phải từ hôm nay", () => {
    // Chuồng bỏ quên ba tháng thì ba hoá đơn cũ phải quá hạn ngay, chứ không được reset
    // hạn về hôm nay mỗi lần người dùng mở app — đó là cách một khoản nợ sống mãi.
    const h = hanChot(phatHanhLuc("LAYER", 1, moc));
    expect(Math.round((h.getTime() - moc.getTime()) / NGAY)).toBe(INVOICE_DELAY_DAYS + INVOICE_GRACE_DAYS);
  });

  it("phân biệt đủ bốn trạng thái", () => {
    const due = (n: number) => new Date(Date.now() + n * NGAY);
    expect(invoiceTinhTrang({ paymentStatus: "CONFIRMED", dueAt: due(-99) })).toBe("da-tra");
    expect(invoiceTinhTrang({ paymentStatus: "UNPAID", dueAt: due(-1) })).toBe("qua-han");
    expect(invoiceTinhTrang({ paymentStatus: "UNPAID", dueAt: due(1) })).toBe("sap-den-han");
    expect(invoiceTinhTrang({ paymentStatus: "UNPAID", dueAt: due(30) })).toBe("chua-toi-han");
  });

  it("đã trả rồi thì KHÔNG BAO GIỜ là quá hạn, dù hạn đã trôi qua lâu", () => {
    // Nếu chỗ này sai thì một người đã trả tiền vẫn bị khoá chuồng — kiểu lỗi không ai
    // tha thứ.
    expect(invoiceTinhTrang({ paymentStatus: "CONFIRMED", dueAt: new Date(0) })).toBe("da-tra");
  });
});

describe("cách gọi kỳ", () => {
  it("gà đẻ phải nói rõ THÁNG THỨ MẤY", () => {
    // Hai hoá đơn giống hệt nhau cách nhau 30 ngày trông như bị tính trùng — và đó là
    // một cuộc gọi khiếu nại đáng lẽ không cần có.
    expect(hoaDonLabel("LAYER", 1)).not.toBe(hoaDonLabel("LAYER", 2));
    expect(hoaDonLabel("LAYER", 3)).toContain("3");
  });

  it("gà thịt nói rõ là trọn lứa", () => {
    expect(hoaDonLabel("BROILER", 1)).toMatch(/lứa/i);
  });
});
