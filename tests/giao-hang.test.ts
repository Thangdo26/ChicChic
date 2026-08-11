// GIAO HÀNG (`lib/delivery.ts`) - §11.12, §11.43.
//
// Hai thứ được khoá ở đây:
//
//  1. **Phí gắn vào MỘT CHUYẾN, không phải một lô.** Mọi lô đều đang nằm ở nông trại,
//     nên mua 5 lô cùng lúc vẫn là một chuyến xe tới một địa chỉ. Nhân phí lên 5 lần là
//     thu tiền cho thứ không xảy ra - và đó là lỗi không ai đọc ra từ màn hình, vì con
//     số vẫn "hợp lý".
//  2. **Không có vùng ⟹ không đặt được**, và ba lý do khác nhau phải ra ba câu khác
//     nhau. Trả `false` trơn là để người dùng đứng trước một cái nút hỏng không lời.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_SHIP_VND, VUONG_MAC_VI, laFreeship, nhanPhiGiao, phiGiao, tienDon, vuongMacGiaoHang,
  type VungGiao,
} from "@/lib/delivery";

const HN: VungGiao = { id: "z1", name: "Hà Nội", feeVnd: 0 };
const HOA_BINH: VungGiao = { id: "z2", name: "Hoà Bình", feeVnd: 30_000 };

describe("phí một chuyến", () => {
  it("freeship là phí 0, không phải 'không có phí'", () => {
    expect(phiGiao(HN)).toBe(0);
    expect(laFreeship(HN)).toBe(true);
    expect(laFreeship(HOA_BINH)).toBe(false);
  });

  it("⭐ mua NHIỀU lô vẫn chỉ MỘT phí giao", () => {
    // Đây là dòng quan trọng nhất của cả file. Hàng nằm sẵn ở nông trại, nên năm lô là
    // một chuyến xe. Ai đó "sửa cho nhất quán" thành phí-mỗi-lô thì test này phải đỏ.
    const mot = tienDon([100_000], HOA_BINH);
    const nam = tienDon([100_000, 50_000, 20_000, 30_000, 10_000], HOA_BINH);
    expect(mot.shipVnd).toBe(30_000);
    expect(nam.shipVnd).toBe(30_000);
    expect(nam.goodsVnd).toBe(210_000);
    expect(nam.totalVnd).toBe(240_000);
  });

  it("tổng LUÔN là tiền hàng cộng phí, không tính riêng", () => {
    for (const gia of [[], [1], [7, 11, 13], [999_999, 1]]) {
      const t = tienDon(gia, HOA_BINH);
      expect(t.totalVnd).toBe(t.goodsVnd + t.shipVnd);
    }
  });

  it("giỏ RỖNG không tính phí giao", () => {
    // Không có chuyến xe nào cả. Hiện "phí giao 30.000đ" trên một cái giỏ trống là con
    // số vô nghĩa đầu tiên người dùng nhìn thấy.
    const t = tienDon([], HOA_BINH);
    expect(t).toEqual({ goodsVnd: 0, shipVnd: 0, totalVnd: 0 });
  });

  it("chưa chọn vùng thì phí là 0, không phải NaN", () => {
    expect(phiGiao(null)).toBe(0);
    expect(phiGiao(undefined)).toBe(0);
    expect(tienDon([50_000], null).totalVnd).toBe(50_000);
  });

  it("phí do người trực gõ tay nên phải kẹp hai đầu", () => {
    // Cột `feeVnd` sửa được ở /admin. Số tiền người mua phải trả không được phụ thuộc
    // vào một lần gõ nhầm.
    expect(phiGiao({ id: "x", name: "x", feeVnd: -5000 })).toBe(0);
    expect(phiGiao({ id: "x", name: "x", feeVnd: MAX_SHIP_VND * 10 })).toBe(MAX_SHIP_VND);
    expect(phiGiao({ id: "x", name: "x", feeVnd: 30_000.7 })).toBe(30_001);
  });

  it("tiền hàng không bao giờ âm", () => {
    expect(tienDon([-100, 500], HN).goodsVnd).toBe(500);
  });
});

describe("ai chưa đặt hàng được, và vì sao", () => {
  const co = { line: "1 Đường A, Hà Nội", zoneId: "z1" };

  it("đủ địa chỉ + vùng đang mở thì không vướng gì", () => {
    expect(vuongMacGiaoHang(co, HN)).toBeNull();
  });

  it("ba lý do khác nhau, không gộp thành một", () => {
    expect(vuongMacGiaoHang(null, HN)).toBe("chua-co-dia-chi");
    expect(vuongMacGiaoHang({ line: "1 Đường A", zoneId: null }, HN)).toBe("chua-chon-vung");
    // Có `zoneId` nhưng chỗ gọi tra không ra vùng đang mở ⟹ nông trại đã tắt vùng đó.
    expect(vuongMacGiaoHang(co, null)).toBe("vung-ngung-giao");
  });

  it("địa chỉ CŨ (trước Đợt 13) không lặng lẽ đi qua", () => {
    // Hai địa chỉ thật trong DB không mang vùng. Chúng vẫn đọc được để đơn đang giao
    // không gãy, nhưng không được dùng để đặt đơn MỚI.
    expect(vuongMacGiaoHang({ line: "địa chỉ cũ", zoneId: null }, null)).toBe("chua-chon-vung");
  });

  it("mọi lý do đều có câu tiếng Việt nói được phải làm gì tiếp", () => {
    for (const ly of ["chua-co-dia-chi", "chua-chon-vung", "vung-ngung-giao"] as const) {
      const cau = VUONG_MAC_VI[ly];
      expect(cau, `thiếu câu cho ${ly}`).toBeTruthy();
      expect(cau.length).toBeGreaterThan(20);
      // Không được để lọt tên trạng thái trong máy ra màn hình tiếng Việt.
      expect(cau).not.toMatch(/chua-|vung-|null|undefined/);
    }
  });
});

describe("chữ hiện cạnh dòng phí", () => {
  it("freeship nói RÕ là miễn phí, không im lặng", () => {
    // Im lặng ở chỗ có tiền thì người đọc mặc định là mất tiền - hoặc ngược lại. Cùng
    // bài học với màn kết chu kỳ ở Đợt 10 (§11.17).
    expect(nhanPhiGiao(HN)).toContain("miễn phí");
    expect(nhanPhiGiao(HN)).toContain("Hà Nội");
  });

  it("vùng có phí thì chỉ nêu tên - con số đứng ở dòng tiền", () => {
    expect(nhanPhiGiao(HOA_BINH)).toBe("Hoà Bình");
  });

  it("chưa chọn vùng thì nói thẳng là chưa chọn", () => {
    expect(nhanPhiGiao(null)).toBe("chưa chọn khu vực");
  });
});

// ---------------------------------------------------------------------------
// ĐƯỜNG DÂY - đọc mã nguồn. Cổng giao hàng là một QUYẾT ĐỊNH, và quyết định thì
// `tsc` không kiểm được: quên gọi cổng ở một đường đặt hàng vẫn biên dịch sạch,
// vẫn chạy, chỉ là chặn hụt.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, "..", "src");
const doc = (p: string) => readFileSync(p, "utf8");
/** Bỏ chú thích - nhắc tên cổng trong chú thích không phải là gọi nó. */
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Thân của một `export async function` trong file. */
function thanHam(src: string, ten: string): string {
  const khuc = boChuThich(src).split(/export async function /).slice(1);
  return khuc.find((k) => k.slice(0, k.indexOf("(")).trim() === ten) ?? "";
}

describe("§11.46 - MỌI đường đặt hàng đều qua cổng giao hàng", () => {
  /**
   * Ba đường một người có thể yêu cầu nông trại chở hàng tới nhà mình. Cả ba **phải**
   * hỏi `vuongMacGiaoHang` - thiếu một cái là hứa giao tới nơi chưa ai khai đường.
   *
   * ⚠️ `themVaoGio` có mặt ở đây vì Đợt 14: nó từng không kiểm gì, chỉ `chotGio` mới
   * kiểm. Mà vào giỏ là **giữ chỗ thật** (lô sang `RESERVED`, biến khỏi chợ 24 giờ),
   * nên người chưa có địa chỉ vẫn rút được hàng của người bán khỏi chợ rồi mới đọc
   * được rằng mình không đặt nổi.
   */
  const DUONG: [string, string][] = [
    ["app/market-actions.ts", "themVaoGio"],
    ["app/market-actions.ts", "chotGio"],
    ["app/harvest-actions.ts", "claimLot"],
  ];

  for (const [tep, ham] of DUONG) {
    it(`${tep} · ${ham} hỏi vuongMacGiaoHang`, () => {
      const than = thanHam(doc(join(SRC, ...tep.split("/"))), ham);
      expect(than, `không tìm thấy ${ham} trong ${tep}`).not.toBe("");
      expect(than, `${ham} không gọi cổng giao hàng`).toContain("vuongMacGiaoHang(");
    });
  }

  it("tự kiểm: phép đo trên CẮT ĐÚNG thân hàm, không đọc cả file", () => {
    // Nếu `thanHam` trả về nguyên file thì ba phép kiểm trên xanh vì lý do sai - chỉ cần
    // MỘT hàm nào đó trong file gọi cổng là đủ, và ta mất luôn thứ đang muốn đo.
    // `boKhoiGio` cố ý KHÔNG có cổng (bỏ hàng RA khỏi giỏ thì địa chỉ không liên quan,
    // và khoá đường lùi là nhốt lô của người bán lại), nên nó là chứng đối chiếu.
    const than = thanHam(doc(join(SRC, "app", "market-actions.ts")), "boKhoiGio");
    expect(than).not.toBe("");
    expect(than).not.toContain("vuongMacGiaoHang(");
  });
});

describe("§11.46 - ô địa chỉ không được nhốt trong trang chuồng", () => {
  it("có ít nhất một trang NGOÀI /chuong dùng AddressForm", () => {
    // Chợ mở cửa mua cho mọi tài khoản (§11.40), nên người mua có thể không sở hữu
    // chuồng nào. Nếu `AddressForm` chỉ còn nằm dưới `app/chuong/`, câu "điền địa chỉ
    // trước" lại chỉ đường tới một trang họ không vào được - đúng ngõ cụt Đợt 14 vá.
    const trang: string[] = [];
    const di = (d: string) => {
      for (const t of readdirSync(d)) {
        const p = join(d, t);
        if (statSync(p).isDirectory()) di(p);
        else if (p.endsWith("page.tsx") && doc(p).includes("AddressForm")) trang.push(p);
      }
    };
    di(join(SRC, "app"));

    const ngoaiChuong = trang.filter((p) => !p.split("\\").join("/").includes("/app/chuong/"));
    expect(trang.length, "không trang nào dùng AddressForm").toBeGreaterThan(0);
    expect(ngoaiChuong, "ô địa chỉ chỉ còn trong trang chuồng - người mua không có chuồng bị kẹt")
      .not.toHaveLength(0);
  });
});
