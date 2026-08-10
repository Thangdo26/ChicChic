// BẤT BIẾN §9 — những luật diễn đạt được bằng code.
//
// Đây là phần đáng giá nhất của cả bộ kiểm. Mỗi `it` dưới đây tương ứng MỘT dòng
// trong CODEMAP §9, và tồn tại để lần sửa sau không âm thầm nới nó ra. Sửa một test
// ở file này thì phải sửa cả CODEMAP — nếu không, một trong hai đang nói dối.
import { describe, expect, it } from "vitest";
import { CLOSED_STAGES, plannedStage, stageLabel, type FlockStage } from "@/lib/flock";
import { MARKET_FEE_PERCENT, lotMoney, priceFor, type PriceRow } from "@/lib/market";
import { TASK_META, type TaskKind } from "@/lib/tasks";
import { NOTIFY_ICON, type NotifyKind } from "@/lib/notify-meta";
import { LOT_EXPIRY_WARN_DAYS, LOT_KEEP_DAYS, LOT_STATUS_VI, type LotStatus } from "@/lib/harvest";
import { PAY_PREFIX, newPayCode, parsePayCode } from "@/lib/decor";

const ngayTruoc = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("§9.30 — việc nền chỉ đổi thứ suy được từ LỊCH", () => {
  // Đây là bất biến dễ phá nhất của repo: thêm một nhánh `return "LAYING"` vào
  // `plannedStage` là code chạy đúng, test cũ vẫn xanh, và app bắt đầu khẳng định
  // "đàn đang đẻ" chỉ vì hôm nay là ngày thứ 140 — thứ sản phẩm này được dựng để
  // không làm. Nên phải có một phép kiểm quét MỌI đường đi.
  it("KHÔNG BAO GIỜ trả về LAYING hay HARVESTED, dù ở tuổi nào", () => {
    const stages: FlockStage[] = ["BROODING", "GROWING", "LAYING", "FINISHING"];
    const lines = ["LAYER", "BROILER"] as const;
    const ket: (FlockStage | null)[] = [];

    for (const stage of stages) {
      for (const productLine of lines) {
        for (const cycleDays of [1, 75, 140, 365]) {
          // Quét cả tuổi âm (đàn đặt lịch cho tương lai) tới quá hạn rất xa.
          for (const age of [-5, 0, 1, 20, 21, 22, 64, 65, 66, 139, 140, 141, 5000]) {
            ket.push(plannedStage({ productLine, stage, startDate: ngayTruoc(age), cycleDays }));
          }
        }
      }
    }
    expect(ket).not.toContain("LAYING");
    expect(ket).not.toContain("HARVESTED");
    expect(ket).not.toContain("RETIRED");
  });

  it("không bao giờ kéo NGƯỢC một đàn đã khép hoặc đang chờ quyết định", () => {
    for (const stage of [...CLOSED_STAGES, "END_OF_LAY" as FlockStage]) {
      expect(plannedStage({
        productLine: "LAYER", stage, startDate: ngayTruoc(5000), cycleDays: 140,
      })).toBeNull();
    }
  });

  it("hết chu kỳ thì CẢ HAI dòng đều được hỏi, không dòng nào bị bỏ quên", () => {
    for (const productLine of ["LAYER", "BROILER"] as const) {
      expect(plannedStage({
        productLine, stage: "GROWING", startDate: ngayTruoc(200), cycleDays: 140,
      })).toBe("END_OF_LAY");
    }
  });

  it("gà thịt hết lứa KHÔNG được gọi là 'hết chu kỳ đẻ'", () => {
    // §9.30: cùng một enum, hai cách gọi. Gọi một lứa gà thịt là "hết chu kỳ đẻ" là
    // nói sai về chính con vật người ta đang nuôi.
    expect(stageLabel("END_OF_LAY", "BROILER")).not.toMatch(/đẻ/);
    expect(stageLabel("HARVESTED", "BROILER")).not.toMatch(/đẻ/);
    expect(stageLabel("END_OF_LAY", "LAYER")).toMatch(/đẻ/);
  });
});

describe("§9.29 — sổ tiền của chợ phải cân", () => {
  it("feeVnd + netVnd === priceVnd, với mọi giá và mọi số lượng", () => {
    for (const unitVnd of [1, 7, 999, 4_500, 33_333, 250_000]) {
      for (const qty of [1, 3, 7, 12, 29, 300]) {
        const m = lotMoney(unitVnd, { type: "EGG", qty });
        expect(m.feeVnd + m.netVnd).toBe(m.priceVnd);
      }
      for (const weightKg of [0.8, 1.35, 1.8, 2.47, 5]) {
        const m = lotMoney(unitVnd, { type: "MEAT", qty: 1, weightKg });
        expect(m.feeVnd + m.netVnd).toBe(m.priceVnd);
      }
    }
  });

  it("netVnd là HIỆU, không phải một phép nhân độc lập", () => {
    // Chỗ này từng là `Math.round(priceVnd * 0.8)`. Với 4.505đ hai cách lệch nhau 1đ
    // và lúc đó sổ không cân mà không ai biết mất đồng nào.
    const m = lotMoney(4_505, { type: "EGG", qty: 1 });
    expect(m.netVnd).toBe(m.priceVnd - m.feeVnd);
  });

  it("lô gà thịt chưa cân thì ra 0đ, không ra NaN", () => {
    const m = lotMoney(150_000, { type: "MEAT", qty: 2, weightKg: null });
    expect(m.priceVnd).toBe(0);
    expect(Number.isNaN(m.priceVnd)).toBe(false);
  });

  it("phí giữ đúng mức đã in ra cho người bán đọc", () => {
    expect(MARKET_FEE_PERCENT).toBe(20);
    const m = lotMoney(1_000, { type: "EGG", qty: 10 });
    expect(m.feeVnd).toBe(2_000);
    expect(m.netVnd).toBe(8_000);
  });
});

describe("giá niêm yết — khớp giống trước, rồi mới rơi về dòng chung", () => {
  const rows: PriceRow[] = [
    { type: "MEAT", breedSlug: null, unitVnd: 120_000, effectiveFrom: ngayTruoc(30) },
    { type: "MEAT", breedSlug: "ga-mia", unitVnd: 180_000, effectiveFrom: ngayTruoc(10) },
    { type: "MEAT", breedSlug: null, unitVnd: 130_000, effectiveFrom: ngayTruoc(2) },
    // Giá đặt trước cho ngày mai — CHƯA được áp dụng.
    { type: "EGG", breedSlug: null, unitVnd: 9_999, effectiveFrom: ngayTruoc(-1) },
    { type: "EGG", breedSlug: null, unitVnd: 5_000, effectiveFrom: ngayTruoc(5) },
  ];

  it("có dòng cho giống đó thì dùng dòng đó", () => {
    expect(priceFor(rows, "MEAT", "ga-mia")).toBe(180_000);
  });
  it("không có thì rơi về dòng chung MỚI NHẤT", () => {
    expect(priceFor(rows, "MEAT", "ga-ri")).toBe(130_000);
    expect(priceFor(rows, "MEAT", null)).toBe(130_000);
  });
  it("KHÔNG dùng dòng chưa tới hiệu lực", () => {
    expect(priceFor(rows, "EGG", null)).toBe(5_000);
  });
  it("chưa niêm yết thì trả null — chỗ gọi phải từ chối, không được đoán", () => {
    expect(priceFor([], "EGG", null)).toBeNull();
  });
});

describe("bảng tra phải đủ khoá — thiếu một khoá là sập lúc chạy", () => {
  // TS đã ép `Record<TaskKind, …>` đủ khoá, nhưng những chỗ đọc bằng
  // `TASK_META[t.kind as TaskKind]` thì ép kiểu đã che mất: một giá trị enum mới
  // trong DB mà quên thêm vào bảng sẽ ra `undefined.emoji` giữa trang.
  const KINDS: TaskKind[] = [
    "DECOR", "RANGE_OUT", "RANGE_IN", "FEED", "CHECK", "GEAR", "DELIVER", "HARVEST", "HANDOVER",
  ];
  it.each(KINDS)("TASK_META có đủ 4 trường cho %s", (k) => {
    const m = TASK_META[k];
    expect(m.emoji.length).toBeGreaterThan(0);
    expect(m.label.length).toBeGreaterThan(0);
    expect(m.doing.length).toBeGreaterThan(10);
    // `proof` là câu nói cho nông dân biết phải chụp cái gì — §9.1 sống hay chết ở đây.
    expect(m.proof.length).toBeGreaterThan(10);
  });

  const NOTIFY: NotifyKind[] = [
    "TASK_NEW", "TASK_DONE", "TASK_DECLINED", "TASK_CANCELLED", "BARN_UPDATE",
    "PAYMENT", "BARN_ASSIGNED", "BARN_RETURNED", "ACCOUNT", "MILESTONE", "MESSAGE",
  ];
  it.each(NOTIFY)("NOTIFY_ICON có icon cho %s", (k) => {
    expect(NOTIFY_ICON[k]).toBeTruthy();
  });

  const LOT: LotStatus[] = ["AT_FARM", "LISTED", "SOLD", "CLAIMED", "DELIVERED", "EXPIRED"];
  it.each(LOT)("LOT_STATUS_VI có nhãn cho %s", (s) => {
    expect(LOT_STATUS_VI[s]).toBeTruthy();
  });

  it("nhãn DELIVERED dùng chung được cho cả lô bán lẫn lô nhận về nhà", () => {
    // Cùng một giá trị enum cho hai luồng, nên câu chữ không được nghiêng về một bên.
    expect(LOT_STATUS_VI.DELIVERED).not.toMatch(/người mua/);
  });
});

describe("§9.28 — hạn giữ hộ và lời nhắc phải nhất quán", () => {
  it("nhắc TRƯỚC khi hết hạn, không phải đúng lúc đã mất", () => {
    expect(LOT_EXPIRY_WARN_DAYS).toBeGreaterThan(0);
    expect(LOT_EXPIRY_WARN_DAYS).toBeLessThan(LOT_KEEP_DAYS);
  });
});

describe("§9.22 — mã chuyển khoản: bóc được thì chắc, không thì null", () => {
  it("ba loại đơn sinh ra ba tiền tố KHÁC nhau", () => {
    // Tra nhầm bảng là cộng tiền cho đơn của người khác (§10).
    const kinds = ["COC", "DECOR", "MARKET"] as const;
    const chars = kinds.map((k) => newPayCode(k)[PAY_PREFIX.length]);
    expect(new Set(chars).size).toBe(3);
  });

  it("mã sinh ra thì bóc lại đúng loại và đúng chuỗi", () => {
    for (const kind of ["COC", "DECOR", "MARKET"] as const) {
      const code = newPayCode(kind);
      expect(parsePayCode(code)).toEqual({ kind, code });
      // Nội dung ngân hàng thật: có chữ, có số, mã nằm giữa.
      expect(parsePayCode(`CT tu 0123456 ${code} GD 987654-060825`)).toEqual({ kind, code });
      expect(parsePayCode(code.toLowerCase())).toEqual({ kind, code });
    }
  });

  it("mã chỉ gồm A–Z 0–9, không khoảng trắng", () => {
    for (let i = 0; i < 40; i++) {
      expect(newPayCode("COC")).toMatch(/^[A-Z0-9]+$/);
    }
  });

  it("bảng chữ bỏ những ký tự dễ nhìn nhầm", () => {
    // 0/O và 1/I/L — người ta đọc mã trên màn hình rồi gõ vào app ngân hàng.
    const duoi = Array.from({ length: 300 }, () => newPayCode("COC").slice(PAY_PREFIX.length + 1)).join("");
    for (const c of ["0", "O", "1", "I", "L"]) expect(duoi).not.toContain(c);
  });

  it("không bóc được thì trả null — đó là mệnh lệnh DỪNG, không phải gợi ý đoán tiếp", () => {
    for (const raw of ["", null, undefined, "CT tu 0123456 GD 987654", "CHIC", "CHICX ABC123", "CHICCABC"]) {
      expect(parsePayCode(raw as string)).toBeNull();
    }
  });
});
