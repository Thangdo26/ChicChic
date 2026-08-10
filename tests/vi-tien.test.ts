// VÍ CỦA NGƯỜI BÁN (`lib/wallet.ts`) — §9.29.
//
// Hai luật khác nhau cùng đi qua file này, và cả hai đều dễ bị nới ra vì lý do nghe rất
// hợp lý:
//
//  1. **Ký quỹ.** Tiền người mua trả KHÔNG lập tức thành tiền rút được. Ai đó sẽ có ngày
//     nghĩ "tiền về rồi mà, cho họ rút luôn cho nhanh" — và đó là lúc phí 20% mất hết
//     lý do tồn tại, cùng với sự bảo đảm mà người mua đang trả tiền để có.
//  2. **Chống-đa-cấp.** Không bao giờ hiện tổng thu tích luỹ. Nhóm cuối khoá luật này
//     bằng code, cùng cách `tests/nuoi-duong.test.ts` khoá §9.32.
import { describe, expect, it } from "vitest";
import * as wallet from "@/lib/wallet";
import { rutDuoc, tinhVi } from "@/lib/wallet";

const P = (amountVnd: number, status: string, requestedAt: Date | null = null) =>
  ({ amountVnd, status, requestedAt });

describe("ký quỹ — tiền về KHÔNG có nghĩa là rút được", () => {
  it("lô đã bán chưa giao thì nằm ở 'đang giữ', không phải 'rút được'", () => {
    const v = tinhVi([], [{ netVnd: 200_000, status: "PAID" }]);
    expect(v.dangKyQuyVnd).toBe(200_000);
    expect(v.rutDuocVnd).toBe(0);
    expect(rutDuoc(v)).toBe(false);
  });

  it("giao xong (có Payout) thì mới thành tiền rút được", () => {
    const v = tinhVi([P(160_000, "PENDING")], []);
    expect(v.rutDuocVnd).toBe(160_000);
    expect(v.dangKyQuyVnd).toBe(0);
    expect(rutDuoc(v)).toBe(true);
  });

  it("tin đăng chưa có người mua thì không tính vào đâu cả", () => {
    const v = tinhVi([], [
      { netVnd: 100_000, status: "LISTED" },
      { netVnd: 100_000, status: "RESERVED" },
      { netVnd: 100_000, status: "CANCELLED" },
    ]);
    expect(v.dangKyQuyVnd).toBe(0);
  });

  it("không đếm hai lần khi lô vừa có Payout vừa từng là tin đăng", () => {
    // Lô đã giao thì tin đăng sang `DELIVERED`, không còn `PAID` — nên hai nguồn không
    // chồng nhau. Khoá lại để ai đó đổi truy vấn thì test đỏ.
    const v = tinhVi([P(160_000, "PENDING")], [{ netVnd: 160_000, status: "DELIVERED" }]);
    expect(v.rutDuocVnd + v.dangKyQuyVnd).toBe(160_000);
  });
});

describe("đã yêu cầu rút", () => {
  it("bấm rút không làm tiền biến mất khỏi 'rút được'", () => {
    // Nó vẫn là tiền của họ, chỉ là đã lên tiếng. Trừ ra khỏi số dư là làm người ta
    // tưởng tiền đã đi mất.
    const v = tinhVi([P(160_000, "PENDING", new Date())], []);
    expect(v.rutDuocVnd).toBe(160_000);
    expect(v.daYeuCauVnd).toBe(160_000);
  });

  it("yêu cầu hết rồi thì KHÔNG còn gì để bấm", () => {
    const v = tinhVi([P(160_000, "PENDING", new Date())], []);
    expect(rutDuoc(v)).toBe(false);
  });

  it("còn khoản chưa yêu cầu thì vẫn bấm được", () => {
    const v = tinhVi([P(160_000, "PENDING", new Date()), P(90_000, "PENDING")], []);
    expect(rutDuoc(v)).toBe(true);
  });
});

describe("khoản chuyển lỗi", () => {
  it("đếm ra, KHÔNG cộng vào tiền rút được", () => {
    // Cộng vào thì người ta bấm rút mãi không ra, và không hiểu vì sao.
    const v = tinhVi([P(160_000, "FAILED")], []);
    expect(v.loiSo).toBe(1);
    expect(v.rutDuocVnd).toBe(0);
    expect(rutDuoc(v)).toBe(false);
  });

  it("không im lặng bỏ qua — phải có con số để hiện ra", () => {
    const v = tinhVi([P(1, "FAILED"), P(2, "FAILED")], []);
    expect(v.loiSo).toBe(2);
  });
});

describe("§9.29 — KHÔNG BAO GIỜ hiện tổng thu tích luỹ", () => {
  it("khoản đã chi trả không cộng vào bất kỳ ô nào của ví", () => {
    // Đây là luật ĐẠO ĐỨC, không phải luật kỹ thuật: một con số "bạn đã kiếm được
    // 4.200.000đ" là cái bảng điều khiển mà mọi app đa cấp đều có, và cả sản phẩm này
    // được dựng để không phải là thứ đó. Lịch sử từng khoản vẫn xem được theo TỪNG DÒNG
    // ở /cho/cua-toi — một danh sách giao dịch là sổ sách, một con số cộng dồn là lời
    // mời gọi.
    const v = tinhVi([P(999_000, "PAID"), P(888_000, "PAID")], []);
    expect(Object.values(v).every((x) => x === 0)).toBe(true);
  });

  it("không có hàm nào tính tổng tích luỹ", () => {
    // Chốt bằng bề mặt module: ai thêm `tongDaKiem`/`tongThu`/`luyKe` vào đây thì test
    // đỏ và phải đọc lại §9.29 trước khi tiếp.
    const cam = /tong(daco|dakiem|thu)|luyke|tichluy|lifetime|earned|total(earn|revenue)/i;
    const xau = Object.keys(wallet).filter((k) => cam.test(k.replace(/[^a-z]/gi, "")));
    expect(xau, `Hàm không được tồn tại: ${xau.join(", ")}`).toHaveLength(0);
  });

  it("ViState chỉ có bốn ô, và không ô nào là tổng tích luỹ", () => {
    const v = tinhVi([P(100, "PENDING")], []);
    expect(Object.keys(v).sort()).toEqual(
      ["dangKyQuyVnd", "daYeuCauVnd", "loiSo", "rutDuocVnd"].sort(),
    );
  });
});
