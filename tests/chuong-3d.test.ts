// HÌNH CHUỒNG DẠNG KHỐI - bất biến §9.43.
//
// Bộ kiểm này canh bốn thứ, và ba trong bốn **chỉ đọc được từ mã nguồn** - `tsc`, `lint`
// và `build` đều cho chúng đi qua vui vẻ:
//
//  1. ⭐⭐ **Yếm chỉ được vẽ khi nó đã ở trên con gà THẬT** (§9.1). Chủ chuồng bấm chọn
//     màu xong, cô chú chưa ra chuồng mặc - hình mà đổi ngay thì app đang khoe một việc
//     chưa ai làm. Đây là luật quan trọng nhất của cả tính năng, và nó có đúng MỘT chỗ
//     để hỏng: `ganYem`.
//  2. **Hình vẽ nói đúng số con.** Trước bản này `CoopBackdrop` vẽ cứng ba con gà cho
//     mọi chuồng; người nhận nuôi 6 con mở app ra đếm được 3.
//  3. **Tên gà không rơi vào mắt người lạ** - chuồng trưng bày ai cũng mở được (§9.5).
//  4. **Cảnh này vẫn là SVG dựng ở server** - không WebGL, không vòng lặp vẽ. Trang
//     chuồng là trang nặng nhất của app (§11.23) và người ta mở nó bằng điện thoại.
//
// Không nối DB, không dựng server, không trình duyệt. Phần phải nhìn bằng mắt ghi ở
// CODEMAP §13.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAN_TOI_DA, KHUNG, YEM_MAU_MAC_DINH, cauGa, cauSoCon, ganYem, hopMat, matKhoi,
  sang, tenGa, toi, viTriDan,
} from "@/lib/chuong-3d";
import { FLOCK_QTY } from "@/data/catalog";

const doc = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const HINH = boChuThich(doc("src/components/Illustrations.tsx"));
const BOC = boChuThich(doc("src/components/Chuong3D.tsx"));
const LIB = boChuThich(doc("src/lib/chuong-3d.ts"));
const TRANG_CHUONG = boChuThich(doc("src/app/chuong/[id]/page.tsx"));
const TRANG_NONG_DAN = boChuThich(doc("src/app/nong-trai/chuong/[slug]/page.tsx"));

/** Mọi tệp trong `src/` có nhắc tới cảnh chuồng - dùng cho phép quét "một cửa". */
const NGUON: Record<string, string> = {
  "components/Illustrations.tsx": HINH,
  "components/Chuong3D.tsx": BOC,
  "components/DecorStudio.tsx": boChuThich(doc("src/components/DecorStudio.tsx")),
  "lib/chuong-3d.ts": LIB,
  "app/chuong/[id]/page.tsx": TRANG_CHUONG,
  "app/chuong/page.tsx": boChuThich(doc("src/app/chuong/page.tsx")),
  "app/tai-khoan/page.tsx": boChuThich(doc("src/app/tai-khoan/page.tsx")),
  "app/nong-trai/page.tsx": boChuThich(doc("src/app/nong-trai/page.tsx")),
  "app/nong-trai/chuong/[slug]/page.tsx": TRANG_NONG_DAN,
  "app/chuong/[id]/trang-tri/page.tsx": boChuThich(doc("src/app/chuong/[id]/trang-tri/page.tsx")),
  "app/page.tsx": boChuThich(doc("src/app/page.tsx")),
};

/** Đoạn trong `await Promise.all([ … ]);` đầu tiên của một tệp. */
function dotSongSong(src: string): string {
  const i = src.indexOf("await Promise.all([");
  if (i < 0) return "";
  const j = src.indexOf("\n  ]);", i);
  return j < 0 ? src.slice(i) : src.slice(i, j);
}

/**
 * Thân của ĐÚNG MỘT câu truy vấn.
 *
 * ⚠️ Cắt bằng `slice(0, 400)` thì câu KẾ BÊN lọt vào, và phép kiểm "câu này lọc theo
 * slug" sẽ xanh nhờ câu bên cạnh cũng lọc theo slug. Đã vấp đúng bẫy đó lúc thử ngược:
 * bỏ hẳn phép lọc của `bird.findMany` mà bộ kiểm vẫn xanh.
 */
function cauTruyVan(dot: string, ten: string): string {
  const i = dot.indexOf(`prisma.${ten}(`);
  if (i < 0) return "";
  const j = dot.indexOf("\n    }),", i);
  return j < 0 ? dot.slice(i) : dot.slice(i, j);
}

/** Độ sáng thô của một mã màu - đủ để so "sáng hơn / tối hơn". */
function do_sang(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
}

// ---------------------------------------------------------------------------
describe("§9.43 ① yếm chỉ vẽ khi nó đã ở trên con gà thật", () => {
  const goc = { id: "b1", name: "Miu", tagCode: "L-01", gearItemName: "Yếm đỏ", gearColorHex: "#C64B3B" };

  it("PENDING_ON: KHÔNG vẽ yếm - cô chú chưa ra mặc", () => {
    const g = ganYem({ ...goc, gearStatus: "PENDING_ON" });
    expect(g.yem).toBeNull();
    expect(g.cho).toMatch(/chờ/i);
    expect(g.cho).toContain("mặc");
    // Màu vẫn không được rò ra ngoài dưới bất kỳ hình dạng nào.
    expect(JSON.stringify(g)).not.toContain("#C64B3B");
  });

  it("WORN: vẽ yếm, và không còn gì phải chờ", () => {
    const g = ganYem({ ...goc, gearStatus: "WORN" });
    expect(g.yem).toEqual({ ten: "Yếm đỏ", mau: "#C64B3B" });
    expect(g.cho).toBeNull();
  });

  it("PENDING_OFF: VẪN vẽ yếm - ngoài vườn con gà vẫn đang đeo", () => {
    const g = ganYem({ ...goc, gearStatus: "PENDING_OFF" });
    expect(g.yem).not.toBeNull();
    expect(g.cho).toMatch(/tháo/);
  });

  it("OFF / không có / rác: không vẽ, không nói gì", () => {
    for (const st of ["OFF", null, undefined, "", "worn", "WORN ", "PENDING", "1", "{}"]) {
      const g = ganYem({ ...goc, gearStatus: st as string | null });
      expect(g.yem, `trạng thái ${JSON.stringify(st)}`).toBeNull();
      expect(g.cho, `trạng thái ${JSON.stringify(st)}`).toBeNull();
    }
  });

  it("thiếu màu / thiếu tên loại yếm thì vẫn vẽ ra được cái gì đó", () => {
    const g = ganYem({ id: "b", tagCode: "L-02", gearStatus: "WORN" });
    expect(g.yem!.mau).toBe(YEM_MAU_MAC_DINH);
    expect(g.yem!.mau).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(g.yem!.ten.length).toBeGreaterThan(0);
  });

  it("⭐ MỘT CỬA: `yem:` chỉ được dựng trong lib/chuong-3d.ts", () => {
    for (const [ten, src] of Object.entries(NGUON)) {
      if (ten === "lib/chuong-3d.ts") continue;
      expect(src, `${ten} tự dựng { yem: … }`).not.toMatch(/\byem\s*:/);
    }
  });

  it("⭐ tầng VẼ không được biết gì về trạng thái yếm", () => {
    // Nó chỉ được nhìn `g.yem` có hay không. Biết tới `PENDING_ON` là biết thừa, và
    // biết thừa thì sớm muộn cũng có người vẽ theo.
    for (const tu of ["PENDING_ON", "PENDING_OFF", "WORN", "BirdGear", "gearStatus", "birdGear"]) {
      expect(HINH, `Illustrations.tsx nhắc tới ${tu}`).not.toContain(tu);
      expect(BOC, `Chuong3D.tsx nhắc tới ${tu}`).not.toContain(tu);
    }
    // `colorHex` là màu của MÓN DECOR - `Illustrations` có quyền biết. Nhưng lớp bọc
    // thì không: nó chỉ được cầm `GaVM` đã qua `ganYem`.
    expect(BOC, "Chuong3D.tsx đọc màu yếm từ dữ liệu thô").not.toContain("colorHex");
  });

  it("⭐ hai trang dựng đàn đều đi qua `ganYem`", () => {
    for (const [ten, src] of [["trang chuồng", TRANG_CHUONG], ["trang nông dân", TRANG_NONG_DAN]] as const) {
      expect(src, ten).toContain("ganYem(");
      expect(src, `${ten} đọc thẳng status để vẽ`).not.toMatch(/status\s*===\s*"WORN"/);
    }
  });

  it("yếm vẽ từ `yem`, dấu chờ vẽ từ `cho` - hai đường khác nhau", () => {
    expect(HINH).toMatch(/\{yem\s*&&/);
    expect(HINH).toMatch(/g\?\.cho\s*&&/);
  });

  it("câu mô tả nói đúng ba trạng thái", () => {
    expect(cauGa(ganYem({ ...goc, gearStatus: "WORN" }))).toContain("Miu");
    expect(cauGa(ganYem({ ...goc, gearStatus: "WORN" }))).toMatch(/đang mặc/i);
    expect(cauGa(ganYem({ ...goc, gearStatus: "PENDING_ON" }))).toMatch(/chờ/i);
    expect(cauGa(ganYem({ ...goc, gearStatus: null }))).toMatch(/chưa mặc/i);
  });
});

// ---------------------------------------------------------------------------
describe("§9.43 ② hình vẽ nói đúng số con", () => {
  it("bao nhiêu con thì bấy nhiêu chỗ đứng", () => {
    for (let n = 0; n <= DAN_TOI_DA; n++) expect(viTriDan(n)).toHaveLength(n);
  });

  it("quá trần thì vẽ tới trần - và `cauSoCon` phải NÓI RA số thật", () => {
    expect(viTriDan(40)).toHaveLength(DAN_TOI_DA);
    const c = cauSoCon(40);
    expect(c).toContain("40");
    expect(c).toContain(String(DAN_TOI_DA));
  });

  it("đàn rỗng: sân trống, và nói rõ vì sao trống", () => {
    expect(viTriDan(0)).toEqual([]);
    expect(cauSoCon(0)).toMatch(/trống/);
  });

  it("số vô nghĩa không làm vỡ hình", () => {
    for (const n of [-3, NaN, Infinity, 0.4, "6" as unknown as number, null as unknown as number]) {
      expect(() => viTriDan(n)).not.toThrow();
      expect(viTriDan(n).length).toBeLessThanOrEqual(DAN_TOI_DA);
    }
    expect(viTriDan(-3)).toEqual([]);
    expect(viTriDan(NaN)).toEqual([]);
  });

  it("⭐ TẤT ĐỊNH: gọi lại ra đúng chỗ cũ", () => {
    // Không có tính chất này thì con gà tên Miu nhảy sang chỗ khác mỗi lần tải trang,
    // và server với client vẽ lệch nhau (React kêu hydrate mismatch).
    for (let n = 1; n <= DAN_TOI_DA; n++) {
      expect(viTriDan(n)).toEqual(viTriDan(n));
      expect(viTriDan(n, true)).toEqual(viTriDan(n, true));
    }
    expect(LIB).not.toContain("Math.random");
  });

  it("mọi con đứng trong khung, không con nào lòi ra ngoài", () => {
    for (const ngoai of [false, true]) {
      for (let n = 1; n <= DAN_TOI_DA; n++) {
        for (const p of viTriDan(n, ngoai)) {
          expect(p.x).toBeGreaterThan(18);
          expect(p.x).toBeLessThan(KHUNG.w - 18);
          expect(p.y).toBeGreaterThan(KHUNG.h * 0.6);
          expect(p.y).toBeLessThan(KHUNG.h - 6);
          expect(p.co).toBeGreaterThanOrEqual(0.7);
          expect(p.co).toBeLessThanOrEqual(1.05);
        }
      }
    }
  });

  it("vẽ từ xa tới gần - con đứng dưới che con đứng trên", () => {
    for (let n = 2; n <= DAN_TOI_DA; n++) {
      const ys = viTriDan(n).map((p) => p.y);
      expect(ys).toEqual([...ys].sort((a, b) => a - b));
    }
  });

  it("⭐ không con nào nấp sau lưng con khác - đếm trên màn hình phải ra đủ", () => {
    for (const ngoai of [false, true]) {
      for (let n = 2; n <= FLOCK_QTY.max; n++) {
        const p = viTriDan(n, ngoai);
        for (let i = 0; i < p.length; i++) {
          for (let j = i + 1; j < p.length; j++) {
            const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
            expect(d, `${ngoai ? "vườn" : "chuồng"} n=${n} · con ${i} và ${j}`).toBeGreaterThan(9);
          }
        }
      }
    }
  });

  it("trần vẽ đủ chỗ cho một chuồng thật", () => {
    expect(DAN_TOI_DA).toBeGreaterThanOrEqual(FLOCK_QTY.max);
  });

  it("⭐ mọi trang có hình chuồng đều nói số con - không trang nào vẽ mò", () => {
    const phai = [
      "app/chuong/[id]/page.tsx", "app/chuong/page.tsx", "app/tai-khoan/page.tsx",
      "app/nong-trai/page.tsx", "app/nong-trai/chuong/[slug]/page.tsx",
      "app/chuong/[id]/trang-tri/page.tsx",
    ];
    for (const ten of phai) {
      expect(NGUON[ten], `${ten} vẽ chuồng mà không nói số con`).toMatch(/soCon=|dan=\{dan\}|soCon=\{soCon\}/);
    }
  });

  it("⭐⭐ số con lấy từ đàn ĐANG SỐNG, không lấy `flock.size`", () => {
    // `size` là số chủ chuồng chọn lúc nhận nuôi. Đàn đã nhận thịt / đã nghỉ hưu thì
    // `size` vẫn nguyên mà ngoài vườn không còn con nào - vẽ 6 con vào cái sân đã trống
    // là kiểu sai tệ nhất: nó trông y như đúng.
    for (const [ten, src] of Object.entries(NGUON)) {
      expect(src, `${ten} lấy số con từ flock.size`).not.toMatch(/soCon=\{[^}]*\.size/);
    }
    for (const ten of ["app/chuong/page.tsx", "app/tai-khoan/page.tsx", "app/nong-trai/page.tsx"]) {
      expect(NGUON[ten], ten).toContain('status: "ALIVE"');
    }
  });

  it("`viTriDan` chỉ được gọi ở lớp vẽ đàn, không ai chép lại cách xếp", () => {
    for (const [ten, src] of Object.entries(NGUON)) {
      if (ten === "lib/chuong-3d.ts" || ten === "components/Illustrations.tsx") continue;
      expect(src, `${ten} tự xếp đàn`).not.toContain("viTriDan");
    }
  });
});

// ---------------------------------------------------------------------------
describe("§9.43 ③ tên gà là của chủ chuồng", () => {
  it("chưa đặt tên thì gọi theo vòng chân", () => {
    expect(tenGa(null, "L-01")).toBe("Con L-01");
    expect(tenGa("   ", "L-02")).toBe("Con L-02");
    expect(tenGa(undefined, "B-07")).toBe("Con B-07");
    expect(tenGa("Miu", "L-01")).toBe("Miu");
    expect(tenGa("  Bé Út  ", "L-03")).toBe("Bé Út");
  });

  it("`coTen` phân biệt được tên thật với khoảng trắng", () => {
    expect(ganYem({ id: "a", tagCode: "L-01", name: "Miu" }).coTen).toBe(true);
    expect(ganYem({ id: "a", tagCode: "L-01", name: "  " }).coTen).toBe(false);
    expect(ganYem({ id: "a", tagCode: "L-01" }).coTen).toBe(false);
  });

  it("⭐ chuồng xem thử chỉ hiện SỐ CON, không hiện tên", () => {
    // Chuồng trưng bày thì khách vãng lai cũng mở được (§9.5). Tên gà là do chủ chuồng
    // đặt - có nhà để trẻ con đặt - nên nó không việc gì phải nằm trên một trang công khai.
    const i = TRANG_CHUONG.indexOf("isDemoView ? (");
    expect(i, "trang chuồng không còn nhánh xem thử riêng cho hình chuồng").toBeGreaterThan(0);
    const nhanh = TRANG_CHUONG.slice(i, TRANG_CHUONG.indexOf(") : (", i));
    expect(nhanh).toContain("soCon=");
    expect(nhanh, "nhánh xem thử gửi cả tên gà đi").not.toContain("dan=");
  });

  it("ảnh nhỏ trong danh sách không mang tên gà", () => {
    for (const ten of ["app/chuong/page.tsx", "app/tai-khoan/page.tsx", "app/nong-trai/page.tsx", "app/page.tsx"]) {
      expect(NGUON[ten], `${ten} gửi tên gà xuống ảnh nhỏ`).not.toMatch(/\bdan=\{/);
    }
  });

  it("cô chú nông dân xem được tên nhưng KHÔNG có nút sang trang của chủ chuồng", () => {
    expect(TRANG_NONG_DAN).toContain("dan={dan}");
    expect(TRANG_NONG_DAN).toContain("danGaHref={null}");
  });
});

// ---------------------------------------------------------------------------
describe("§9.43 ④ vẫn là SVG dựng ở server", () => {
  it("không có thư viện 3D nào trong package.json", () => {
    const pkg = doc("package.json");
    for (const tu of ["three", "babylon", "react-three", "pixi", "regl"]) {
      expect(pkg, `đã thêm ${tu}`).not.toContain(`"${tu}`);
    }
  });

  it("không WebGL, không canvas, không vòng lặp vẽ", () => {
    for (const [ten, src] of [["Illustrations", HINH], ["Chuong3D", BOC]] as const) {
      for (const tu of ["<canvas", "WebGL", "requestAnimationFrame", "setInterval", "useEffect"]) {
        expect(src, `${ten} dùng ${tu}`).not.toContain(tu);
      }
    }
  });

  it("lớp vẽ KHÔNG phải client component - 7 chỗ dùng nó phần lớn là ảnh nhỏ", () => {
    expect(HINH).not.toContain('"use client"');
    expect(LIB).not.toContain('"use client"');
    // Lớp bọc thì có, và nó phải mỏng: không Prisma, không server action.
    expect(BOC).toContain('"use client"');
    expect(BOC).not.toContain("prisma");
  });

  it("lib hình học thuần - nạp được vào cả server, client lẫn bộ kiểm", () => {
    for (const tu of ["prisma", "next/headers", "process.env", "react"]) {
      expect(LIB, `lib/chuong-3d.ts import ${tu}`).not.toContain(tu);
    }
  });

  it("⭐ hai truy vấn mới đi CHUNG đợt song song, không nối tiếp (§10)", () => {
    const dot = dotSongSong(TRANG_CHUONG);
    // Lọc theo `slug` chứ không theo `barn.id` lấy từ câu cha - có thế mới không phải chờ.
    for (const ten of ["bird.findMany", "birdGear.findMany"]) {
      const cau = cauTruyVan(dot, ten);
      expect(cau, `${ten} không nằm trong đợt song song`).not.toBe("");
      expect(cau, `${ten} lệ thuộc câu truy vấn cha`).toContain("slug: params.id");
      expect(cau, `${ten} lấy id từ câu khác`).not.toMatch(/barnId:|barn\.id/);
    }
    // Và KHÔNG lồng từ Bird xuống gear: Prisma phát một truy vấn cho mỗi quan hệ.
    expect(dot).not.toMatch(/gear:\s*\{/);
  });

  it("trang chuồng không gọi thêm truy vấn nào ngoài đợt đó cho đàn gà", () => {
    const sau = TRANG_CHUONG.slice(TRANG_CHUONG.indexOf("\n  ]);"));
    expect(sau).not.toContain("prisma.bird");
  });
});

// ---------------------------------------------------------------------------
describe("§9.43 ⑤ hình học khối", () => {
  it("một khối cho ra ba mặt, mỗi mặt bốn đỉnh", () => {
    const m = hopMat(10, 20, 30, 40, 8);
    for (const [ten, p] of Object.entries(m)) {
      expect(p.split(" "), ten).toHaveLength(4);
      for (const d of p.split(" ")) expect(d, `${ten}: ${d}`).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    }
  });

  it("khối sâu 0 vẫn vẽ được (không NaN, không vỡ)", () => {
    const m = hopMat(0, 0, 10, 10, 0);
    expect(m.tren).not.toContain("NaN");
    expect(m.ben).not.toContain("NaN");
  });

  it("mặt trên sáng hơn mặt trước, mặt bên tối hơn - đó là cả bí quyết", () => {
    for (const mau of ["#EADFC2", "#9A5C3A", "#7FA85C", "#C64B3B", "#3F7FA6"]) {
      const c = matKhoi(mau);
      expect(do_sang(c.tren), mau).toBeGreaterThan(do_sang(c.truoc));
      expect(do_sang(c.ben), mau).toBeLessThan(do_sang(c.truoc));
      expect(new Set([c.tren, c.truoc, c.ben]).size, mau).toBe(3);
    }
  });

  it("màu hỏng thì trả nguyên vào, không ném lỗi", () => {
    for (const x of ["", "đỏ", "#12", "rgb(1,2,3)", "var(--paddy)"]) {
      expect(sang(x)).toBe(x);
      expect(toi(x)).toBe(x);
    }
  });

  it("hệ toạ độ giữ nguyên 240×180 - bản vẽ decor cũ không được lệch", () => {
    // Mỗi dòng `BarnDecor.x/y` là bản vẽ cô chú lắp thật ngoài chuồng.
    expect(KHUNG).toEqual({ w: 240, h: 180 });
    expect(HINH).toContain("export const COOP_VIEWBOX = KHUNG");
  });
});
