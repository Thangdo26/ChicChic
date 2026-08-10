// DANH SÁCH NGÂN HÀNG (`lib/banks.ts`) — ô nhận tiền của người bán.
//
// Đây là dữ liệu mà **sai một ký tự thì tiền của người khác không về được**, và cái
// sai đó không lộ ra ở đâu cả: app vẫn lưu, vẫn hiện, chỉ tới lúc người trực nông trại
// ngồi chuyển khoản mới phát hiện — mà lúc đó người bán đã chờ mấy ngày.
import { describe, expect, it } from "vitest";
import { BANKS, bankTheoTen, donSoTaiKhoan, laBankHopLe } from "@/lib/banks";

describe("bảng ngân hàng", () => {
  it("mã BIN đúng 6 chữ số", () => {
    // BIN là khoá NAPAS dùng cho cả tra tên lẫn dựng QR chuyển tiền. Sai định dạng thì
    // cả hai cùng hỏng, và hỏng theo kiểu "không tìm thấy" khó lần ra.
    for (const b of BANKS) expect(b.bin, b.ten).toMatch(/^\d{6}$/);
  });

  it("không trùng BIN, không trùng tên", () => {
    // Trùng tên ⟹ ô chọn hiện hai dòng giống hệt nhau; trùng BIN ⟹ tra cứu trả về
    // ngân hàng khác.
    expect(new Set(BANKS.map((b) => b.bin)).size).toBe(BANKS.length);
    expect(new Set(BANKS.map((b) => b.ten)).size).toBe(BANKS.length);
  });

  it("có đủ những ngân hàng người Việt hay dùng nhất", () => {
    for (const t of ["Vietcombank", "BIDV", "Agribank", "VietinBank", "MB Bank", "Techcombank"]) {
      expect(laBankHopLe(t), t).toBe(true);
    }
  });

  it("tra được không phân biệt hoa thường và khoảng trắng thừa", () => {
    expect(bankTheoTen("  vietcombank ")?.bin).toBe("970436");
    expect(bankTheoTen("MB BANK")?.bin).toBe("970422");
  });

  it("tên lạ trả null chứ không đoán bừa", () => {
    // Tài khoản điền TRƯỚC bản này mang chuỗi tự do ("VCB", "ngoại thương"). Đoán bừa
    // ra một ngân hàng gần đúng là cách chuyển tiền nhầm nhà.
    expect(bankTheoTen("VCB")).toBeNull();
    expect(bankTheoTen("ngân hàng nào đó")).toBeNull();
    expect(bankTheoTen("")).toBeNull();
    expect(bankTheoTen(null)).toBeNull();
  });
});

describe("số tài khoản", () => {
  it("bỏ dấu cách và gạch người ta gõ cho dễ đọc", () => {
    expect(donSoTaiKhoan("1234 5678 9012")).toBe("123456789012");
    expect(donSoTaiKhoan("0011-0022-0033")).toBe("001100220033");
  });

  it("giữ chữ cái — có ngân hàng dùng số tài khoản có chữ", () => {
    expect(donSoTaiKhoan("VN12AB34")).toBe("VN12AB34");
  });

  it("cắt trần 24 ký tự, không ném lỗi với đầu vào rác", () => {
    expect(donSoTaiKhoan("9".repeat(80))).toHaveLength(24);
    expect(donSoTaiKhoan("")).toBe("");
    // @ts-expect-error — cố tình gọi sai kiểu: giá trị này tới từ FormData của client.
    expect(donSoTaiKhoan(null)).toBe("");
  });

  it("KHÔNG kiểm độ dài theo từng ngân hàng", () => {
    // Cố ý. Mỗi nhà một kiểu (VCB 13 số, MB 10–16, ví điện tử là số điện thoại) — đoán
    // sai thì app từ chối một số tài khoản CÓ THẬT, hỏng nặng hơn cái nó định ngăn.
    expect(donSoTaiKhoan("0987654321")).toBe("0987654321"); // ví điện tử
    expect(donSoTaiKhoan("1234567890123")).toBe("1234567890123"); // VCB
  });
});
