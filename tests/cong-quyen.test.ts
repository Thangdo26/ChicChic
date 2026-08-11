// CỔNG QUYỀN (`lib/gates.ts`) - §9.5, §9.10, §9.14, §9.17, §9.33, §11.18.
//
// Bộ này lấp đúng vùng mù đã hai lần cho một thứ hỏng toàn phần đi qua bốn đèn xanh:
// kho ảnh thiếu header `apikey` (§10) và lỗ rò `!ownerId` trong `canViewBarn`/`barnViewer`
// (§11.37). Cả hai đều là **quyết định sai**, không phải truy vấn sai.
//
// Hai tầng, cố ý khác nhau về bản chất:
//
//  ① **Bảng quyết định** - gọi thẳng hàm thuần, quét MỌI tổ hợp người-xem × trạng-thái-
//     chuồng. Không có tổ hợp nào được để trống: một ô trống trong bảng này là một câu
//     hỏi chưa ai trả lời, và lỗ rò lần trước nằm đúng ở một ô như thế.
//  ② **Đường dây** - đọc mã nguồn, bắt cái mà tầng ① không thấy được: trang quên gọi
//     cổng, action mới quên kiểm quyền. `tsc` không bao giờ bắt được hai lỗi đó.
//
// ⚠️ Bộ này vẫn KHÔNG phủ: truy vấn Prisma có đúng không, `select` có quên `isPublic`
// không, hai lời gọi chạy đua với nhau ra sao. Những cái đó vẫn phải kiểm tay (§13).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bocMatKhauBasic, boQuaKhoaNo, laQuanTri, moDuocTrangChuong, nongDanVaoDuoc,
  quyenHopThu, quyenThaoTacChuong, quyenXemChuong, type NguoiXem, type QuyenXem,
} from "@/lib/gates";

const CHU = { id: "u-chu", role: "USER" } as const;
const KHACH_LA = { id: "u-la", role: "USER" } as const;
const QUAN_TRI = { id: "u-admin", role: "ADMIN" } as const;
const ND_CUA_CHUONG = { id: "u-nd1", role: "WORKER" } as const;
const ND_KHAC = { id: "u-nd2", role: "WORKER" } as const;

const W1 = "w-cua-chuong";
const W2 = "w-nguoi-khac";

/** Bốn trạng thái một chuồng có thể ở. `khong-chu` = vừa bị hoàn trả (§11.37). */
const CHUONG = {
  "rieng-tu": { ownerId: CHU.id, workerId: W1, isPublic: false },
  "trung-bay": { ownerId: CHU.id, workerId: W1, isPublic: true },
  "khong-chu": { ownerId: null, workerId: W1, isPublic: false },
  "khong-chu-trung-bay": { ownerId: null, workerId: W1, isPublic: true },
} as const;

/** Bảy người có thể đứng trước một chuồng. `null` = khách vãng lai, chưa đăng nhập. */
const AI: Record<string, { me: NguoiXem; myWorkerId: string | null }> = {
  "khach-vang-lai": { me: null, myWorkerId: null },
  "chu-chuong": { me: CHU, myWorkerId: null },
  "nguoi-la": { me: KHACH_LA, myWorkerId: null },
  "quan-tri": { me: QUAN_TRI, myWorkerId: null },
  "nong-dan-phu-trach": { me: ND_CUA_CHUONG, myWorkerId: W1 },
  "nong-dan-chuong-khac": { me: ND_KHAC, myWorkerId: W2 },
  // Nông dân bị tạm dừng: `myWorkerId` về null vì `myWorker` chỉ trả hồ sơ, còn cổng
  // gọi vào đây đã lọc. Ở đây là mô phỏng "không nhận ra hồ sơ nào".
  "nong-dan-tam-dung": { me: ND_CUA_CHUONG, myWorkerId: null },
};

// Bảng đầy đủ: 7 người × 4 trạng thái chuồng = 28 ô, không ô nào để trống.
const BANG: Record<keyof typeof CHUONG, Record<keyof typeof AI, QuyenXem>> = {
  "rieng-tu": {
    "khach-vang-lai": "khong",
    "chu-chuong": "chu",
    "nguoi-la": "khong",
    "quan-tri": "quan-tri",
    "nong-dan-phu-trach": "nong-dan",
    "nong-dan-chuong-khac": "khong",
    "nong-dan-tam-dung": "khong",
  },
  "trung-bay": {
    "khach-vang-lai": "xem-thu",
    // Chủ chuồng mở chính chuồng trưng bày của mình vẫn là CHỦ - ra "xem-thu" là cắt mất
    // hộp thư, hoá đơn và bảng giao việc của họ. Thứ tự nhánh trong `quyenXemChuong`
    // chính là thứ giữ ô này đúng.
    "chu-chuong": "chu",
    "nguoi-la": "xem-thu",
    "quan-tri": "quan-tri",
    "nong-dan-phu-trach": "nong-dan",
    "nong-dan-chuong-khac": "xem-thu",
    "nong-dan-tam-dung": "xem-thu",
  },
  // ⭐ CỘT QUAN TRỌNG NHẤT: chuồng vừa bị hoàn trả. Trước §11.37 cả bảy ô này đều mở.
  "khong-chu": {
    "khach-vang-lai": "khong",
    "chu-chuong": "khong",
    "nguoi-la": "khong",
    "quan-tri": "quan-tri",
    "nong-dan-phu-trach": "nong-dan",
    "nong-dan-chuong-khac": "khong",
    "nong-dan-tam-dung": "khong",
  },
  "khong-chu-trung-bay": {
    "khach-vang-lai": "xem-thu",
    "chu-chuong": "xem-thu",
    "nguoi-la": "xem-thu",
    "quan-tri": "quan-tri",
    "nong-dan-phu-trach": "nong-dan",
    "nong-dan-chuong-khac": "xem-thu",
    "nong-dan-tam-dung": "xem-thu",
  },
};

describe("§9.5 - ai xem được chuồng nào (bảng đầy đủ)", () => {
  for (const [tenChuong, barn] of Object.entries(CHUONG)) {
    for (const [tenNguoi, viewer] of Object.entries(AI)) {
      const mong = BANG[tenChuong as keyof typeof CHUONG][tenNguoi];
      it(`${tenChuong} · ${tenNguoi} → ${mong}`, () => {
        expect(quyenXemChuong({ ...viewer, barn })).toBe(mong);
      });
    }
  }

  it("bảng không bỏ sót ô nào", () => {
    // Thêm một trạng thái chuồng hay một loại người mà quên điền bảng thì đỏ ở đây,
    // chứ không im lặng bỏ qua tổ hợp mới.
    for (const c of Object.keys(CHUONG)) {
      expect(Object.keys(BANG[c as keyof typeof CHUONG]).sort()).toEqual(Object.keys(AI).sort());
    }
    expect(Object.keys(BANG).sort()).toEqual(Object.keys(CHUONG).sort());
  });
});

describe("§11.37 - CHƯA CÓ CHỦ không phải là quyền được xem", () => {
  it("khách vãng lai KHÔNG mở được chuồng vừa bị hoàn trả", () => {
    // Đây là lỗ rò đã đo trên bản chạy thật: `returnBarn` đặt `ownerId = null`, và cổng
    // lại đọc `!ownerId` thành "cho xem". Ba chuồng thật đã mở toang cả cuốn nhật ký ảnh.
    expect(quyenXemChuong({ me: null, myWorkerId: null, barn: CHUONG["khong-chu"] })).toBe("khong");
  });

  it("kể cả tài khoản đã đăng nhập cũng không", () => {
    for (const me of [CHU, KHACH_LA, ND_KHAC]) {
      expect(quyenXemChuong({ me, myWorkerId: null, barn: CHUONG["khong-chu"] })).toBe("khong");
    }
  });

  it("nhưng chuồng TRƯNG BÀY thì vẫn mở - đừng vá quá tay", () => {
    // Vá lỗ rò mà đóng luôn chuồng mẫu là phá mất thứ khách vãng lai nhìn thấy đầu tiên.
    expect(quyenXemChuong({ me: null, myWorkerId: null, barn: CHUONG["trung-bay"] })).toBe("xem-thu");
  });
});

describe("hai cánh cửa, một luật", () => {
  it("trang CÓ THAO TÁC mở đúng khi trang CHỈ-ĐỂ-XEM không trả 'khong'", () => {
    // `canViewBarn` và `barnViewer` từng là hai bản chép tay của cùng một luật, và lỗ rò
    // nằm ở cả hai. Nay chúng cùng gọi `quyenXemChuong`, nên không lệch nhau được nữa.
    for (const barn of Object.values(CHUONG)) {
      for (const viewer of Object.values(AI)) {
        const q = quyenXemChuong({ ...viewer, barn });
        expect(moDuocTrangChuong(q)).toBe(q !== "khong");
      }
    }
  });
});

describe("§9.33 - thao tác lên chuồng của mình", () => {
  it("chưa đăng nhập thì không", () => {
    expect(quyenThaoTacChuong({ me: null, ownerId: CHU.id })).toBe("chua-dang-nhap");
  });

  it("chủ chuồng qua, người lạ không", () => {
    expect(quyenThaoTacChuong({ me: CHU, ownerId: CHU.id })).toBe("cho-qua");
    expect(quyenThaoTacChuong({ me: KHACH_LA, ownerId: CHU.id })).toBe("khong-phai-cua-ban");
  });

  it("chuồng KHÔNG CHỦ thì không ai thao tác được (trừ quản trị)", () => {
    // `ownerId === null` so với `me.id` luôn sai, nhưng viết hẳn phép kiểm để không ai
    // "gọn hoá" thành `ownerId !== me.id` rồi có ngày null lọt qua.
    expect(quyenThaoTacChuong({ me: CHU, ownerId: null })).toBe("khong-phai-cua-ban");
    expect(quyenThaoTacChuong({ me: QUAN_TRI, ownerId: null })).toBe("cho-qua");
  });

  it("nông dân KHÔNG đi lối này - kể cả nông dân phụ trách chuồng đó", () => {
    // Nông dân có cổng riêng (`/nong-trai`). Cho họ qua đây là cho họ đổi tên chuồng,
    // mua trang trí và tiêu tiền của chủ chuồng.
    expect(quyenThaoTacChuong({ me: ND_CUA_CHUONG, ownerId: CHU.id })).toBe("khong-phai-cua-ban");
  });

  it("chỉ QUẢN TRỊ đi qua được khoá nợ tiền nuôi", () => {
    expect(boQuaKhoaNo("ADMIN")).toBe(true);
    expect(boQuaKhoaNo("USER")).toBe(false);
    // Nông dân không bao giờ tới cổng này, nhưng nếu có thì cũng không được miễn - luật
    // §9.33 nói khoá chỉ chặn CHỦ CHUỒNG, và nông dân đi cửa khác hoàn toàn.
    expect(boQuaKhoaNo("WORKER")).toBe(false);
  });
});

describe("§9.10 + §9.17 - hộp thư của chuồng", () => {
  const barn = { ownerId: CHU.id, workerId: W1 };

  it("chủ chuồng và nông dân phụ trách, mỗi bên một vai", () => {
    expect(quyenHopThu({ me: CHU, barn, myActiveWorkerId: null })).toBe("OWNER");
    expect(quyenHopThu({ me: ND_CUA_CHUONG, barn, myActiveWorkerId: W1 })).toBe("WORKER");
  });

  it("nông dân TẠM DỪNG không vào được (§9.10)", () => {
    // `myActiveWorkerId` mang chữ *active* trong tên đúng vì lý do này: truyền id của
    // một hồ sơ đang tạm dừng vào đây là mở lại cánh cửa lệnh tạm dừng vừa đóng.
    expect(quyenHopThu({ me: ND_CUA_CHUONG, barn, myActiveWorkerId: null })).toBeNull();
  });

  it("nông dân chuồng khác không vào được", () => {
    expect(quyenHopThu({ me: ND_KHAC, barn, myActiveWorkerId: W2 })).toBeNull();
  });

  it("người lạ và khách vãng lai không vào được", () => {
    expect(quyenHopThu({ me: KHACH_LA, barn, myActiveWorkerId: null })).toBeNull();
    expect(quyenHopThu({ me: null, barn, myActiveWorkerId: null })).toBeNull();
  });

  it("QUẢN TRỊ cũng không đi lối này (§9.17)", () => {
    // Nông trại chỉ đọc hộp thư CÓ CỜ, qua `messages.adminThread`. Luật này được in ngay
    // trong hộp thư cho cả hai bên đọc, nên nới nó ra là nói dối người dùng.
    expect(quyenHopThu({ me: QUAN_TRI, barn, myActiveWorkerId: null })).toBeNull();
  });

  it("chuồng CHƯA CÓ CHỦ thì không có hộp thư nào cả", () => {
    // Không có luật này thì mọi tài khoản đều nhắn được vào /chuong/demo, và người đọc
    // là cô chú nông dân thật.
    const demo = { ownerId: null, workerId: W1 };
    expect(quyenHopThu({ me: KHACH_LA, barn: demo, myActiveWorkerId: null })).toBeNull();
    expect(quyenHopThu({ me: ND_CUA_CHUONG, barn: demo, myActiveWorkerId: W1 })).toBeNull();
  });
});

describe("cổng /admin", () => {
  it("tài khoản role ADMIN đi thẳng", () => {
    expect(laQuanTri({ role: "ADMIN", matKhauGui: null, matKhauThat: "x", laProduction: true })).toBe(true);
  });

  it("⚠️ CHƯA đặt ADMIN_PASSWORD: production TỪ CHỐI, dev cho qua", () => {
    // Thiếu biến môi trường là lỗi cấu hình, không phải "chế độ mở". Quên đặt trên Vercel
    // mà mở toang /admin nghĩa là ai cũng tự xác nhận cọc cho chính mình được.
    expect(laQuanTri({ role: null, matKhauGui: null, matKhauThat: undefined, laProduction: true })).toBe(false);
    expect(laQuanTri({ role: "USER", matKhauGui: "gi-do", matKhauThat: undefined, laProduction: true })).toBe(false);
    expect(laQuanTri({ role: null, matKhauGui: null, matKhauThat: undefined, laProduction: false })).toBe(true);
  });

  it("mật khẩu đúng thì qua, sai/thiếu thì không", () => {
    const t = (matKhauGui: string | null) =>
      laQuanTri({ role: "USER", matKhauGui, matKhauThat: "bimat", laProduction: true });
    expect(t("bimat")).toBe(true);
    expect(t("bimat ")).toBe(false);
    expect(t("BIMAT")).toBe(false);
    expect(t("")).toBe(false);
    expect(t(null)).toBe(false);
  });

  it("mật khẩu RỖNG hai bên vẫn không được coi là khớp", () => {
    // `"" === ""` là true. Không chặn thì một header dựng sai mở được cả /admin.
    expect(laQuanTri({ role: "USER", matKhauGui: "", matKhauThat: "", laProduction: true })).toBe(false);
  });

  it("bóc mật khẩu khỏi header Basic", () => {
    const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
    expect(bocMatKhauBasic(`Basic ${b64("admin:bimat")}`)).toBe("bimat");
    // Mật khẩu CÓ dấu hai chấm: cắt bằng `split(":")[1]` là cắt cụt, rồi so sánh trượt.
    expect(bocMatKhauBasic(`Basic ${b64("admin:a:b:c")}`)).toBe("a:b:c");
  });

  it("header hỏng / thiếu là KHÔNG CÓ QUYỀN, không phải chuỗi rỗng", () => {
    for (const h of [null, undefined, "", "Bearer abc", "Basic", "Basic !!!khong-phai-base64!!!"]) {
      expect(bocMatKhauBasic(h)).toBeNull();
    }
    // Không có dấu hai chấm ⟹ không phải cặp user:pass.
    expect(bocMatKhauBasic(`Basic ${Buffer.from("chi-co-ten").toString("base64")}`)).toBeNull();
  });
});

describe("§9.10 - nông dân bị tạm dừng", () => {
  it("chỉ hồ sơ ĐANG HOẠT ĐỘNG mới vào cổng nông dân", () => {
    expect(nongDanVaoDuoc({ active: true })).toBe(true);
    expect(nongDanVaoDuoc({ active: false })).toBe(false);
    // Không có hồ sơ ⟹ không phải nông dân ⟹ cũng không vào được.
    expect(nongDanVaoDuoc(null)).toBe(false);
    expect(nongDanVaoDuoc(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ② ĐƯỜNG DÂY - đọc mã nguồn. Bắt cái mà bảng quyết định không thấy được.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, "..", "src");
const doc = (p: string) => readFileSync(p, "utf8");
/** Bỏ chú thích - nhắc tên một cổng trong chú thích không phải là gọi nó. */
const boChuThich = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Đường dẫn ngắn để đọc tên phép kiểm - Windows dùng `\`, đổi hết về `/`. */
const duongDan = (p: string, tu: string) => p.slice(p.indexOf(tu)).split("\\").join("/");

function quetFile(thuMuc: string, hop: (p: string) => boolean): string[] {
  const ra: string[] = [];
  const di = (d: string) => {
    for (const t of readdirSync(d)) {
      const p = join(d, t);
      if (statSync(p).isDirectory()) di(p);
      else if (hop(p)) ra.push(p);
    }
  };
  di(thuMuc);
  return ra;
}

describe("mọi trang chuồng đều đi qua một cổng", () => {
  // CHỈ trang của MỘT chuồng cụ thể (`chuong/[id]/…`). `chuong/page.tsx` là danh sách
  // chuồng của chính mình - nó đi cổng khác (`requireUser` + truy vấn lọc theo `ownerId`),
  // và bắt nó gọi `canViewBarn` là vô nghĩa vì không có chuồng nào để hỏi.
  const trang = quetFile(join(SRC, "app", "chuong", "[id]"), (p) => p.endsWith("page.tsx"));

  it("tìm thấy đủ các trang chuồng", () => {
    expect(trang.length).toBeGreaterThanOrEqual(8);
  });

  for (const p of trang) {
    const ten = duongDan(p, "chuong");
    it(`${ten} gọi một cổng`, () => {
      // Thêm một trang chuồng mới mà quên cổng là lỗi `tsc` không bao giờ bắt được, và
      // hậu quả là ai biết slug cũng đọc được (§9.5). Ba cổng hợp lệ, không có cổng thứ tư.
      const src = boChuThich(doc(p));
      const co = ["canViewBarn", "barnViewer", "threadAccess"].filter((g) => src.includes(`${g}(`));
      expect(co, `${ten} không gọi cổng nào`).not.toHaveLength(0);
    });
  }

  it("danh sách chuồng chỉ lấy chuồng CỦA MÌNH", () => {
    // Trang này không hỏi `canViewBarn`, nên thứ giữ nó an toàn là câu truy vấn. Bỏ
    // `ownerId` khỏi `where` là liệt kê chuồng của cả nông trại cho một người xem.
    const src = boChuThich(doc(join(SRC, "app", "chuong", "page.tsx")));
    expect(src).toContain("requireUser(");
    expect(src).toMatch(/ownerId:\s*me\.id/);
  });
});

describe("mọi server action đều kiểm quyền", () => {
  const files = quetFile(join(SRC, "app"), (p) => p.endsWith("-actions.ts"));

  /**
   * Action **cố ý công khai** - phải có mặt ở đây kèm lý do, không được lặng lẽ bỏ qua.
   *
   * Danh sách này chính là bề mặt tấn công không cần đăng nhập của cả sản phẩm. Ai thêm
   * một dòng vào đây là đang mở thêm một cửa - và phải viết được lý do trước khi mở.
   */
  const CONG_KHAI: Record<string, string> = {
    sendRegisterCode: "gửi mã OTP để đăng ký - chưa ai đăng nhập được lúc này; có hạn tần suất riêng",
    verifyAndRegister: "xác minh OTP rồi tạo tài khoản - chính là bước tạo ra phiên đầu tiên",
    login: "đăng nhập bằng email/username + mật khẩu",
    logout: "đăng xuất - không có gì để bảo vệ",
    sendResetCode: "quên mật khẩu: gửi mã về email; có hạn tần suất riêng",
    resetPassword: "đặt lại mật khẩu bằng mã OTP - mã CHÍNH LÀ cổng ở đây",
    coTraCuuTen: "chỉ trả lời 'nông trại có bật tra tên tài khoản không', không đọc dữ liệu của ai",
  };

  const GATE = [
    "getSessionUser", "requireUser", "ownedBarn", "isAdmin", "denyIfNotAdmin",
    "activeWorkerSession", "requireWorker", "threadAccess", "getWorkerSession",
    "canViewBarn", "barnViewer",
  ];

  for (const p of files) {
    const ten = duongDan(p, "app");
    const src = boChuThich(doc(p));

    // Nhiều file có CỔNG PHỤ của riêng nó (`ownedBarn`, `ownerOf`, `chuongNghiHuu`…):
    // một hàm nội bộ tự gọi cổng thật rồi trả về "cho qua / từ chối". Gọi nó cũng là
    // kiểm quyền. Chấp nhận chúng thay vì bắt mọi action phải gọi thẳng
    // `getSessionUser` - ép thế là ép người ta **chép lại luật ở 76 chỗ**, đúng cái thói
    // quen đã đẻ ra §11.37.
    const congPhu = src.split(/\basync function /).slice(1)
      .filter((k) => GATE.some((g) => k.includes(`${g}(`)))
      .map((k) => k.slice(0, k.indexOf("(")).trim());
    const CHAP_NHAN = [...GATE, ...congPhu];

    const khuc = src.split(/export async function /).slice(1);

    for (const k of khuc) {
      const tenHam = k.slice(0, k.indexOf("(")).trim();
      it(`${ten} · ${tenHam}`, () => {
        if (CONG_KHAI[tenHam]) {
          expect(CONG_KHAI[tenHam].length, "lý do công khai quá sơ sài").toBeGreaterThan(10);
          return;
        }
        // Mỗi "use server" là một endpoint công khai (§1.2 luật 4). Không có cổng ở đầu
        // hàm nghĩa là ai cũng gọi được bằng một dòng fetch, và middleware KHÔNG chặn.
        const co = CHAP_NHAN.filter((g) => k.includes(`${g}(`));
        expect(co, `${tenHam} không gọi cổng nào - thêm cổng, hoặc khai vào CONG_KHAI kèm lý do`)
          .not.toHaveLength(0);
      });
    }
  }
});

describe("luật import của cổng quyền", () => {
  it("không component client nào import @/lib/gates hay @/lib/auth (§1.2 luật 1)", () => {
    const comps = quetFile(join(SRC, "components"), (p) => p.endsWith(".tsx"));
    const pham = comps.filter((p) => {
      const s = doc(p);
      return s.includes('"use client"') && /from "@\/lib\/(gates|auth|db)"/.test(s);
    });
    expect(pham, `component client không được import cổng quyền: ${pham.join(", ")}`).toHaveLength(0);
  });

  it("lib/gates.ts thuần - không Prisma, không next/headers, không node:*", () => {
    // Nó phải import được từ bộ kiểm này, và không được kéo theo thứ gì của Node. Bỏ chú
    // thích trước: file có nhắc chữ `Buffer` trong phần giải thích **vì sao không dùng nó**.
    const s = boChuThich(doc(join(SRC, "lib", "gates.ts")));
    expect(s).not.toMatch(/from "@\/lib\/db"/);
    expect(s).not.toMatch(/from "next\//);
    expect(s).not.toMatch(/from "node:/);
    expect(s).not.toMatch(/\bBuffer\b/);
  });
});
