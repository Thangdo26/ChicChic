// HÀNG RÀO TẦN SUẤT - §11.50.
//
// Tới Đợt 16 repo có **đúng một** hàng rào tần suất (`messages.sendingBlocked`), và nó chỉ
// đếm được vì mỗi tin nhắn tự nó là một dòng trong DB. Bốn cửa còn lại để trần: hai đường
// gửi OTP (mỗi lượt là một email Resend thật), `traCuuChuTaiKhoan` (mỗi lượt là một lượt
// gọi VietQR có tính phí) và `login` (mật khẩu dò được không giới hạn).
//
// Bộ này khoá hai thứ, và tầng thứ hai mới là tầng quan trọng: một hàng rào tần suất viết
// sai chỗ **trông y hệt** một hàng rào viết đúng chỗ - vẫn có mặt trong mã nguồn, `tsc` vẫn
// xanh, và nó vẫn không chặn được gì.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NHIP, cauChoDoi, conLaiNhip, ipTuHeader, vuotNguong } from "@/lib/nhip-meta";

const T0 = new Date("2026-08-11T12:00:00Z").getTime();

describe("ngưỡng và phép so", () => {
  it("⭐ lượt thứ N đi lọt, lượt thứ N+1 mới bị chặn", () => {
    // Bộ đếm tăng TRƯỚC rồi mới hỏi, nên phép so phải là `>`. Lệch một ở đây là quảng cáo
    // "10 lần" mà thực tế chỉ cho 9 - và không ai phát hiện, vì không ai đếm.
    const n = NHIP["gui-ma-ip"].soLan;
    expect(vuotNguong("gui-ma-ip", n - 1)).toBe(false);
    expect(vuotNguong("gui-ma-ip", n)).toBe(false);
    expect(vuotNguong("gui-ma-ip", n + 1)).toBe(true);
  });

  it("mọi ngăn đều có ngưỡng dương và cửa sổ dương", () => {
    for (const [ten, ng] of Object.entries(NHIP)) {
      expect(ng.soLan, ten).toBeGreaterThan(0);
      expect(ng.phut, ten).toBeGreaterThan(0);
    }
  });

  it("ngăn theo IP của việc gửi mã phải RỘNG HƠN ngăn theo email", () => {
    // Một địa chỉ mạng có thể là cả một văn phòng, mỗi người một email. Đặt ngược lại là
    // chặn nhầm người thật ở đúng bước đầu tiên họ chạm vào sản phẩm.
    expect(NHIP["gui-ma-ip"].soLan).toBeGreaterThan(NHIP["gui-ma-email"].soLan);
  });

  it("đăng nhập: ngăn theo IP rộng hơn ngăn theo tên đăng nhập", () => {
    // Cùng lý do - và ngăn theo tên mới là ngăn chống dò mật khẩu thật sự.
    expect(NHIP["dang-nhap-ip"].soLan).toBeGreaterThan(NHIP["dang-nhap-ten"].soLan);
    // Người gõ nhầm mật khẩu cần chừng 5 lần. Dưới thế là khoá nhầm người quên mật khẩu.
    expect(NHIP["dang-nhap-ten"].soLan).toBeGreaterThanOrEqual(5);
  });

  it("cửa sổ đăng nhập ngắn để người bị khoá nhầm không phải đợi lâu", () => {
    expect(NHIP["dang-nhap-ten"].phut).toBeLessThanOrEqual(30);
  });
});

describe("còn bao lâu nữa mở lại", () => {
  it("đếm từ mốc mở cửa sổ", () => {
    const moc = new Date(T0 - 10 * 60_000); // ngăn 60 phút, đã trôi 10 phút
    expect(conLaiNhip("gui-ma-ip", moc, T0)).toBe(50 * 60_000);
  });

  it("quá cửa sổ thì kẹp về 0, không ra số âm", () => {
    expect(conLaiNhip("gui-ma-ip", new Date(T0 - 999 * 60_000), T0)).toBe(0);
  });

  it("mốc rỗng hoặc hỏng thì ra 0, không ra NaN", () => {
    // `NaN` chảy xuống `cauChoDoi` thành "nghỉ khoảng NaN phút" - một câu vô nghĩa hiện
    // ra đúng lúc người dùng đang bực.
    expect(conLaiNhip("gui-ma-ip", null, T0)).toBe(0);
    expect(conLaiNhip("gui-ma-ip", undefined, T0)).toBe(0);
    expect(conLaiNhip("gui-ma-ip", new Date("khong-phai-ngay"), T0)).toBe(0);
  });
});

describe("câu nói cho người bị chặn", () => {
  it("luôn nói một số phút CỤ THỂ, và không bao giờ nói 0 phút", () => {
    // Khác hẳn `lib/hang-doi.ts` (cấm hứa ngày): cửa sổ đếm là phép cộng của máy, không
    // phải lời hứa về việc một người sẽ làm gì. Nói số ở đây là nói đúng thứ mình biết chắc.
    expect(cauChoDoi(0)).toContain("1 phút");
    expect(cauChoDoi(1)).toContain("1 phút");
    expect(cauChoDoi(12 * 60_000)).toContain("12 phút");
    // Làm tròn LÊN: còn 30 giây mà bảo "0 phút" thì người ta bấm lại ngay và lại bị chặn.
    expect(cauChoDoi(30_000)).toContain("1 phút");
    expect(cauChoDoi(61_000)).toContain("2 phút");
  });

  it("không lộ ngưỡng, không lộ ngăn nào đã chặn", () => {
    const cau = cauChoDoi(12 * 60_000);
    expect(cau).not.toMatch(/gui-ma|dang-nhap|tra-ten/);
    expect(cau).not.toMatch(/\d+\s*(lượt|lần)/);
  });
});

describe("⭐ đọc địa chỉ mạng - THỨ TỰ Ở ĐÂY LÀ CẢ HÀNG RÀO", () => {
  it("header do NỀN TẢNG đặt được ưu tiên hơn x-forwarded-for", () => {
    // `x-forwarded-for` là header **người gọi tự đặt được**: Vercel nối thêm chứ không xoá,
    // nên phần tử đầu có thể do chính kẻ đang bắn viết ra. Tin nó trước là dựng một hàng
    // rào mà ai cũng bước qua bằng cách đổi một dòng header - tệ hơn không có hàng rào,
    // vì nó làm mình tưởng đã có.
    expect(ipTuHeader({ vercel: "1.1.1.1", real: "2.2.2.2", forwarded: "9.9.9.9" })).toBe("1.1.1.1");
    expect(ipTuHeader({ real: "2.2.2.2", forwarded: "9.9.9.9" })).toBe("2.2.2.2");
  });

  it("chỉ dùng x-forwarded-for khi không còn gì khác", () => {
    // Lối lùi cho chỗ chạy không phải Vercel. Vẫn hơn không có gì, nhưng tin được ít hơn hẳn.
    expect(ipTuHeader({ forwarded: "9.9.9.9" })).toBe("9.9.9.9");
  });

  it("chuỗi nhiều chặng thì lấy chặng đầu", () => {
    expect(ipTuHeader({ vercel: "1.1.1.1, 10.0.0.1, 10.0.0.2" })).toBe("1.1.1.1");
    expect(ipTuHeader({ vercel: "  1.1.1.1 , 10.0.0.1" })).toBe("1.1.1.1");
  });

  it("⭐ không đọc được thì trả null, KHÔNG trả một chuỗi mặc định", () => {
    // Cám dỗ là trả "khong-ro" cho gọn. Làm thế thì mọi người mà hệ thống không đọc được
    // địa chỉ sẽ **dùng chung một bộ đếm**, và chỉ cần đủ người là tất cả cùng bị chặn -
    // một lỗi chặn nhầm người thật, tệ hơn nhiều so với bỏ lọt vài lượt.
    expect(ipTuHeader({})).toBeNull();
    expect(ipTuHeader({ vercel: null, real: null, forwarded: null })).toBeNull();
    expect(ipTuHeader({ vercel: "", real: "   ", forwarded: ",,," })).toBeNull();
  });

  it("cắt bớt chuỗi dài - khoá đi thẳng vào cột DB", () => {
    expect(ipTuHeader({ vercel: "x".repeat(500) })!.length).toBeLessThanOrEqual(64);
  });
});

// ---------------------------------------------------------------------------
// ĐƯỜNG DÂY - đọc mã nguồn.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, "..", "src");
const doc = (p: string) => readFileSync(join(SRC, ...p.split("/")), "utf8");
// ⚠️ `(?<!:)` là chỗ đã mất một lượt chạy: bản chép ở các bộ kiểm cũ cắt từ `//` tới hết
// dòng, nên nó **ăn luôn URL** - `fetch("https://api.vietqr.io/...")` biến thành
// `fetch("https:`. Phép kiểm đi tìm tên miền đó rồi báo là mã nguồn không gọi ra ngoài.
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
function thanHam(src: string, ten: string): string {
  const khuc = boChuThich(src).split(/(?:export )?async function /).slice(1);
  return khuc.find((k) => k.slice(0, k.indexOf("(")).trim() === ten) ?? "";
}

describe("§11.50 - phần thuần phải THẬT SỰ thuần", () => {
  it("nhip-meta.ts không import Prisma và không import next/headers", () => {
    // Cùng luật với messages-meta.ts / notify-meta.ts (§1.2). Lỡ kéo Prisma vào đây là
    // kéo cả client bundle theo, và bộ kiểm này sẽ không chạy nổi.
    // Bỏ chú thích trước: chính file đó có một dòng chú thích viết "KHÔNG import
    // next/headers", và phép quét thô sẽ bắt đúng dòng dặn dò ấy rồi báo đỏ.
    const meta = boChuThich(doc("lib/nhip-meta.ts"));
    expect(meta).not.toContain("@/lib/db");
    expect(meta).not.toContain("next/headers");
    expect(meta).not.toContain("@prisma/client");
  });
});

describe("§11.50 - bộ đếm phải là MỘT câu lệnh nguyên tử", () => {
  const nhip = boChuThich(doc("lib/nhip.ts"));

  it("⭐ dùng INSERT … ON CONFLICT DO UPDATE, không phải đọc-rồi-ghi", () => {
    // Kẻ dò mật khẩu không bắn tuần tự - họ bắn hàng trăm lượt song song. "Đọc bộ đếm,
    // thấy dưới ngưỡng, rồi ghi tăng" thì cả trăm lượt cùng đọc được số cũ và cùng đi lọt:
    // hàng rào có mặt, bộ kiểm xanh, và không chặn được gì trong đúng tình huống nó sinh
    // ra để chặn.
    expect(nhip).toContain("ON CONFLICT");
    expect(nhip).toContain("DO UPDATE");
    expect(nhip).toMatch(/\$queryRaw/);
  });

  it("cửa sổ được đặt lại trong CÙNG câu lệnh đó", () => {
    // Nếu phép "hết giờ thì về 0" nằm ở một câu lệnh riêng thì lại hở đúng khe vừa bịt.
    expect(nhip).toMatch(/CASE WHEN[\s\S]*?"windowAt"/);
  });

  it("⭐ khoá rỗng thì BỎ QUA ngăn, không gộp thành một khoá chung", () => {
    const than = thanHam(doc("lib/nhip.ts"), "chanNhip");
    expect(than).not.toBe("");
    expect(than).toContain("filter");
    // Không được có thứ gì kiểu `khoa ?? "khong-ro"`.
    expect(than).not.toMatch(/\?\?\s*["'`]/);
  });

  it("hỏng thì MỞ cửa nhưng phải kêu to", () => {
    // Bàn cân đã chọn: một bảng đếm trục trặc không được phép giết cả đường đăng ký. Đổi
    // lại thì không được im - §11.47 đã dạy giá của một biên giới chết câm.
    expect(nhip).toContain("console.error");
  });

  it("tự kiểm: thanHam cắt đúng thân hàm", () => {
    const bo = thanHam(doc("lib/nhip.ts"), "xoaNhip");
    expect(bo).not.toBe("");
    expect(bo).not.toContain("ON CONFLICT");
  });
});

describe("§11.50 - hai cửa gửi mã", () => {
  const src = doc("app/auth-actions.ts");

  for (const ham of ["sendRegisterCode", "sendResetCode"]) {
    it(`⭐ ${ham} chặn TRƯỚC khi tra email có tài khoản chưa`, () => {
      // Cả hai cửa đều trả lời thẳng rằng một email đã có tài khoản hay chưa - tiện cho
      // người dùng thật, nhưng cũng là một máy tra cứu. Đặt bộ đếm SAU phép tra đó thì mọi
      // lượt bị chặn sớm **không được đếm**, và máy tra cứu chạy không giới hạn dù hàng rào
      // vẫn nằm nguyên trong file. Đây là thứ chỉ vị trí mới nói được, `tsc` thì không.
      const than = thanHam(src, ham);
      expect(than).not.toBe("");
      const iChan = than.indexOf("chanGuiMa");
      const iTra = than.indexOf("prisma.user.findUnique");
      expect(iChan, `${ham} khong goi chanGuiMa`).toBeGreaterThanOrEqual(0);
      expect(iTra, `${ham} khong tra user`).toBeGreaterThanOrEqual(0);
      expect(iChan, `${ham}: hang rao dat SAU phep tra email`).toBeLessThan(iTra);
    });
  }

  it("chặn theo CẢ địa chỉ mạng lẫn email", () => {
    // Chỉ khoá theo email là đúng cái `OTP_RESEND_COOLDOWN_MS` đã làm, và nó không cản
    // được ai đổi email mỗi lượt - mà mỗi lượt đi lọt là một email thật rời khỏi hạn mức
    // Resend của nông trại, gửi tới một hộp thư không hề yêu cầu.
    const than = thanHam(src, "chanGuiMa");
    expect(than).toContain("gui-ma-ip");
    expect(than).toContain("gui-ma-email");
    expect(than).toContain("ipHienTai()");
  });
});

describe("§11.50 - đăng nhập", () => {
  const than = thanHam(doc("app/auth-actions.ts"), "login");

  it("chặn theo cả IP lẫn tên đăng nhập, TRƯỚC khi so mật khẩu", () => {
    const iChan = than.indexOf("chanNhip");
    const iSo = than.indexOf("verifyPassword");
    expect(iChan).toBeGreaterThanOrEqual(0);
    expect(iSo).toBeGreaterThanOrEqual(0);
    expect(iChan).toBeLessThan(iSo);
    expect(than).toContain("dang-nhap-ip");
    expect(than).toContain("dang-nhap-ten");
  });

  it("đăng nhập ĐÚNG thì xoá bộ đếm của tên đó", () => {
    // Nếu không xoá, người đăng nhập nhiều lần trong ngày sẽ tự khoá chính mình.
    expect(than).toContain("xoaNhip");
    expect(than).toMatch(/xoaNhip\(\[\s*\[\s*"dang-nhap-ten"/);
  });

  it("⭐ KHÔNG xoá bộ đếm theo IP khi đăng nhập đúng", () => {
    // Xoá nó nghĩa là kẻ đang dò mật khẩu tài khoản người khác chỉ cần thỉnh thoảng đăng
    // nhập vào tài khoản của chính mình là đặt lại bộ đếm chung.
    const sauKhiXoa = than.slice(than.indexOf("xoaNhip"));
    expect(sauKhiXoa).not.toContain("dang-nhap-ip");
  });

  it("câu chặn không lộ tài khoản có tồn tại hay không", () => {
    // Bộ đếm tăng trước cả phép tra `user`, nên câu trả về giống hệt nhau cho email có
    // thật và email bịa - giữ nguyên tính chất mà `login` vốn đã cẩn thận có.
    const iChan = than.indexOf("chanNhip");
    const iTra = than.indexOf("prisma.user.findUnique");
    expect(iChan).toBeLessThan(iTra);
  });
});

describe("§11.50 - tra tên chủ tài khoản (VietQR)", () => {
  const than = thanHam(doc("app/market-actions.ts"), "traCuuChuTaiKhoan");

  it("chặn theo NGƯỜI DÙNG, trước khi gọi ra ngoài", () => {
    // Bắt đăng nhập chặn được người lạ, nhưng đăng ký thì mở cho tất cả - một tài khoản là
    // đủ để chạy vòng lặp qua các số tài khoản và thu về tên chủ của từng số.
    const iChan = than.indexOf("chanNhip");
    const iGoi = than.indexOf("await fetch(");
    expect(iChan).toBeGreaterThanOrEqual(0);
    expect(iGoi).toBeGreaterThanOrEqual(0);
    expect(iChan).toBeLessThan(iGoi);
    expect(than).toContain('"tra-ten"');
    expect(than).toContain("me.id");
  });

  it("bị chặn thì nói ĐÚNG là bị chặn, không đổ cho ngân hàng", () => {
    // Gộp vào câu "chưa tra được" là đổ lỗi cho bên ngoài về một việc do mình chặn - người
    // dùng sẽ bấm lại thêm chục lần nữa vì tưởng là trục trặc đường truyền.
    expect(than).toContain('"qua-nhieu"');
    expect(doc("components/MarketForms.tsx")).toContain('r.ly === "qua-nhieu"');
  });
});

describe("§11.50 - bảng đếm phải được dọn", () => {
  it("cron xoá dòng đã hết cửa sổ", () => {
    // Khoá gồm cả email người gọi tự bịa lẫn địa chỉ mạng - một tập không có trần. Không
    // dọn thì bảng này lớn mãi vì một thứ chỉ có ý nghĩa trong vài chục phút.
    const jobs = boChuThich(doc("lib/jobs.ts"));
    expect(jobs).toContain("prisma.rateLimit.deleteMany");
    expect(jobs).toMatch(/windowAt:\s*\{\s*lt:/);
  });
});
