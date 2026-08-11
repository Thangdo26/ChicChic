// GIỮ CHỖ TRÊN CHỢ - §9.34, §11.47, §11.48.
//
// Bỏ một lô vào giỏ là **rút nó khỏi chợ thật**: người khác nhìn thấy "đang có người
// giữ" và không mua được. Nên hai câu hỏi dưới đây đụng thẳng vào tiền và vào hàng của
// người bán, và cả hai đều là **quyết định**, không phải phép tính - loại thứ `tsc`
// không bao giờ bắt được:
//
//  1. **Ai đang được giữ lô này, và tới bao giờ?** Sai một ô trong bảng dưới là hoặc
//     giấu mất hàng còn bán được, hoặc đoạt lô của người đang trên đường ra ngân hàng.
//  2. **Ba đường nhả chỗ có bỏ sót đơn `REPORTED` không?** Người đã bấm "tôi đã chuyển
//     khoản" mà bị nhả lô là vừa mất hàng vừa nhận tiền của họ.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MARKET_REPORTED_NUDGE_HOURS, RESERVE_HOLD_MINUTES,
  conLaiCuaDon, conLaiVi, hanGiuCho, trangThaiRao, type LoTrenCho,
} from "@/lib/market";

const TOI = "u-toi";
const NGUOI_KHAC = "u-khac";
const T0 = new Date("2026-08-11T10:00:00Z").getTime();
/** Mốc vào giỏ cách `T0` đúng `phut` phút. */
const vao = (phut: number) => new Date(T0 - phut * 60_000);

describe("hạn giữ chỗ", () => {
  it("là 3 giờ, tính từ lúc VÀO GIỎ", () => {
    // Con số này không phải sở thích: nó là thời gian một lô bị rút khỏi chợ vì một
    // lần bấm. Đổi nó thì đọc lại chú thích ở `RESERVE_HOLD_MINUTES` trước.
    expect(RESERVE_HOLD_MINUTES).toBe(180);
    const h = hanGiuCho(vao(0));
    expect(h?.getTime()).toBe(T0 + 180 * 60_000);
  });

  it("không có mốc thì không có hạn - KHÔNG coi là hết hạn", () => {
    // `null` ở đây nghĩa là "lô này chưa vào giỏ ai". Trả về một hạn đã qua là biến
    // mọi lô đang rao thành lô vừa hết hạn.
    expect(hanGiuCho(null)).toBeNull();
    expect(hanGiuCho(undefined)).toBeNull();
  });

  it("đơn nhiều lô lấy hạn của lô SẮP HẾT NHẤT", () => {
    // Mỗi lô mang mốc riêng. Lấy lô vào giỏ muộn nhất là hứa một khoảng thời gian mà
    // lô đầu tiên đã rơi ra khỏi giỏ từ lâu.
    const ms = conLaiCuaDon([{ reservedAt: vao(170) }, { reservedAt: vao(10) }], T0);
    expect(ms).toBe(10 * 60_000);
  });

  it("đơn không lô nào có mốc → null, không phải 0", () => {
    // 0 đọc ra thành "hết hạn rồi"; null là "không có gì để đếm". Hai chuyện khác nhau.
    expect(conLaiCuaDon([], T0)).toBeNull();
    expect(conLaiCuaDon([{ reservedAt: null }], T0)).toBeNull();
  });

  it("quá hạn thì kẹp về 0, không ra số âm", () => {
    expect(conLaiCuaDon([{ reservedAt: vao(500) }], T0)).toBe(0);
  });
});

describe("chữ đếm ngược", () => {
  it("nói giờ và phút, cắt ở phút", () => {
    expect(conLaiVi(2 * 3_600_000 + 14 * 60_000)).toBe("còn 2 giờ 14 phút");
    expect(conLaiVi(3 * 3_600_000)).toBe("còn 3 giờ");
    expect(conLaiVi(25 * 60_000)).toBe("còn 25 phút");
  });

  it("dưới một phút thì nói 'sắp hết hạn', không nói 'còn 0 phút'", () => {
    // "còn 0 phút" đọc ra thành một con số hỏng. Và 0 phải nói được thành lời vì đây
    // đúng là lúc người dùng cần quyết định nhanh nhất.
    expect(conLaiVi(30_000)).toBe("sắp hết hạn");
    expect(conLaiVi(0)).toBe("sắp hết hạn");
    expect(conLaiVi(-99_999)).toBe("sắp hết hạn");
  });
});

// ---------------------------------------------------------------------------
// BẢNG ĐẦY ĐỦ - lô nào × người xem nào × trạng thái đơn nào.
// Không ô nào để trống: một ô chưa ai trả lời là một cách mất hàng chưa ai nghĩ tới.
// ---------------------------------------------------------------------------

const lo = (p: Partial<LoTrenCho>): LoTrenCho => ({
  status: "RESERVED", buyerId: NGUOI_KHAC, reservedAt: vao(10), orderStatus: "OPEN", ...p,
});

describe("§9.34 - lô trên chợ dưới mắt người xem", () => {
  it("lô đang rao thì ai cũng mua được", () => {
    const l = lo({ status: "LISTED", buyerId: null, reservedAt: null, orderStatus: null });
    expect(trangThaiRao(l, TOI, T0).trang).toBe("dang-rao");
    expect(trangThaiRao(l, NGUOI_KHAC, T0).trang).toBe("dang-rao");
  });

  it("trong giỏ của CHÍNH tôi ⟹ bỏ ra được", () => {
    const l = lo({ buyerId: TOI });
    expect(trangThaiRao(l, TOI, T0).trang).toBe("trong-gio");
  });

  it("trong giỏ NGƯỜI KHÁC và còn hạn ⟹ tôi thấy nhãn giữ chỗ, không phải nút mua", () => {
    // ⭐ Trước Đợt 15 lô này bị câu truy vấn giấu hẳn. Người bán thấy hàng mình biến
    // mất khỏi chợ mà không có chỗ nào giải thích.
    const t = trangThaiRao(lo({}), TOI, T0);
    expect(t.trang).toBe("nguoi-khac-giu");
    expect(t.conLaiMs).toBe(170 * 60_000);
  });

  it("⭐ QUÁ HẠN trong giỏ người khác ⟹ tôi mua được NGAY, không chờ việc nền", () => {
    // Đây là lý do hàm này tồn tại. Gói Vercel Hobby chạy cron 1 lần/ngày, nên một chỗ
    // giữ 3 giờ có thể nằm trong DB ở trạng thái `RESERVED` thêm gần trọn một ngày.
    // Đọc trạng thái DB trần thì màn hình nói "có người giữ" suốt ngày đó.
    expect(trangThaiRao(lo({ reservedAt: vao(181) }), TOI, T0).trang).toBe("dang-rao");
  });

  it("quá hạn trong giỏ của chính tôi cũng là 'đang rao' - giỏ tôi không giữ được nữa", () => {
    expect(trangThaiRao(lo({ buyerId: TOI, reservedAt: vao(181) }), TOI, T0).trang).toBe("dang-rao");
  });

  it("⭐ tôi ĐÃ CHỐT đơn ⟹ 'chờ tôi trả', kể cả khi đồng hồ đã chạy hết", () => {
    // Câu "lô này đang rao, mua đi" ở đúng lúc người ta vừa cầm mã ra ngân hàng là câu
    // tệ nhất màn hình có thể nói.
    for (const ph of [10, 181, 999]) {
      const t = trangThaiRao(lo({ buyerId: TOI, reservedAt: vao(ph), orderStatus: "RESERVED" }), TOI, T0);
      expect(t.trang, `${ph} phút`).toBe("cho-toi-tra");
    }
  });

  it("tôi đã BÁO CHUYỂN KHOẢN ⟹ vẫn là 'chờ tôi trả', không bao giờ tụt về 'đang rao'", () => {
    const t = trangThaiRao(lo({ buyerId: TOI, reservedAt: vao(999), orderStatus: "REPORTED" }), TOI, T0);
    expect(t.trang).toBe("cho-toi-tra");
  });

  it("⭐ NGƯỜI KHÁC đã báo chuyển khoản ⟹ tôi KHÔNG đoạt được, dù quá hạn", () => {
    // §9.34: bấm "tôi đã chuyển khoản" là đóng băng chỗ giữ. Bỏ luật này thì một người
    // vừa chuyển tiền thật mất hàng vì ngân hàng chậm mười phút.
    expect(trangThaiRao(lo({ orderStatus: "REPORTED", reservedAt: vao(999) }), TOI, T0).trang)
      .toBe("nguoi-khac-giu");
  });

  it("người khác chốt đơn nhưng CHƯA báo chuyển, và đã quá hạn ⟹ tôi đoạt được", () => {
    // Ranh giới của luật trên: chốt đơn thôi thì chưa phải là đã trả tiền. Không có
    // vế này thì bấm "Chốt đơn" là giữ lô vĩnh viễn miễn phí.
    expect(trangThaiRao(lo({ orderStatus: "RESERVED", reservedAt: vao(181) }), TOI, T0).trang)
      .toBe("dang-rao");
  });

  it("lô KHÔNG ở RESERVED thì mọi cột khác không đổi được kết luận", () => {
    for (const status of ["LISTED", "PAID", "DELIVERED", "CANCELLED"]) {
      expect(trangThaiRao(lo({ status, buyerId: TOI }), TOI, T0).trang).toBe("dang-rao");
    }
  });

  it("buyerId rỗng không được coi là 'của tôi'", () => {
    // `null === null` không xảy ra ở đây, nhưng chuỗi rỗng thì có: một `select` thiếu
    // cột trả về `""` là đủ để mọi lô trên chợ thành giỏ của người đang xem.
    expect(trangThaiRao(lo({ buyerId: null }), "", T0).trang).toBe("nguoi-khac-giu");
    expect(trangThaiRao(lo({ buyerId: "" }), "", T0).trang).toBe("nguoi-khac-giu");
  });
});

// ---------------------------------------------------------------------------
// ĐƯỜNG DÂY - đọc mã nguồn. Ba lỗ dưới đây đều đã có thật trong repo và đều đi qua
// `tsc` + `lint` + `build` sạch sẽ.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, "..", "src");
const doc = (p: string) => readFileSync(join(SRC, ...p.split("/")), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
function thanHam(src: string, ten: string): string {
  const khuc = boChuThich(src).split(/(?:export )?async function /).slice(1);
  return khuc.find((k) => k.slice(0, k.indexOf("(")).trim() === ten) ?? "";
}

describe("§11.47 - ô chuyển khoản của chợ phải tra ĐÚNG BẢNG", () => {
  it("/api/thanh-toan hỏi marketOrder, không chỉ marketListing", () => {
    // Lỗ thật, sống từ Đợt 13 tới Đợt 15: nhánh MARKET tra `marketListing.payCode`,
    // nhưng mã đã dời sang `MarketOrder`. Mọi lần hỏi trả 404, `usePayWatch` nuốt im
    // lặng ("404 thì thôi"), nên ô chuyển khoản KHÔNG BAO GIỜ tự cập nhật - tiền về
    // rồi mà màn hình người mua vẫn bảo đang chờ. Không có gì đỏ lên để ai biết.
    const src = boChuThich(doc("app/api/thanh-toan/route.ts"));
    expect(src).toContain("marketOrder.findUnique");
  });

  it("resolvePayCode cũng vậy - webhook đi lối đó", () => {
    expect(boChuThich(doc("lib/payments.ts"))).toContain("marketOrder.findUnique");
  });
});

describe("§9.34 - không đường nào được nhả lô của đơn đã BÁO CHUYỂN", () => {
  it("confirmMarketPaid nhận CẢ đơn REPORTED", () => {
    // Bỏ sót thì webhook khớp đúng mã xong lại từ chối, và tiền thật nằm treo - đúng
    // những đơn sắp có tiền về nhất lại là những đơn bị bỏ qua.
    const than = thanHam(doc("lib/payments.ts"), "confirmMarketPaid");
    expect(than).not.toBe("");
    expect(than).toMatch(/status:\s*\{\s*in:\s*\[\s*"RESERVED",\s*"REPORTED"\s*\]/);
  });

  it("releaseStaleHolds chỉ đụng vào đơn OPEN/RESERVED", () => {
    const than = thanHam(doc("lib/jobs.ts"), "releaseStaleHolds");
    expect(than).not.toBe("");
    expect(than).toContain('status: { in: ["OPEN", "RESERVED"] }');
    expect(than).not.toContain("REPORTED");
    // Và nó phải huỷ CẢ ĐƠN, không chỉ nhả tin đăng: bản cũ để lại `MarketOrder` với
    // `payCode` còn sống, nên người mua vẫn chuyển khoản được vào một đơn rỗng.
    expect(than).toContain("marketOrder.updateMany");
  });

  it("themVaoGio không đoạt được lô của đơn đã chốt", () => {
    // Cửa sổ này là bình thường với hạn 3 giờ: chốt ở phút 170, ra ngân hàng, và phút
    // 181 người khác bấm mua. Không có điều kiện `order.status` thì lô sang tay trong
    // lúc tiền của người thứ nhất đang trên đường.
    const than = thanHam(doc("app/market-actions.ts"), "themVaoGio");
    expect(than).not.toBe("");
    expect(than).toMatch(/order:\s*\{\s*status:\s*"OPEN"\s*\}/);
  });

  it("tự kiểm: thanHam cắt đúng thân hàm, không đọc cả file", () => {
    // `boKhoiGio` cố ý không có `marketOrder.updateMany`. Nếu bộ đọc trả cả file thì
    // ba phép trên xanh vì lý do sai.
    const than = thanHam(doc("app/market-actions.ts"), "boKhoiGio");
    expect(than).not.toBe("");
    expect(than).not.toContain("marketOrder.updateMany");
  });
});

describe("§11.47 - đơn chợ phải có bàn đối soát TAY", () => {
  it("admin-actions có confirmMarketPayment và nó gọi confirmMarketPaid", () => {
    // Webhook SePay là TUỲ CHỌN (HUONG-DAN mục D4). Trước Đợt 15 nó là cửa duy nhất
    // gọi `confirmMarketPaid`, nên nông trại chưa nối webhook thì tiền đơn chợ về tài
    // khoản mà không có nút nào trong cả sản phẩm biến nó thành hàng đi giao.
    const than = thanHam(doc("app/admin-actions.ts"), "confirmMarketPayment");
    expect(than).not.toBe("");
    expect(than).toContain("isAdmin()");
    expect(than).toContain("confirmMarketPaid(");
  });

  it("mốc nhắc quản trị có thật và đủ dài để người thật kịp làm", () => {
    expect(MARKET_REPORTED_NUDGE_HOURS).toBeGreaterThanOrEqual(12);
  });
});
