// HOÁ ĐƠN TIỀN NUÔI (`lib/billing.ts`) - §7.16, §9.33.
//
// Đây là bộ kiểm đáng lo nhất trong repo: sai một dòng ở đây là **người thật bị tính sai
// tiền**, và họ chỉ phát hiện ra khi đã chuyển khoản. Không có phép kiểm nào ở đây là
// "cho đủ" - mỗi cái tương ứng một cách app có thể đòi sai.
import { describe, expect, it } from "vitest";
import {
  INVOICE_DELAY_DAYS, INVOICE_GRACE_DAYS, INVOICE_NHAC_TRUOC_NGAY,
  hanChot, hoaDonLabel, invoiceTinhTrang, kyHoaDon, laDinhKy,
  kyConThieu, phatHanhLuc, soHoaDonCanCo, tienPhaiTra,
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

describe("thời điểm phát hành - phát sớm là đòi tiền sai", () => {
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

describe("gà đẻ - mỗi tháng một hoá đơn, không hơn không kém", () => {
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

  it("hoá đơn tháng sau phát hành ĐẦU kỳ - trả trước, không đòi sau", () => {
    const ky2 = kyHoaDon("LAYER", 2, moc, 140);
    expect(phatHanhLuc("LAYER", 2, moc).getTime()).toBe(ky2.from.getTime());
  });

  it("có trần - mốc sai không đẻ ra hàng nghìn hoá đơn", () => {
    const raatXa = new Date(moc.getTime() + 300 * 365 * NGAY);
    expect(soHoaDonCanCo("LAYER", moc, raatXa)).toBeLessThanOrEqual(60);
  });
});

describe("tiền - cọc trừ vào hoá đơn đầu", () => {
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

  it("nhắc TRƯỚC khi khoá - báo sau là tin không làm gì được nữa", () => {
    expect(INVOICE_NHAC_TRUOC_NGAY).toBeGreaterThan(0);
    expect(INVOICE_NHAC_TRUOC_NGAY).toBeLessThan(INVOICE_GRACE_DAYS);
  });

  it("hạn tính từ lúc PHÁT HÀNH, không phải từ hôm nay", () => {
    // Chuồng bỏ quên ba tháng thì ba hoá đơn cũ phải quá hạn ngay, chứ không được reset
    // hạn về hôm nay mỗi lần người dùng mở app - đó là cách một khoản nợ sống mãi.
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
    // Nếu chỗ này sai thì một người đã trả tiền vẫn bị khoá chuồng - kiểu lỗi không ai
    // tha thứ.
    expect(invoiceTinhTrang({ paymentStatus: "CONFIRMED", dueAt: new Date(0) })).toBe("da-tra");
  });
});

describe("cách gọi kỳ", () => {
  it("gà đẻ phải nói rõ THÁNG THỨ MẤY", () => {
    // Hai hoá đơn giống hệt nhau cách nhau 30 ngày trông như bị tính trùng - và đó là
    // một cuộc gọi khiếu nại đáng lẽ không cần có.
    expect(hoaDonLabel("LAYER", 1)).not.toBe(hoaDonLabel("LAYER", 2));
    expect(hoaDonLabel("LAYER", 3)).toContain("3");
  });

  it("gà thịt nói rõ là trọn lứa", () => {
    expect(hoaDonLabel("BROILER", 1)).toMatch(/lứa/i);
  });
});

// ---------------------------------------------------------------------------
// LỨA MỚI (§11.17). Trước bản này bấm "nuôi lứa mới" là được nuôi thêm trọn một lứa
// **không tốn đồng nào**: mốc tính tiền luôn là ngày cọc, mà `soHoaDonCanCo` với gà thịt
// trả đúng 1 mãi mãi. Đây là lỗ doanh thu lớn nhất còn lại của repo lúc vá.
// ---------------------------------------------------------------------------

describe("kyConThieu - lứa đầu (seqBase = 0, y như trước khi có cột mốc)", () => {
  it("gà thịt: một lứa đúng một kỳ, và chỉ phát một lần", () => {
    expect(kyConThieu("BROILER", moc, 0, [], sau(2))).toEqual([{ kySo: 1, seq: 1 }]);
    expect(kyConThieu("BROILER", moc, 0, [1], sau(2))).toEqual([]);
    // Trôi thêm nửa năm cũng không đẻ ra kỳ thứ hai - lứa vẫn là lứa đó.
    expect(kyConThieu("BROILER", moc, 0, [1], sau(200))).toEqual([]);
  });

  it("gà đẻ: thêm một kỳ mỗi mốc tháng, không phát trùng cái đã có", () => {
    const ba = kyConThieu("LAYER", moc, 0, [], sau(70));
    expect(ba.map((x) => x.seq)).toEqual([1, 2, 3]);
    expect(kyConThieu("LAYER", moc, 0, [1, 2], sau(70))).toEqual([{ kySo: 3, seq: 3 }]);
  });

  it("chưa tới lúc thì KHÔNG phát gì - phát sớm là đòi tiền sai", () => {
    expect(kyConThieu("BROILER", moc, 0, [], moc)).toEqual([]);
    expect(kyConThieu("BROILER", null, 0, [], sau(99))).toEqual([]);
  });
});

describe("kyConThieu - lứa thứ hai trở đi", () => {
  const mocMoi = sau(100); // bấm "nuôi lứa mới" 100 ngày sau khi nhận chuồng

  it("gà thịt: lứa mới ĐẺ RA MỘT HOÁ ĐƠN MỚI - đây là chính cái lỗ đã vá", () => {
    const r = kyConThieu("BROILER", mocMoi, 1, [1], new Date(mocMoi.getTime() + 2 * NGAY));
    expect(r).toEqual([{ kySo: 1, seq: 2 }]);
  });

  it("...và lứa thứ ba nữa, không dừng lại ở hai", () => {
    const mocBa = sau(200);
    expect(kyConThieu("BROILER", mocBa, 2, [1, 2], new Date(mocBa.getTime() + 2 * NGAY)))
      .toEqual([{ kySo: 1, seq: 3 }]);
  });

  it("kỳ tính theo MỐC LỨA MỚI, không theo ngày cọc", () => {
    // `kySo` quay về 1 nên `kyHoaDon`/`phatHanhLuc` nhận đúng mốc mới. Lẫn hai số này là
    // phát một hoá đơn quá hạn ngay lúc vừa sinh ra, vì hạn tính từ ngày cọc năm ngoái.
    const [x] = kyConThieu("BROILER", mocMoi, 1, [1], new Date(mocMoi.getTime() + 2 * NGAY));
    expect(x.kySo).toBe(1);
    expect(phatHanhLuc("BROILER", x.kySo, mocMoi).getTime())
      .toBe(mocMoi.getTime() + INVOICE_DELAY_DAYS * NGAY);
    expect(hanChot(phatHanhLuc("BROILER", x.kySo, mocMoi)).getTime())
      .toBeGreaterThan(mocMoi.getTime());
  });

  it("gà đẻ: KHÔNG truy thu những tháng chuồng nằm chờ quyết định", () => {
    // Chuồng ở `END_OF_LAY` hai tháng rồi mới bấm lứa mới. Nếu vẫn đếm từ ngày cọc thì
    // `ensureInvoices` dựng luôn cả hai tháng không ai nuôi - lỗi ngược chiều, thiệt cho
    // người dùng, và cũng do đúng cột mốc này chữa.
    const r = kyConThieu("LAYER", mocMoi, 3, [1, 2, 3], new Date(mocMoi.getTime() + 2 * NGAY));
    expect(r).toEqual([{ kySo: 1, seq: 4 }]);
  });

  it("seq KHÔNG BAO GIỜ quay lại số đã dùng - đụng khoá là nuốt mất hoá đơn", () => {
    // `@@unique([barnId, seq])` + `skipDuplicates` nghĩa là một seq trùng bị **bỏ im
    // lặng**: chuồng nuôi trọn lứa mà không có hoá đơn nào, không ai biết.
    const daCo = [1, 2, 3];
    const r = kyConThieu("LAYER", mocMoi, 3, daCo, new Date(mocMoi.getTime() + 70 * NGAY));
    expect(r.every((x) => !daCo.includes(x.seq))).toBe(true);
    expect(r.map((x) => x.seq)).toEqual([4, 5, 6]);
    // Và `kySo` vẫn đếm lại từ 1 trong lứa này.
    expect(r.map((x) => x.kySo)).toEqual([1, 2, 3]);
  });
});

describe("nhãn hoá đơn của lứa thứ hai", () => {
  it("gà thịt nói rõ LỨA THỨ MẤY từ lứa hai trở đi", () => {
    // Hai tờ "Tiền nuôi trọn lứa" giống hệt nhau nằm cạnh nhau trong sổ là đúng cái nhầm
    // mà nhãn của gà đẻ đang phòng, chỉ khác dòng gà.
    expect(hoaDonLabel("BROILER", 1)).toBe("Tiền nuôi trọn lứa");
    expect(hoaDonLabel("BROILER", 2)).not.toBe(hoaDonLabel("BROILER", 1));
    expect(hoaDonLabel("BROILER", 2)).toContain("2");
    expect(hoaDonLabel("BROILER", 3)).toContain("3");
  });
});
