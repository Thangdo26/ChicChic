// NUÔI DƯỠNG ĐÀN NGHỈ HƯU (`lib/care.ts`) - phần tính toán và **§9.32**.
//
// Hai nhóm ở đây khác hẳn nhau về bản chất:
//  · nhóm đầu là số học (tiền, ngày tháng) - sai là mất tiền của một trong hai bên;
//  · nhóm cuối khoá một luật ĐẠO ĐỨC bằng code. Nghe lạ, nhưng §9.32 diễn đạt được:
//    lời nhắc về tiền không được lấy con vật của người ta ra làm đòn bẩy. Một câu chữ
//    trôi dần theo hướng "đóng tiền không thì…" là thứ rất dễ lọt qua review, nên nó
//    đáng có một phép kiểm chặn sẵn.
import { describe, expect, it } from "vitest";
import {
  CARE_MONTH_BLOCKS, CARE_NHAC_TRUOC_NGAY, CARE_TINH_TRANG_VI,
  careTotalVnd, khoiLabel, laKhoiHopLe, ngayConLai, phuTu, themThang, tinhTrang,
} from "@/lib/care";
import { RETIRE_CARE_VND } from "@/data/catalog";

const ngay = (n: number) => new Date(Date.now() + n * 86_400_000);

describe("khối tháng - không tin client (§9.6)", () => {
  it("nhận đúng những khối có trong bảng giá", () => {
    for (const m of CARE_MONTH_BLOCKS) expect(laKhoiHopLe(m)).toBe(true);
  });

  it("từ chối mọi thứ ngoài bảng", () => {
    // `999` là tự đặt cho mình hoá đơn 60 triệu; `0` và số âm là mua vĩnh viễn giá 0đ.
    for (const xau of [0, -1, -12, 1, 2, 4, 13, 999, 1e9, 3.5, NaN, Infinity]) {
      expect(laKhoiHopLe(xau)).toBe(false);
    }
    for (const xau of [null, undefined, "", "ba", {}, [], true]) {
      expect(laKhoiHopLe(xau)).toBe(false);
    }
  });
});

describe("tiền", () => {
  it("tính đúng theo giá đang niêm yết", () => {
    expect(careTotalVnd(3)).toBe(3 * RETIRE_CARE_VND);
    expect(careTotalVnd(12)).toBe(12 * RETIRE_CARE_VND);
  });

  it("KHÔNG giảm giá theo khối - mua 12 tháng đúng bằng 4 lần mua 3 tháng", () => {
    // Đây là lựa chọn có chủ ý, không phải quên (xem `CARE_MONTH_BLOCKS`): giảm giá ở
    // đây đẩy người ta cam kết xa hơn mức họ thật sự muốn cho một con vật đang sống.
    expect(careTotalVnd(12)).toBe(4 * careTotalVnd(3));
  });

  it("dùng được giá đã chốt của đơn cũ - bảng giá đổi không đổi đơn cũ", () => {
    expect(careTotalVnd(6, 50_000)).toBe(300_000);
  });

  it("không bao giờ ra số âm", () => {
    expect(careTotalVnd(-5)).toBe(0);
    expect(careTotalVnd(3, -1000)).toBe(0);
  });
});

describe("cộng tháng - theo LỊCH, không phải 30 ngày một tháng", () => {
  it("6 tháng từ 31/1 ra tháng 7, không phải '180 ngày sau'", () => {
    const r = themThang(new Date("2026-01-31T00:00:00Z"), 6);
    expect(r.getMonth()).toBe(6); // tháng 8 theo 0-index = 7; tháng 7 = 6
  });

  it("cộng 12 tháng là đúng một năm sau", () => {
    const goc = new Date("2026-03-15T00:00:00Z");
    expect(themThang(goc, 12).getFullYear()).toBe(goc.getFullYear() + 1);
  });

  it("không sửa mốc gốc", () => {
    const goc = new Date("2026-03-15T00:00:00Z");
    const truoc = goc.getTime();
    themThang(goc, 3);
    expect(goc.getTime()).toBe(truoc);
  });
});

describe("mua nối tiếp - trả tiền sớm KHÔNG được mất phần chồng lấn", () => {
  it("còn hạn thì kỳ mới bắt đầu từ lúc hạn cũ hết", () => {
    const han = ngay(40);
    expect(phuTu(han).getTime()).toBe(han.getTime());
  });

  it("hết hạn rồi thì bắt đầu từ bây giờ, KHÔNG truy thu quãng đứt (§9.32)", () => {
    // Quãng đứt là quãng nông trại đã nuôi không công. Bắt đầu từ mốc cũ nghĩa là người
    // ta trả tiền cho những ngày đã qua - tức một khoản nợ tự sinh ra.
    const bayGio = new Date();
    const r = phuTu(ngay(-90), bayGio);
    expect(r.getTime()).toBe(bayGio.getTime());
  });

  it("chưa mua kỳ nào thì bắt đầu từ bây giờ", () => {
    const bayGio = new Date();
    expect(phuTu(null, bayGio).getTime()).toBe(bayGio.getTime());
    expect(phuTu(undefined, bayGio).getTime()).toBe(bayGio.getTime());
  });
});

describe("tình trạng", () => {
  it("phân biệt đủ bốn trạng thái", () => {
    expect(tinhTrang(null)).toBe("chua-mua");
    expect(tinhTrang(ngay(120))).toBe("con-han");
    expect(tinhTrang(ngay(3))).toBe("sap-het");
    expect(tinhTrang(ngay(-3))).toBe("het-han");
  });

  it("nhắc TRƯỚC khi hết hạn, không báo sau khi đã mất (§9.28 cùng tinh thần)", () => {
    expect(CARE_NHAC_TRUOC_NGAY).toBeGreaterThan(0);
    expect(tinhTrang(ngay(CARE_NHAC_TRUOC_NGAY - 1))).toBe("sap-het");
  });

  it("ngayConLai âm khi đã quá hạn", () => {
    expect(ngayConLai(ngay(-10))!).toBeLessThan(0);
    expect(ngayConLai(null)).toBeNull();
  });
});

describe("§9.32 - không lấy con gà ra làm đòn bẩy thu tiền", () => {
  const CAU = Object.values(CARE_TINH_TRANG_VI);

  it("không câu nào doạ dẫm hay ra điều kiện", () => {
    // Danh sách này là những cách diễn đạt sẽ biến một lời nhắc thành một lời đe.
    const CAM = [
      /nếu không/i, /sẽ bị/i, /bắt buộc/i, /ngừng chăm/i, /dừng chăm/i,
      /trả lại đàn/i, /thu hồi/i, /phạt/i, /nợ quá hạn/i, /cảnh báo/i,
    ];
    for (const c of CAU) for (const re of CAM) expect(c).not.toMatch(re);
  });

  it("câu cho trạng thái quá hạn phải NÓI RÕ đàn vẫn được chăm", () => {
    // Đây là câu duy nhất người đang nợ tiền sẽ đọc. Im lặng ở đây để người ta tự tưởng
    // tượng ra điều tệ nhất cũng là một cách gây áp lực, chỉ là gián tiếp hơn.
    expect(CARE_TINH_TRANG_VI["het-han"]).toMatch(/vẫn được chăm/i);
  });

  it("bảng đủ khoá cho cả bốn trạng thái", () => {
    for (const k of ["chua-mua", "con-han", "sap-het", "het-han"] as const) {
      expect(CARE_TINH_TRANG_VI[k]?.length).toBeGreaterThan(5);
    }
  });
});

describe("cách gọi kỳ", () => {
  it("12 tháng đọc thành '1 năm' cho tự nhiên", () => {
    expect(khoiLabel(12)).toBe("1 năm");
    expect(khoiLabel(3)).toBe("3 tháng");
  });
});
