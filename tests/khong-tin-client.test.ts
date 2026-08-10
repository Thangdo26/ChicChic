// §9.6 KHÔNG TIN CLIENT và §9.25 CHỮ NGƯỜI DÙNG GÕ.
//
// Mọi hàm ở đây chạy ở CẢ hai phía. Bản chạy ở client là để giao diện phản hồi ngay;
// bản chạy ở server mới là luật. Nên thứ cần khoá lại là: đưa rác vào thì ra cái gì.
import { describe, expect, it } from "vitest";
import { DECOR_BOUNDS, barnDisplayName, clampPlacement, cleanLine, normalizeMediaUrl } from "@/lib/decor";
import { clampQty, priceBreakdown } from "@/lib/pricing";
import { FLOCK_QTY } from "@/data/catalog";
import { WEIGHT_MAX, WEIGHT_MIN, daysLeft, isExpired, keepUntil, lotSummary } from "@/lib/harvest";
import { isOverdue, nextOccurrence } from "@/lib/tasks";

describe("§9.25 — cleanLine: chữ người dùng gõ", () => {
  it("cắt theo KÝ TỰ THẬT, không xẻ đôi emoji", () => {
    // `.slice(0, 3)` trên "🐔🐔🐔" ra một nửa cặp surrogate → ô vuông vỡ.
    const s = cleanLine("🐔🐔🐔🐔🐔", 3);
    expect(Array.from(s)).toHaveLength(3);
    expect(s).toBe("🐔🐔🐔");
  });

  it("giữ nguyên dấu tiếng Việt", () => {
    expect(cleanLine("Chuồng Nhà mình", 50)).toBe("Chuồng Nhà mình");
  });

  it("bỏ ký tự vô hình — gõ vào không thấy nhưng làm vỡ SVG một dòng", () => {
    const s = cleanLine("Nhà​‌mình", 50);
    expect(s).not.toMatch(/[​‌]/);
    expect(s).toBe("Nhà mình");
  });

  it("gộp khoảng trắng và cắt hai đầu", () => {
    expect(cleanLine("   Nhà    mình   ", 50)).toBe("Nhà mình");
  });

  it("rác vào thì ra chuỗi rỗng, không ra 'null'/'undefined'", () => {
    for (const raw of [null, undefined, "", "   ", {}, []]) {
      expect(cleanLine(raw, 50)).toBe("");
    }
  });

  it("tên chỉ toàn emoji vẫn dùng được cho biển tên", () => {
    expect(barnDisplayName(cleanLine("🐔", 50))).toBe("🐔");
  });

  it("barnDisplayName bóc được tên kiểu cũ mà không làm rỗng tên mới", () => {
    expect(barnDisplayName('Chuồng "Nhà mình"')).toBe("Nhà mình");
    expect(barnDisplayName("Nhà mình")).toBe("Nhà mình");
    // Không được trả về chuỗi rỗng dù tên chỉ có mỗi chữ "Chuồng".
    expect(barnDisplayName("Chuồng")).toBeTruthy();
  });
});

describe("§9.6 — vị trí trang trí ép lại ở server", () => {
  it("kéo ra ngoài khung thì bị ép về biên", () => {
    const p = clampPlacement({ x: -9999, y: 9999, scale: 99 });
    expect(p.x).toBe(DECOR_BOUNDS.minX);
    expect(p.y).toBe(DECOR_BOUNDS.maxY);
    expect(p.scale).toBe(DECOR_BOUNDS.maxScale);
  });

  it("NaN / chuỗi rác không lọt ra ngoài", () => {
    const p = clampPlacement({ x: NaN, y: "abc" as unknown as number, scale: undefined as unknown as number });
    for (const v of [p.x, p.y, p.scale]) expect(Number.isFinite(v)).toBe(true);
    expect(p.scale).toBe(1);
  });

  it("kết quả luôn nằm trong khung, với mọi đầu vào", () => {
    for (const x of [-1e9, 0, 100, 1e9]) {
      for (const y of [-1e9, 0, 100, 1e9]) {
        const p = clampPlacement({ x, y, scale: 1 });
        expect(p.x).toBeGreaterThanOrEqual(DECOR_BOUNDS.minX);
        expect(p.x).toBeLessThanOrEqual(DECOR_BOUNDS.maxX);
        expect(p.y).toBeGreaterThanOrEqual(DECOR_BOUNDS.minY);
        expect(p.y).toBeLessThanOrEqual(DECOR_BOUNDS.maxY);
      }
    }
  });
});

describe("§9.6 — giá tính lại ở server", () => {
  it("số lượng ngoài khoảng bị ép về khoảng cho phép", () => {
    expect(clampQty(-5)).toBe(FLOCK_QTY.min);
    expect(clampQty(9999)).toBe(FLOCK_QTY.max);
    expect(clampQty("abc")).toBe(FLOCK_QTY.default);
    expect(clampQty(null)).toBe(FLOCK_QTY.default);
  });

  it("tổng LUÔN là tổng ba phần — không có khoản nào rơi ra ngoài", () => {
    for (const line of ["LAYER", "BROILER"] as const) {
      for (const qty of [5, 7, 10]) {
        const b = priceBreakdown(line, "co-ban", qty);
        expect(b.nuoi + b.cong + b.tn).toBe(b.total);
        expect(b.total).toBeGreaterThan(0);
        expect(b.qty).toBe(qty);
      }
    }
  });

  it("chế độ ăn không tồn tại thì rơi về hệ số 1, không làm sập", () => {
    const a = priceBreakdown("LAYER", "khong-co-thuc", 5);
    const b = priceBreakdown("LAYER", "co-ban", 5);
    expect(a.total).toBeGreaterThan(0);
    expect(Number.isFinite(a.total)).toBe(true);
    expect(a.qty).toBe(b.qty);
  });

  it("gửi số lượng rác vẫn ra một hoá đơn hợp lệ", () => {
    const b = priceBreakdown("BROILER", "co-ban", NaN);
    expect(b.qty).toBe(FLOCK_QTY.default);
    expect(b.total).toBeGreaterThan(0);
  });
});

describe("§9.28 — hạn nông trại giữ hộ suy từ collectedAt", () => {
  const ngayTruoc = (n: number) => new Date(Date.now() - n * 86_400_000);

  it("đếm từ lúc THU, không phải lúc đăng bán", () => {
    const thu = ngayTruoc(3);
    expect(keepUntil(thu).getTime()).toBe(thu.getTime() + 7 * 86_400_000);
  });

  it("ranh giới hết hạn: còn 1 ngày thì chưa mất, quá 7 ngày thì mất", () => {
    expect(isExpired(ngayTruoc(6))).toBe(false);
    expect(daysLeft(ngayTruoc(6))).toBe(1);
    expect(isExpired(ngayTruoc(8))).toBe(true);
    expect(daysLeft(ngayTruoc(8))).toBeLessThanOrEqual(0);
  });

  it("khoảng cân hợp lệ của một con gà bao được gà ta lẫn gà to", () => {
    expect(WEIGHT_MIN).toBeLessThan(WEIGHT_MAX);
    expect(WEIGHT_MIN).toBeGreaterThan(0);
    // Gõ nhầm 18 thay 1,8 phải nằm NGOÀI khoảng của một con.
    expect(18).toBeGreaterThan(WEIGHT_MAX * 1);
  });

  it("mô tả lô nói đúng đơn vị của từng loại", () => {
    expect(lotSummary({ type: "EGG", qty: 12 })).toBe("12 quả");
    expect(lotSummary({ type: "MEAT", qty: 2, weightKg: 3.6 })).toContain("2 con");
    expect(lotSummary({ type: "MEAT", qty: 2, weightKg: 3.6 })).toContain("kg");
    // Chưa cân thì KHÔNG được bịa ra số cân.
    expect(lotSummary({ type: "MEAT", qty: 2, weightKg: null })).toBe("2 con");
  });
});

describe("giờ hẹn cho ăn", () => {
  it("giờ đã trôi qua hôm nay thì hẹn sang mai", () => {
    const truoc = new Date("2026-08-10T20:00:00");
    const at = nextOccurrence("06:30", truoc);
    expect(at.getTime()).toBeGreaterThan(truoc.getTime());
    expect(at.getDate()).toBe(11);
    expect(at.getHours()).toBe(6);
  });

  it("giờ chưa tới thì vẫn là hôm nay", () => {
    const truoc = new Date("2026-08-10T05:00:00");
    expect(nextOccurrence("06:30", truoc).getDate()).toBe(10);
  });

  it("chỉ việc CHƯA XONG mới bị coi là quá hạn", () => {
    const cu = new Date(Date.now() - 86_400_000);
    expect(isOverdue({ status: "OPEN", dueAt: cu })).toBe(true);
    expect(isOverdue({ status: "DONE", dueAt: cu })).toBe(false);
    expect(isOverdue({ status: "DECLINED", dueAt: cu })).toBe(false);
    // Không có giờ hẹn thì không bao giờ "quá hạn" — phần lớn việc rơi vào đây,
    // và đó là lý do vòng nhắc dùng TASK_STALE_DAYS chứ không dùng hàm này.
    expect(isOverdue({ status: "OPEN", dueAt: null })).toBe(false);
  });
});

describe("§11.4 — normalizeMediaUrl chặn được gì và KHÔNG chặn được gì", () => {
  it("chặn javascript: và data:", () => {
    expect(normalizeMediaUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeMediaUrl("data:text/html;base64,AAAA")).toBeNull();
    expect(normalizeMediaUrl("")).toBeNull();
    expect(normalizeMediaUrl("   ")).toBeNull();
  });

  it("nhận đường dẫn nội bộ và https", () => {
    expect(normalizeMediaUrl("/uploads/a.jpg")).toBe("/uploads/a.jpg");
    expect(normalizeMediaUrl("https://x.supabase.co/a.jpg")).toBe("https://x.supabase.co/a.jpg");
  });

  it("đổi link YouTube/Vimeo sang dạng nhúng không theo dõi người xem", () => {
    expect(normalizeMediaUrl("https://youtu.be/abc123")).toContain("youtube-nocookie.com/embed/abc123");
    expect(normalizeMediaUrl("https://vimeo.com/12345")).toContain("player.vimeo.com/video/12345");
  });

  it("VẪN nhận host bất kỳ — đây là khoảng trống đã biết (§11.4), không phải lỗi mới", () => {
    // Khoá lại hành vi hiện tại để ngày siết host thì phải sửa cả test này, tức là
    // phải đọc lại §11.4 chứ không siết nhầm rồi làm hỏng ảnh cũ.
    expect(normalizeMediaUrl("https://host-la-hoac.example/a.jpg")).toBeTruthy();
  });
});
