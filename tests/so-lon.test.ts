// SỔ LỚN - cân nặng đàn gà thịt hằng tuần (`lib/weighin.ts`).
//
// Luật xuyên suốt bộ này: **không bịa một con số nào**. Nội suy một tuần bị bỏ lỡ, vẽ
// một đường cong "chuẩn" để so, hay dự đoán tuần tới - cả ba đều làm biểu đồ đẹp hơn
// và cả ba đều là nói dối về một con vật có thật (§9.11). Mấy phép kiểm dưới đây khoá
// đúng chỗ đó.
import { describe, expect, it } from "vitest";
import {
  WEIGH_GAM_MAX, WEIGH_GAM_MIN, WEIGH_MAU_TOI_THIEU,
  canLabel, clampGram, clampSample, mauLabel, tangSoVoiTruoc, tuanCanCan, tuanThu,
} from "@/lib/weighin";

const NGAY = 86_400_000;
const batDau = new Date("2026-03-02T08:00:00Z");
const sau = (n: number) => new Date(batDau.getTime() + n * NGAY);

describe("đếm tuần", () => {
  it("ngày đầu tiên là TUẦN 1, không phải tuần 0", () => {
    // Cô chú và chủ chuồng đều nói "tuần thứ nhất"; không ai nói "tuần thứ không".
    expect(tuanThu(batDau, batDau)).toBe(1);
    expect(tuanThu(batDau, sau(6))).toBe(1);
  });

  it("sang ngày thứ 7 là tuần 2", () => {
    expect(tuanThu(batDau, sau(7))).toBe(2);
    expect(tuanThu(batDau, sau(13))).toBe(2);
    expect(tuanThu(batDau, sau(14))).toBe(3);
  });

  it("không bao giờ trả số âm hay 0, kể cả khi mốc bắt đầu ở tương lai", () => {
    // Dữ liệu lệch giờ / seed sai ngày không được đẻ ra "tuần -3".
    expect(tuanThu(batDau, sau(-30))).toBe(1);
  });
});

describe("chặn số người dùng gõ (§9.6)", () => {
  it("nhận số cân trong khoảng hợp lệ", () => {
    expect(clampGram(1800)).toBe(1800);
    expect(clampGram("1800")).toBe(1800);
    expect(clampGram(1800.6)).toBe(1801);
  });

  it("từ chối số vô lý thay vì ép về biên", () => {
    // Ép về biên là âm thầm ghi một con số KHÁC cái cô chú gõ, rồi con số đó nằm vĩnh
    // viễn trong biểu đồ của chủ chuồng. Thà từ chối và bắt gõ lại.
    expect(clampGram(0)).toBeNull();
    expect(clampGram(-500)).toBeNull();
    expect(clampGram(WEIGH_GAM_MIN - 1)).toBeNull();
    expect(clampGram(WEIGH_GAM_MAX + 1)).toBeNull();
    expect(clampGram("nặng lắm")).toBeNull();
    expect(clampGram(null)).toBeNull();
    expect(clampGram(undefined)).toBeNull();
  });

  it("trần chặn được lỗi gõ thừa số 0", () => {
    // 1800 → 18000 là lỗi gõ hay gặp nhất, và nó biến đàn gà thành 18kg một con.
    expect(clampGram(18_000)).toBeNull();
  });

  it("số con lấy mẫu luôn ≥ 1 và có trần", () => {
    expect(clampSample(0)).toBe(1);
    expect(clampSample(-4)).toBe(1);
    expect(clampSample("rác")).toBe(1);
    expect(clampSample(3)).toBe(3);
    expect(clampSample(9999)).toBe(50);
  });
});

describe("cách viết số cân", () => {
  it("gà con tính bằng gam, gà lớn tính bằng kg", () => {
    // Viết "0,2kg" cho một con gà con 150g là làm mất hết ý nghĩa của con số.
    expect(canLabel(150)).toBe("150g");
    expect(canLabel(999)).toBe("999g");
    expect(canLabel(1800)).toBe("1,8kg");
    expect(canLabel(1000)).toBe("1,0kg");
  });

  it("dùng dấu PHẨY thập phân - đây là app tiếng Việt", () => {
    expect(canLabel(2350)).not.toContain(".");
  });
});

describe("mức tăng", () => {
  const p = [
    { weekNo: 2, avgGram: 400, sample: 3 },
    { weekNo: 3, avgGram: 700, sample: 3 },
    { weekNo: 5, avgGram: 1200, sample: 4 },
  ];

  it("điểm đầu tiên KHÔNG có mức tăng", () => {
    // Cố ý không so với một con số giả định lúc thả đàn - không ai cân gà con lúc mới
    // về, nên mọi số ở đó là bịa.
    expect(tangSoVoiTruoc(p, 0)).toBeNull();
  });

  it("so với lần cân LIỀN TRƯỚC, không chia đều cho số tuần đã trôi", () => {
    // Tuần 3 → tuần 5 là 500g, dù cách nhau hai tuần. Chia đều ra "250g/tuần" là dựng
    // một điểm cho tuần 4 mà không ai cân.
    expect(tangSoVoiTruoc(p, 1)).toBe(300);
    expect(tangSoVoiTruoc(p, 2)).toBe(500);
  });

  it("chỉ số ngoài mảng thì trả null, không ném lỗi", () => {
    expect(tangSoVoiTruoc(p, 99)).toBeNull();
    expect(tangSoVoiTruoc([], 0)).toBeNull();
  });
});

describe("lịch nhắc cân", () => {
  it("tuần này chưa cân thì trả về tuần này", () => {
    expect(tuanCanCan(batDau, [], sau(10))).toBe(2);
  });

  it("tuần này cân rồi thì thôi", () => {
    expect(tuanCanCan(batDau, [2], sau(10))).toBeNull();
  });

  it("KHÔNG đòi bù các tuần đã trôi qua", () => {
    // Bỏ lỡ tuần 2 và 3 thì quá khứ không cân lại được. Đòi bù chỉ tạo ra một danh
    // sách việc tồn đọng, mà người bị dội việc là người tắt thông báo (§9.8).
    expect(tuanCanCan(batDau, [], sau(28))).toBe(5);
    expect(tuanCanCan(batDau, [5], sau(28))).toBeNull();
  });
});

describe("nói thật về độ tin cậy", () => {
  it("mẫu ít thì PHẢI nói ra", () => {
    // "Trung bình 1,8kg" của 1 con và của 20 con là hai mức tin cậy khác hẳn nhau.
    // Giấu đi là để người đọc tự tưởng tượng một thứ chắc chắn hơn sự thật.
    expect(mauLabel(1)).toContain("1 con");
    expect(mauLabel(2)).toContain("mẫu ít");
    expect(mauLabel(WEIGH_MAU_TOI_THIEU)).not.toContain("mẫu ít");
    expect(mauLabel(10)).toContain("10 con");
  });

  it("mọi câu đều nói rõ ĐÃ CÂN MẤY CON", () => {
    for (const n of [1, 2, 3, 5, 20]) expect(mauLabel(n)).toMatch(/\d+ con/);
  });
});
