// FAMILY LEARNING - Epic 6: mong muốn của bé + báo cáo tuần cho cha mẹ.
//
// Bộ kiểm này canh năm thứ, và bốn trong năm **chỉ đọc được từ mã nguồn** - `tsc`, `lint`
// và `build` đều cho chúng đi qua:
//
//  1. **Mong muốn của bé KHÔNG có tác động thật nào** (FL-D06/D07). Đây là luật quan trọng
//     nhất của cả Epic: nó là lý do một cái nút được phép nằm trong tay đứa trẻ 5 tuổi.
//  2. **Chỉ CHA MẸ mới biến một mong muốn thành việc thật**, và chỉ ở đúng một hàm (FL-D22).
//  3. **Catalog đóng**: khoá lạ bị từ chối, không có chữ tự do của trẻ ở bất cứ đâu.
//  4. **Báo cáo tuần không phải bảng điểm của một đứa trẻ** (§18.2).
//  5. **Một cái chuông mỗi nhà mỗi tuần**, và không có gì để nói thì không gửi.
//
// Không nối DB, không dựng server. Phần phải chạy thật ghi ở CODEMAP §13.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MONG_MUON, NHAN_NHOM, NGAY_HET_HAN_MONG_MUON, TRAN_CARE_WISH_TUAN, TRAN_DANG_CHO_MOI_BE,
  type LoaiMongMuon, nhomMongMuon, timMongMuon,
} from "@/lib/de-xuat-meta";
import { TU_CAM_BAO_CAO, TU_CAM_NOI_DUNG, cauChuongTuan, cauTuanNay } from "@/lib/bai-hoc-meta";
import { DECOR_ITEMS } from "@/data/catalog";

const doc = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ACTIONS = boChuThich(doc("src/app/learning-actions.ts"));
const DE_XUAT = boChuThich(doc("src/lib/de-xuat.ts"));
const JOBS = boChuThich(doc("src/lib/jobs.ts"));
const SCHEMA = doc("prisma/schema.prisma");

/** Thân một hàm: từ chỗ khai tới `export`/`function` kế tiếp ở đầu dòng. */
function than(src: string, ten: string): string {
  const i = src.search(new RegExp(`(export )?async function ${ten}\\b`));
  if (i < 0) return "";
  const j = src.slice(i + 10).search(/\n(export |async function |function |const )/);
  return j < 0 ? src.slice(i) : src.slice(i, i + 10 + j);
}

const LOAI: LoaiMongMuon[] = ["CARE_WISH", "DECOR_WISH", "CURATED_FARM_QUESTION", "FAMILY_ACTIVITY_WISH"];

// ---------------------------------------------------------------------------
// 1. Mong muốn của bé không có tác động thật
// ---------------------------------------------------------------------------

describe("§9.41 - mong muốn của bé KHÔNG làm gì cả", () => {
  it("⭐ hành động của bé không tạo việc, không đơn hàng, không đụng tiền", () => {
    // Đây là luật nền của Epic 6. Một dòng `upsertTask` lọt vào đây nghĩa là một đứa trẻ 5
    // tuổi vừa được trao quyền sai người thật ngoài đời đi làm việc - và không ai duyệt.
    const t = than(ACTIONS, "guiMongMuon");
    expect(t.length, "không tìm thấy thân hàm guiMongMuon").toBeGreaterThan(200);
    for (const cam of [
      "upsertTask", "barnTask", "decorOrder", "marketOrder", "harvestLot", "payout",
      "confirmDecorPaid", "installDecor", "createDecorOrder", "notify(",
    ]) {
      expect(t.includes(cam), `guiMongMuon chứa "${cam}"`).toBe(false);
    }
  });

  it("⭐ hành động của bé đi qua ĐÚNG cổng khu của bé", () => {
    const t = than(ACTIONS, "guiMongMuon");
    expect(t).toContain("moKhuCuaBe");
    // Cổng TRƯỚC phép ghi, không phải sau.
    expect(t.indexOf("moKhuCuaBe")).toBeLessThan(t.indexOf("taoMongMuon"));
    // Và có hàng rào tần suất (§9.35).
    expect(t).toContain("mong-muon-cua-be");
  });

  it("⭐ dòng ghi ra LUÔN là PENDING - không có đường nào ghi thẳng REVIEWED", () => {
    const t = than(DE_XUAT, "taoMongMuon");
    expect(t).toContain("childSuggestion.create");
    // `status` không được có mặt trong `data` của phép tạo: mặc định của DB là `PENDING`,
    // và không đặt tay chính là cách chắc chắn nhất để không ai đặt nhầm.
    const iData = t.indexOf("data: {");
    expect(t.slice(iData, t.indexOf("});", iData)).includes("status")).toBe(false);
    expect(SCHEMA).toContain("status    ChildSuggestionStatus @default(PENDING)");
  });

  it("⭐ bảng ChildSuggestion không có cột nào nhận chữ tự do của trẻ", () => {
    // FL-D21: "không free text". Một cột `note`/`message`/`voice` ở đây là một đường đưa
    // chữ chưa ai đọc của một đứa trẻ ra ngoài - và gửi rồi thì không rút lại được.
    const i = SCHEMA.indexOf("model ChildSuggestion {");
    expect(i).toBeGreaterThan(-1);
    const than_ = SCHEMA.slice(i, SCHEMA.indexOf("\n}", i));
    for (const cam of ["note", "message", "text", "comment", "voice", "audio", "photo", "media"]) {
      expect(than_.toLowerCase().includes(`  ${cam}`), `có cột "${cam}"`).toBe(false);
    }
  });

  it("⭐ ĐÚNG MỘT cửa ghi ChildSuggestion", () => {
    // Ba luật ở trên đều sống ở đúng cái cửa đó, nên một đường ghi thứ hai là mất cả ba.
    const nguon = [
      "src/app/learning-actions.ts", "src/app/family-actions.ts", "src/lib/bai-hoc.ts",
      "src/lib/jobs.ts", "src/lib/family.ts",
    ];
    for (const f of nguon) {
      const s = boChuThich(doc(f));
      for (const m of s.matchAll(/childSuggestion\.(\w+)/g)) {
        // `updateMany` ở `learning-actions` là phép **đổi trạng thái** của cha mẹ - hợp lệ.
        // `count` là phép đọc. Mọi phép TẠO phải ở `lib/de-xuat.ts`.
        expect(["updateMany", "count", "findMany", "findFirst"], `${f}: ${m[0]}`).toContain(m[1]);
      }
    }
    expect(DE_XUAT).toContain("prisma.childSuggestion.create(");
  });
});

// ---------------------------------------------------------------------------
// 2. Chỉ cha mẹ mới biến mong muốn thành việc thật (FL-D22)
// ---------------------------------------------------------------------------

describe("§9.41 - chỉ cha mẹ tạo được việc thật", () => {
  it("⭐ CHỈ `nhoCoChuLam` tạo việc; hai hành động trả lời kia không đụng gì", () => {
    for (const ham of ["traLoiMongMuon", "ghiNhoMongMuon", "boQuaMongMuon"]) {
      const t = than(ACTIONS, ham);
      expect(t.includes("upsertTask"), `${ham} tạo việc`).toBe(false);
      expect(t.includes("decorOrder"), `${ham} đặt hàng`).toBe(false);
    }
    expect(than(ACTIONS, "nhoCoChuLam")).toContain("upsertTask");
  });

  it("⭐ cổng của cha mẹ đòi CẢ sở hữu hồ sơ LẪN sở hữu chuồng", () => {
    const t = than(DE_XUAT, "moMongMuon");
    expect(t).toContain("parentId");
    expect(t).toContain("ownerId !== parentId");
    expect(t).toContain("return null");
    // Suất phải còn sống: nhà đã rút khỏi chương trình không nhờ thêm việc được.
    expect(t).toContain('status: "ACTIVE"');
  });

  it("⭐ ba hành động của cha mẹ đều đi qua đúng cổng đó", () => {
    for (const ham of ["traLoiMongMuon", "nhoCoChuLam"]) {
      expect(than(ACTIONS, ham), ham).toContain("mongMuonCuaToi");
    }
    expect(than(ACTIONS, "mongMuonCuaToi")).toContain("moMongMuon");
  });

  it("⭐ so-sánh-rồi-đặt kèm parentId ở mọi phép đổi trạng thái (§9.24)", () => {
    for (const ham of ["traLoiMongMuon", "nhoCoChuLam"]) {
      const t = than(ACTIONS, ham);
      expect(t, ham).toContain("updateMany");
      expect(t, ham).toContain('status: "PENDING"');
      expect(t, ham).toContain("parentId: g.parentId");
      // Bấm hai lần / hai tab: lần sau đổi 0 dòng và **không** được báo lỗi.
      expect(t, ham).toContain("count === 0");
    }
  });

  it("⭐ bấm lại thứ mình vừa trả lời ⟹ câu tử tế, KHÔNG phải 'không tìm thấy'", () => {
    // Lỗi đã vấp thật ở đợt này: cổng lọc sẵn `status: "PENDING"` nên lần bấm thứ hai (mạng
    // chậm, hai tab) rơi vào nhánh "Không tìm thấy mong muốn này" - một câu vô nghĩa cho thứ
    // cha mẹ vừa bấm, và nghe như app vừa đánh mất lời của con họ.
    const t = than(DE_XUAT, "moMongMuon");
    const iWhere = t.indexOf("where: { id, parentId");
    expect(iWhere, "cổng phải lọc theo parentId").toBeGreaterThan(-1);
    expect(t.slice(iWhere, iWhere + 60).includes("status"), "cổng KHÔNG được lọc sẵn status").toBe(false);
    // Và hai hành động phải trả `ok` (không phải `nope`) cho trường hợp đó.
    for (const ham of ["traLoiMongMuon", "nhoCoChuLam"]) {
      const a = than(ACTIONS, ham);
      expect(a, ham).toContain('g.status !== "PENDING"');
      const i = a.indexOf('g.status !== "PENDING"');
      expect(a.slice(i, i + 60), ham).toContain("return ok(");
    }
    // "Không tìm thấy" chỉ để dành cho thứ THẬT SỰ không phải của mình.
    expect(than(ACTIONS, "nhoCoChuLam").indexOf("Không tìm thấy"))
      .toBeLessThan(than(ACTIONS, "nhoCoChuLam").indexOf('g.status !== "PENDING"'));
  });

  it("⭐ tạo việc hỏng thì mong muốn quay về PENDING, không nằm lại REVIEWED", () => {
    // Kiểu hỏng tệ nhất ở đây là im lặng: mong muốn hiện ra "đã nhờ cô chú" mà hộp việc
    // của nông dân trống trơn, và không ai biết cho tới khi bé hỏi.
    const t = than(ACTIONS, "nhoCoChuLam");
    expect(t).toContain("catch");
    const i = t.indexOf("catch");
    expect(t.slice(i)).toContain('status: "PENDING"');
    expect(t.slice(i)).toContain("reviewedAt: null");
  });

  it("⭐ không nút chết: đàn đã mổ hoặc đang ở vườn rồi thì từ chối tử tế (§9.2)", () => {
    const t = than(ACTIONS, "nhoCoChuLam");
    expect(t).toContain("dongDan");
    expect(t).toContain("RANGE_OUT");
    expect(t).toContain("outside");
    expect(t).toContain("workerId");
  });

  it("⭐ RETIRED KHÔNG bị coi là đóng đàn", () => {
    // Đàn của gia đình kết chu kỳ bằng `RETIRE` (FL-D13) và những con gà đó vẫn sống, vẫn
    // ăn. Chặn ở đây nghĩa là đúng lúc đàn về hưu - lúc câu chuyện đẹp nhất - thì bé mất
    // luôn đường nhờ chăm.
    const t = than(DE_XUAT, "moMongMuon");
    expect(t).toContain('=== "HARVESTED"');
    expect(t.includes('=== "RETIRED"')).toBe(false);
  });

  it("⭐ lời nhắn gửi nông dân KHÔNG mang biệt danh của bé", () => {
    // Nông dân không nằm trong phạm vi consent cha mẹ đã ký (spec §17.2), và một cái tên
    // đã gửi đi thì không rút lại được - kể cả sau khi cha mẹ xoá sạch dữ liệu.
    const t = than(ACTIONS, "nhoCoChuLam");
    expect(t.includes("nickname"), "nhoCoChuLam nhắc tới nickname").toBe(false);
    // Lời nhắn là **hằng số**, không phải khuôn có chỗ điền: không có chỗ nào để một cái
    // tên chảy vào. (Quét chữ "bé"/"con" thì đỏ nhầm - "chụp gần một con bất kỳ" nói về
    // con gà, và một phép kiểm đỏ vì lý do sai là phép kiểm người sau sẽ tắt đi.)
    for (const m of MONG_MUON) {
      if (!m.viec) continue;
      expect(m.viec.note.length, m.key).toBeGreaterThan(10);
      expect(m.viec.note.includes("${"), `${m.key} có chỗ điền`).toBe(false);
      expect(m.viec.title.includes("${"), `${m.key} có chỗ điền`).toBe(false);
    }
    // Và action phải truyền thẳng, không nối chuỗi thêm gì vào.
    expect(t).toContain("note: viec.note");
  });
});

// ---------------------------------------------------------------------------
// 3. Catalog đóng
// ---------------------------------------------------------------------------

describe("catalog mong muốn (FL-D21)", () => {
  it("khoá không trùng và không rỗng", () => {
    const khoa = MONG_MUON.map((m) => m.key);
    expect(new Set(khoa).size).toBe(khoa.length);
    for (const k of khoa) expect(k).toMatch(/^[A-Z0-9_]+$/);
  });

  it("mỗi loại có ít nhất hai lựa chọn, và mọi loại đều có nhãn", () => {
    for (const l of LOAI) {
      expect(nhomMongMuon(l).length, l).toBeGreaterThanOrEqual(2);
      expect(NHAN_NHOM[l].choBe.length, l).toBeGreaterThan(0);
      expect(NHAN_NHOM[l].choChaMe.length, l).toBeGreaterThan(0);
    }
  });

  it("⭐ CHỈ `CARE_WISH` mang việc thật - và mọi `CARE_WISH` đều mang", () => {
    // Một `CARE_WISH` không có việc là một cái nút không dẫn tới đâu; một loại khác *có*
    // việc là một đường tạo việc thật lọt ra ngoài cổng FL-D22.
    for (const m of MONG_MUON) {
      expect(!!m.viec, `${m.key}`).toBe(m.kind === "CARE_WISH");
    }
  });

  it("⭐ mọi `DECOR_WISH` trỏ tới một món CÓ THẬT trong kho", () => {
    // Không có phép so này thì cha mẹ bấm "xem món này" và rơi vào một trang trống.
    const slug = new Set(DECOR_ITEMS.map((d) => d.slug));
    for (const m of MONG_MUON) {
      if (m.kind !== "DECOR_WISH") continue;
      expect(m.decorSlug, m.key).toBeTruthy();
      expect(slug.has(m.decorSlug!), `${m.key} → ${m.decorSlug}`).toBe(true);
    }
  });

  it("⭐ không một chữ cấm nào lọt vào thứ bé đọc", () => {
    // Dùng CHUNG danh sách với nội dung bài học (§21.5 của spec dặn đừng viết hai bản).
    const CAM = [...TU_CAM_NOI_DUNG, "đồng", "vnđ", "giá", "mua", "thanh toán", "hoá đơn"];
    for (const m of MONG_MUON) {
      const chu = m.choBe.toLowerCase();
      for (const c of CAM) expect(chu.includes(c), `${m.key}: "${c}" trong "${m.choBe}"`).toBe(false);
      // Câu của bé phải NGẮN - một dòng đọc được trên màn hình điện thoại.
      expect(m.choBe.length, m.key).toBeLessThanOrEqual(50);
    }
    for (const l of LOAI) {
      const chu = NHAN_NHOM[l].choBe.toLowerCase();
      for (const c of CAM) expect(chu.includes(c), `${l}: "${c}"`).toBe(false);
    }
  });

  it("⭐ khoá lạ bị từ chối, mọi kiểu dữ liệu", () => {
    for (const x of ["", "KHONG_CO_THAT", "care_wish", 1, null, undefined, {}, [], true]) {
      expect(timMongMuon(x), String(x)).toBe(null);
    }
    expect(timMongMuon("CHO_AN_RAU")?.kind).toBe("CARE_WISH");
  });

  it("⭐ catalog được tra TRƯỚC khi ghi, không sau", () => {
    const t = than(DE_XUAT, "taoMongMuon");
    expect(t.indexOf("timMongMuon")).toBeLessThan(t.indexOf("childSuggestion.create"));
    expect(t).toContain('ly: "khoa-la"');
  });
});

// ---------------------------------------------------------------------------
// 4. Trần số việc thật (FL-D23)
// ---------------------------------------------------------------------------

describe("trần việc thật cho nông dân (FL-D23)", () => {
  it("ba con số trần đều nhỏ và có thật", () => {
    expect(TRAN_CARE_WISH_TUAN).toBeGreaterThan(0);
    expect(TRAN_CARE_WISH_TUAN).toBeLessThanOrEqual(5);
    expect(TRAN_DANG_CHO_MOI_BE).toBeGreaterThan(TRAN_CARE_WISH_TUAN);
    expect(NGAY_HET_HAN_MONG_MUON).toBeGreaterThanOrEqual(7);
  });

  it("⭐ trần tuần đếm theo CHUỒNG, và đếm cả cái đã bị bỏ qua", () => {
    // Đếm theo bé thì một nhà ba con là gấp ba việc cho cùng một nông dân. Và đếm chỉ cái
    // được duyệt thì "xin ba việc" thành "xin không giới hạn, miễn là bị từ chối".
    const t = than(DE_XUAT, "taoMongMuon");
    expect(t).toContain("enrollmentId: input.enrollmentId");
    expect(t).toContain('kind: "CARE_WISH"');
    expect(t).toContain("TRAN_CARE_WISH_TUAN");
    expect(t).toContain('"DECLINED"');
  });

  it("⭐ mọi hàm chạm DB hỏi cờ tổng trước", () => {
    for (const ham of [
      "taoMongMuon", "khoaDangCho", "demMongMuonCho", "dsMongMuon", "moMongMuon", "hetHanMongMuon",
    ]) {
      const t = than(DE_XUAT, ham);
      expect(t.length, ham).toBeGreaterThan(50);
      expect(t.indexOf("batFamily()"), ham).toBeGreaterThan(-1);
      expect(t.indexOf("batFamily()"), ham).toBeLessThan(t.indexOf("prisma."));
    }
  });

  it("việc nền đóng mong muốn quá hạn bằng so-sánh-rồi-đặt, và im lặng", () => {
    const t = than(DE_XUAT, "hetHanMongMuon");
    expect(t).toContain('status: "PENDING"');
    expect(t).toContain('status: "EXPIRED"');
    expect(t.includes("notify"), "đóng mong muốn quá hạn KHÔNG được gõ cửa ai").toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Báo cáo tuần không phải bảng điểm (§18.2)
// ---------------------------------------------------------------------------

describe("§9.41 - báo cáo tuần không chấm điểm một đứa trẻ", () => {
  const ca = [
    { soXong: 0, soNhiemVu: 0, dangCho: 0 },
    { soXong: 0, soNhiemVu: 0, dangCho: 3 },
    { soXong: 4, soNhiemVu: 0, dangCho: 0 },
    { soXong: 4, soNhiemVu: 2, dangCho: 1 },
    { soXong: 1, soNhiemVu: 1, dangCho: 0 },
  ];

  it("⭐ không một chữ xếp hạng nào trong mọi câu sinh ra", () => {
    for (const c of ca) {
      const cau = cauTuanNay(c).toLowerCase();
      for (const cam of TU_CAM_BAO_CAO) {
        expect(cau.includes(cam), `"${cam}" trong "${cau}"`).toBe(false);
      }
      // Không phần trăm, không "x/y" - hai hình dạng của một bảng điểm.
      expect(cau.includes("%"), cau).toBe(false);
      expect(/\d\s*\/\s*\d/.test(cau), cau).toBe(false);
    }
  });

  it("tuần im ắng vẫn là một tuần bình thường - không có câu nào trách móc", () => {
    const cau = cauTuanNay({ soXong: 0, soNhiemVu: 0, dangCho: 0 });
    expect(cau.length).toBeGreaterThan(10);
    for (const cam of ["chưa chăm chỉ", "hãy", "nên", "đừng quên", "sắp hết"]) {
      expect(cau.toLowerCase().includes(cam), cam).toBe(false);
    }
  });

  it("câu nói đúng con số, và đổi theo dữ liệu", () => {
    expect(cauTuanNay({ soXong: 4, soNhiemVu: 0, dangCho: 0 })).toContain("4");
    expect(cauTuanNay({ soXong: 4, soNhiemVu: 2, dangCho: 0 })).toContain("2");
    expect(cauTuanNay({ soXong: 0, soNhiemVu: 0, dangCho: 3 })).toContain("3");
  });

  it("⭐ trang của cha mẹ không có chữ xếp hạng nào", () => {
    const s = boChuThich(doc("src/app/gia-dinh/page.tsx")).toLowerCase();
    for (const cam of TU_CAM_BAO_CAO) expect(s.includes(cam), cam).toBe(false);
  });

  it("⭐ báo cáo CHỈ ĐỌC - không ghi gì lúc vẽ trang (§7.14)", () => {
    const t = than(boChuThich(doc("src/lib/bai-hoc.ts")), "baoCaoTuan");
    // Quét theo **lời gọi**, không theo chữ: `createdAt: "asc"` chứa "create" và sẽ làm
    // phép kiểm này đỏ vì lý do sai.
    for (const cam of [".create", ".update", ".delete", ".upsert", "track("]) {
      expect(t.includes(cam), `baoCaoTuan chứa "${cam}"`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Một cái chuông mỗi nhà mỗi tuần
// ---------------------------------------------------------------------------

describe("§9.41 - thông báo gộp, không dội chuông", () => {
  it("⭐ không có gì để nói ⟹ không có câu nào", () => {
    expect(cauChuongTuan({ soXong: 0, dangCho: 0, mongMuon: 0 })).toBe(null);
    expect(cauChuongTuan({ soXong: 1, dangCho: 0, mongMuon: 0 })).toContain("1");
    expect(cauChuongTuan({ soXong: 0, dangCho: 0, mongMuon: 2 })).toContain("2");
  });

  it("⭐ MỘT câu gộp cả ba con số - không phải ba dòng", () => {
    const c = cauChuongTuan({ soXong: 3, dangCho: 2, mongMuon: 1 });
    expect(c).toBeTruthy();
    expect(c!).toContain("3");
    expect(c!).toContain("2");
    expect(c!).toContain("1");
    expect(c!.split("\n").length).toBe(1);
  });

  it("⭐ việc nền gửi ĐÚNG MỘT thông báo mỗi nhà, và bỏ qua khi rỗng", () => {
    const t = than(JOBS, "baoCaoTuanChoChaMe");
    expect(t.length).toBeGreaterThan(400);
    expect(t.match(/await notify\(/g)?.length ?? 0).toBe(1);
    expect(t).toContain("if (!cau) continue");
    // Chốt chống gửi lại: job chạy MỖI NGÀY, không có nó thì đây là chuông hằng ngày.
    expect(t).toContain("dueNudges");
    expect(t).toContain("bao-cao-tuan:");
    expect(t).toContain("BAO_CAO_MOI_NGAY");
  });

  it("⭐ chuông gửi cho CHA MẸ, và không mang biệt danh của bé", () => {
    // Thông báo hiện ở màn hình khoá, tức trước mắt bất cứ ai đang cầm cái máy đó.
    const t = than(JOBS, "baoCaoTuanChoChaMe");
    expect(t).toContain("userId: parentId");
    expect(t.includes("nickname"), "chuông mang biệt danh của bé").toBe(false);
  });

  it("⭐ nhà đã rút lời đồng ý KHÔNG nhận báo cáo nào", () => {
    const t = than(JOBS, "baoCaoTuanChoChaMe");
    expect(t).toContain('child: { status: "ACTIVE" }');
    expect(t).toContain("unlinkedAt: null");
    expect(t).toContain('enrollment: { status: "ACTIVE"');
    expect(t).toContain("batFamily()");
  });
});

// ---------------------------------------------------------------------------
// 7. Đo đạc không mang dữ liệu trẻ (§17.5)
// ---------------------------------------------------------------------------

describe("đo đạc mong muốn (§17.5)", () => {
  it("⭐ props chỉ mang `kind`, không mang khoá lựa chọn", () => {
    for (const ham of ["guiMongMuon", "traLoiMongMuon", "nhoCoChuLam"]) {
      const t = than(ACTIONS, ham);
      const i = t.indexOf("track(");
      if (i < 0) continue;
      const doan = t.slice(i, i + 300);
      expect(doan.includes("optionKey"), `${ham} gửi optionKey vào đo đạc`).toBe(false);
      expect(doan.includes("nickname"), `${ham} gửi nickname vào đo đạc`).toBe(false);
      expect(doan.includes("childId"), `${ham} gửi childId vào đo đạc`).toBe(false);
    }
  });

  it("⭐ KHÔNG có `parent_report_viewed` - nó sẽ phải ghi DB lúc vẽ trang (§7.14)", () => {
    expect(doc("src/lib/track.ts")).not.toContain('| "parent_report_viewed"');
  });
});
