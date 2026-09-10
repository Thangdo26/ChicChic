// FAMILY LEARNING - Epic 2: hồ sơ trẻ · consent · quyền riêng tư.
//
// Bộ kiểm này canh bốn thứ, và cả bốn đều thuộc loại "hỏng thì không sửa lại được":
//
//  1. **Cha mẹ A không chạm được hồ sơ con của cha mẹ B.** Một phép so, phủ bằng bảng đầy đủ.
//  2. **`Flock.lifecyclePolicy` có ĐÚNG MỘT đường ghi** (§9.37) - và rút consent / xoá dữ
//     liệu trẻ không nằm gần nó. Đây là lời hứa với một đứa trẻ về một con gà có thật.
//  3. **Ba việc phải gõ lại mật khẩu**, và phép kiểm đó đứng TRƯỚC phép ghi.
//  4. **Không thu dữ liệu trẻ ngoài ba trường đã khai** (FL-D11) - quét cả schema lẫn biểu mẫu.
//
// Không nối DB, không dựng server. Phần nào cần chạy thật thì ghi ở CODEMAP §13.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { NHIP } from "@/lib/nhip-meta";
import {
  AVATAR_TRE, CONSENT_PURPOSES, CONSENT_VERSION, MAX_BIET_DANH, RECENT_AUTH_MS,
  avatarEmoji, canAssent, canEnterChildSpace, canParentManageChild, conHieuLucXacMinh,
  hopLeAvatar, hopLeNhomTuoi, type TrangThaiTre,
} from "@/lib/family-gates";

const doc = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");

/** Thân một hàm - từ tên hàm tới hàm `async function` kế tiếp. Cùng bản với `family.test.ts`. */
function thanHam(src: string, ten: string): string {
  const khuc = boChuThich(src).split(/(?:export )?async function /).slice(1);
  return khuc.find((k) => k.slice(0, k.indexOf("(")).trim() === ten) ?? "";
}

/** Mọi file mã nguồn dưới `src/`. */
function moiFileNguon(thuMuc = "src"): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(join(process.cwd(), thuMuc))) {
    const duong = `${thuMuc}/${ten}`;
    if (statSync(join(process.cwd(), duong)).isDirectory()) ra.push(...moiFileNguon(duong));
    else if (/\.tsx?$/.test(ten)) ra.push(duong);
  }
  return ra;
}

const ACTIONS = doc("src/app/family-actions.ts");
const SCHEMA = doc("prisma/schema.prisma");

// ---------------------------------------------------------------------------
// Danh sách đóng - thứ duy nhất đứng giữa một cột chữ và một cột nhận ảnh tự do
// ---------------------------------------------------------------------------

describe("hồ sơ trẻ - danh sách đóng", () => {
  it("⭐ avatarKey CHỈ nhận khoá trong danh sách", () => {
    // Cột này là thứ duy nhất trong hồ sơ trẻ có hình dạng "tài nguyên". Nhận đường dẫn tự
    // do nghĩa là nhận ảnh tự do - đúng thứ FL-D11 cấm thu.
    for (const a of AVATAR_TRE) expect(hopLeAvatar(a.key), a.key).toBe(true);
    for (const xau of [
      "", " ", "ga-con ", "GA-CON", "/uploads/be.jpg", "https://x/y.png",
      "../../etc/passwd", null, undefined, 0, {}, [],
    ]) {
      expect(hopLeAvatar(xau), JSON.stringify(xau)).toBe(false);
    }
  });

  it("danh sách avatar không trùng khoá và không rỗng", () => {
    const khoa = AVATAR_TRE.map((a) => a.key);
    expect(khoa.length).toBeGreaterThan(0);
    expect(new Set(khoa).size).toBe(khoa.length);
    for (const a of AVATAR_TRE) {
      expect(a.key.trim(), a.key).not.toBe("");
      expect(a.emoji.trim(), a.key).not.toBe("");
      expect(a.ten.trim(), a.key).not.toBe("");
    }
  });

  it("khoá lạ vẫn vẽ được một hình, không để ô trống", () => {
    // Hồ sơ đã xoá mang khoá rỗng. Ô trống giữa danh sách trông như lỗi hiển thị.
    expect(avatarEmoji("")).not.toBe("");
    expect(avatarEmoji(null)).not.toBe("");
    expect(avatarEmoji("ga-con")).toBe(AVATAR_TRE[0].emoji);
  });

  it("nhóm tuổi chỉ có đúng hai giá trị", () => {
    expect(hopLeNhomTuoi("AGE_5_6")).toBe(true);
    expect(hopLeNhomTuoi("AGE_7_8")).toBe(true);
    for (const xau of ["AGE_9_10", "age_5_6", "5-6", "", null, undefined, 7]) {
      expect(hopLeNhomTuoi(xau), JSON.stringify(xau)).toBe(false);
    }
  });

  it("⭐ chỉ nhóm 7–8 phải hỏi ý chính bé", () => {
    // Chuẩn sản phẩm tự đặt (spec §17.1): cha mẹ đã đồng ý, nhưng người sắp dùng màn hình
    // đó là đứa trẻ. Nhóm 5–6 chưa đọc trôi nên hỏi bằng chữ là hỏi vào không khí.
    expect(canAssent("AGE_7_8")).toBe(true);
    expect(canAssent("AGE_5_6")).toBe(false);
  });

  it("bản cam kết và danh sách mục đích là chuỗi không rỗng, đóng", () => {
    // Cả hai được CHỤP vào từng dấu mốc consent - rỗng thì một năm sau không dựng lại được
    // cha mẹ đã đọc gì.
    expect(CONSENT_VERSION.trim()).not.toBe("");
    expect(CONSENT_PURPOSES.length).toBeGreaterThan(0);
    for (const m of CONSENT_PURPOSES) expect(m.trim()).not.toBe("");
    // Không có cái đuôi "và các mục đích khác" - đó là chỗ mọi lời hứa về dữ liệu đi ra ngoài.
    expect(CONSENT_PURPOSES.join(" ")).not.toMatch(/khac|other|v\.v/i);
  });

  it("biệt danh có trần, và trần đó ngắn", () => {
    expect(MAX_BIET_DANH).toBeGreaterThan(0);
    expect(MAX_BIET_DANH).toBeLessThanOrEqual(32);
  });
});

// ---------------------------------------------------------------------------
// Xác minh lại
// ---------------------------------------------------------------------------

describe("xác minh lại (recent-auth)", () => {
  it("⭐ không có dấu ⟹ CHƯA xác minh", () => {
    // `null` là phiên chưa bao giờ gõ lại mật khẩu. Một cột `null` không bao giờ được tự
    // dịch thành "chắc là được" - đúng bài học §11.37.
    expect(conHieuLucXacMinh(null)).toBe(false);
    expect(conHieuLucXacMinh(undefined)).toBe(false);
    expect(conHieuLucXacMinh(new Date("khong-phai-ngay"))).toBe(false);
  });

  it("còn hạn thì đi qua, hết hạn thì không", () => {
    const now = Date.now();
    expect(conHieuLucXacMinh(new Date(now), now)).toBe(true);
    expect(conHieuLucXacMinh(new Date(now - RECENT_AUTH_MS + 1_000), now)).toBe(true);
    expect(conHieuLucXacMinh(new Date(now - RECENT_AUTH_MS - 1), now)).toBe(false);
    expect(conHieuLucXacMinh(new Date(now - 86_400_000), now)).toBe(false);
  });

  it("⭐ mốc ở TƯƠNG LAI cũng là không hợp lệ", () => {
    // Đồng hồ máy chủ nhảy, hoặc ai đó sửa tay một dòng dưới DB. Một mốc tương lai mà được
    // chấp nhận là một cửa mở vĩnh viễn.
    const now = Date.now();
    expect(conHieuLucXacMinh(new Date(now + 60_000), now)).toBe(false);
  });

  it("hiệu lực ngắn - đủ đọc xong một trang, không đủ cả buổi chiều", () => {
    expect(RECENT_AUTH_MS).toBeGreaterThan(60_000);
    expect(RECENT_AUTH_MS).toBeLessThanOrEqual(15 * 60_000);
  });

  it("dấu nằm trên Session, không nằm trên User", () => {
    // Gõ đúng mật khẩu ở máy này không được mở cửa cho cái phiên còn treo ở máy quán net
    // tuần trước.
    const session = SCHEMA.slice(SCHEMA.indexOf("model Session {"));
    expect(session.slice(0, session.indexOf("\n}"))).toMatch(/reauthAt\s+DateTime\?/);
    const user = SCHEMA.slice(SCHEMA.indexOf("model User {"));
    expect(user.slice(0, user.indexOf("\n}"))).not.toContain("reauthAt");
  });

  it("⭐ đọc dấu mà lỗi thì coi như CHƯA xác minh", () => {
    const than = thanHam(doc("src/lib/family.ts"), "daXacMinhGanDay");
    expect(than).not.toBe("");
    expect(than).toContain("if (!token) return false");
    // Có `catch`, và trong `catch` là `return false` chứ không phải `return true`.
    const sauCatch = than.slice(than.indexOf("catch"));
    expect(sauCatch).toContain("return false");
    expect(sauCatch).not.toContain("return true");
  });
});

// ---------------------------------------------------------------------------
// Cổng quyền - cha mẹ A không chạm được con của cha mẹ B
// ---------------------------------------------------------------------------

const MOI_TRANG_THAI: TrangThaiTre[] =
  ["DRAFT", "ACTIVE", "CONSENT_WITHDRAWN", "DELETION_PENDING", "DELETED"];

describe("§9.37 - cổng hồ sơ trẻ", () => {
  it("⭐ tài khoản khác KHÔNG chạm được, ở MỌI trạng thái", () => {
    // Điều kiện nghiệm thu đầu tiên của Epic 2. Không có ngoại lệ nào - kể cả admin: hồ sơ
    // trẻ không phải dữ liệu vận hành của nông trại.
    for (const childStatus of MOI_TRANG_THAI) {
      expect(canParentManageChild({ sessionUserId: "u-A", parentId: "u-B", childStatus }), childStatus)
        .toBe(false);
    }
  });

  it("⭐ chưa đăng nhập thì không, dù hồ sơ có ra sao", () => {
    for (const sessionUserId of [null, undefined, ""]) {
      expect(canParentManageChild({ sessionUserId, parentId: "u-A", childStatus: "ACTIVE" }))
        .toBe(false);
    }
    // Và `parentId` rỗng cũng không được khớp với phiên rỗng thành "cùng một người".
    expect(canParentManageChild({ sessionUserId: "", parentId: "", childStatus: "ACTIVE" })).toBe(false);
    expect(canParentManageChild({ sessionUserId: null, parentId: null, childStatus: "ACTIVE" })).toBe(false);
  });

  it("đúng cha mẹ thì quản lý được, trừ hồ sơ đã xoá", () => {
    for (const childStatus of ["DRAFT", "ACTIVE", "CONSENT_WITHDRAWN"] as TrangThaiTre[]) {
      expect(canParentManageChild({ sessionUserId: "u-A", parentId: "u-A", childStatus }), childStatus)
        .toBe(true);
    }
    // Bia mộ thì không còn gì để sửa - kể cả với chính cha mẹ.
    for (const childStatus of ["DELETED", "DELETION_PENDING"] as TrangThaiTre[]) {
      expect(canParentManageChild({ sessionUserId: "u-A", parentId: "u-A", childStatus }), childStatus)
        .toBe(false);
    }
  });
});

describe("§9.37 - khu của bé: mọi điều kiện phải CÙNG đúng", () => {
  const DU = {
    featureEnabled: true, ownsChild: true, childStatus: "ACTIVE" as TrangThaiTre,
    consentActive: true, enrollmentActive: true,
  };

  it("đủ cả năm thì vào được", () => {
    expect(canEnterChildSpace(DU)).toBe(true);
  });

  it("⭐ thiếu BẤT KỲ điều kiện nào là không vào được", () => {
    // Viết kiểu "thiếu cái này thì thôi bỏ qua" ở một cổng dành cho trẻ em là cách hỏng tệ
    // nhất mà repo này có thể hỏng.
    for (const khoa of ["featureEnabled", "ownsChild", "consentActive", "enrollmentActive"] as const) {
      expect(canEnterChildSpace({ ...DU, [khoa]: false }), khoa).toBe(false);
    }
  });

  it("⭐ rút consent KHOÁ khu của bé ngay - mọi trạng thái ngoài ACTIVE đều đóng", () => {
    // Spec §17.3 mục 1. Khu của bé là Epic 5 nên chưa có route nào gọi hàm này; cách trung
    // thực để chốt điều kiện nghiệm thu khi cửa chưa dựng là chốt cái khoá trước.
    for (const childStatus of MOI_TRANG_THAI.filter((s) => s !== "ACTIVE")) {
      expect(canEnterChildSpace({ ...DU, childStatus }), childStatus).toBe(false);
    }
    for (const childStatus of [null, undefined]) {
      expect(canEnterChildSpace({ ...DU, childStatus })).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// §9.37 - `Flock.lifecyclePolicy` có ĐÚNG MỘT đường ghi
// ---------------------------------------------------------------------------

describe("§9.37 - cam kết vòng đời chỉ có một cửa, và không đảo ngược", () => {
  const nhan = thanHam(ACTIONS, "nhanLoiMoiGiaDinh");

  it("thân hàm đọc được (tự kiểm)", () => {
    expect(nhan).not.toBe("");
    expect(nhan).toContain("familyEnrollment.updateMany");
  });

  it("⭐ nhanLoiMoiGiaDinh là nơi khoá - và khoá trong CÙNG transaction với suất", () => {
    // Đàn bị khoá mà suất còn `INVITED` là một đàn gà mang cam kết không ai nhớ vì sao.
    expect(nhan).toContain("$transaction");
    expect(nhan).toContain("flock.update");
    expect(nhan).toContain("lifecyclePolicy");
    const iTx = nhan.indexOf("$transaction");
    expect(iTx).toBeLessThan(nhan.indexOf("flock.update"));
  });

  it("⭐ KHÔNG phép ghi nào khác trong src/ đặt lifecyclePolicy lên Flock", () => {
    // Đây là phép kiểm giữ §9.37 khỏi bị nới bằng một đường ghi thứ hai ở đợt sau - loại
    // thay đổi trông vô hại trong diff và không ai nhớ để hỏi.
    //
    // Xét theo TỪNG LỜI GỌI chứ không theo cả file: `actions.ts` vừa **đọc**
    // `barn.flock.lifecyclePolicy` (ở `decideEndOfLay`) vừa có `flock.update` cho việc đổi
    // giai đoạn - hai chuyện không liên quan, và một phép kiểm ở mức file sẽ đỏ vì lý do sai.
    const pham: string[] = [];
    for (const f of moiFileNguon()) {
      if (f === "src/app/family-actions.ts") continue;
      const s = boChuThich(doc(f));
      const ast = ts.createSourceFile(f, s, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && /\.flock\.update(?:Many)?$/.test(node.expression.getText(ast))) {
          const arg = node.arguments[0];
          if (arg && ts.isObjectLiteralExpression(arg)) {
            const data = arg.properties.find((p) => p.name?.getText(ast) === "data");
            // CAS đọc policy trong WHERE không phải là ghi lời hứa mới.
            if (data && /\blifecyclePolicy\b/.test(data.getText(ast))) pham.push(f);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(pham).toEqual([]);
  });

  it("⭐ rút consent và xoá dữ liệu KHÔNG đụng tới đàn gà", () => {
    // Spec §17.3 mục 4 và §17.4. Đàn gà không biết gì về consent; cam kết đã hứa thì nông
    // trại giữ, dù cuốn album của bé có còn hay không.
    for (const ten of ["rutConsentTre", "xoaDuLieuTre"]) {
      const than = thanHam(ACTIONS, ten);
      expect(than, ten).not.toBe("");
      expect(than, ten).not.toContain("lifecyclePolicy");
      expect(than, ten).not.toContain("flock");
      expect(than, ten).not.toContain("Flock");
    }
  });

  it("⭐ không có đường nào đặt lại STANDARD", () => {
    // Không có `boLoiMoi`. Cam kết là một chiều: một lời hứa với một đứa trẻ về một con gà
    // có thật, và nông trại phải giữ bằng thức ăn và công người thật.
    expect(boChuThich(ACTIONS)).not.toContain("STANDARD");
  });

  it("nhận lời mời kiểm CẢ người được mời LẪN chủ chuồng hiện tại", () => {
    // Chuồng đổi chủ sau khi mời thì người cũ không được quyết thay người mới.
    expect(nhan).toContain("suat.parentId !== me.id");
    expect(nhan).toContain("barn.ownerId !== me.id");
  });

  it("nhận lời mời đòi hồ sơ bé ACTIVE và dùng chung cổng canParentManageChild", () => {
    expect(nhan).toContain("canParentManageChild");
    expect(nhan).toContain('child.status !== "ACTIVE"');
  });

  it("so-sánh-rồi-đặt: hai tab cùng bấm chỉ một tab đi lọt", () => {
    expect(nhan).toContain('status: "INVITED"');
    expect(nhan).toContain("changed.count !== 1");
  });
});

// ---------------------------------------------------------------------------
// Ba việc phải gõ lại mật khẩu - và phép kiểm đứng TRƯỚC phép ghi
// ---------------------------------------------------------------------------

const CAN_XAC_MINH = ["taoHoSoTre", "rutConsentTre", "xoaDuLieuTre"];

describe("§9.37 - ba việc nhạy cảm phải xác minh lại", () => {
  it("⭐ cả ba đều gọi daXacMinhGanDay", () => {
    // Spec §17.1. Phiên sống 30 ngày; "đã đăng nhập" không đồng nghĩa với "đúng người ấy
    // đang ngồi đây" khi việc sắp làm là tạo hồ sơ một đứa trẻ hay xoá dữ liệu của bé.
    for (const ten of CAN_XAC_MINH) {
      const than = thanHam(ACTIONS, ten);
      expect(than, ten).not.toBe("");
      expect(than, ten).toContain("daXacMinhGanDay");
    }
  });

  it("⭐ phép kiểm đứng TRƯỚC mọi phép ghi", () => {
    // Cùng bài học §11.50 và §9.36: một hàng rào đặt sau phép ghi vẫn "có mặt trong mã
    // nguồn", `tsc` vẫn xanh, và dữ liệu vẫn đã đổi trước khi nó kịp nói gì.
    for (const ten of CAN_XAC_MINH) {
      const than = thanHam(ACTIONS, ten);
      const iKiem = than.indexOf("daXacMinhGanDay");
      const iGhi = than.indexOf("$transaction");
      expect(iKiem, ten).toBeGreaterThan(-1);
      expect(iGhi, ten).toBeGreaterThan(-1);
      expect(iKiem, ten).toBeLessThan(iGhi);
    }
  });

  it("⭐ cổng đăng nhập + cờ tổng đứng trước cả phép kiểm xác minh", () => {
    // Cờ tắt ⟹ từ chối, kể cả với người đã có hồ sơ trẻ từ trước (§22.3 của spec).
    for (const ten of [...CAN_XAC_MINH, "xacMinhLai", "ghiNhanAssent", "nhanLoiMoiGiaDinh"]) {
      const than = thanHam(ACTIONS, ten);
      const iCong = than.indexOf("chaMe()");
      const iDb = than.indexOf("prisma.");
      expect(iCong, ten).toBeGreaterThan(-1);
      if (iDb > -1) expect(iCong, ten).toBeLessThan(iDb);
    }
    // `chaMe` chính là chỗ hai cổng đó nằm.
    const cong = thanHam(ACTIONS, "chaMe");
    expect(cong).toContain("batFamily()");
    expect(cong).toContain("getSessionUser");
  });

  it("dấu xác minh bị xoá NGAY sau khi việc xong", () => {
    // Một cửa mở 10 phút sau khi việc đã xong là 10 phút thừa. Xác minh là để làm MỘT việc.
    for (const ten of CAN_XAC_MINH) {
      expect(thanHam(ACTIONS, ten), ten).toContain("xoaDauXacMinh");
    }
  });

  it("⭐ đếm tần suất TRƯỚC khi so mật khẩu", () => {
    // Cùng lý do với `login` (§11.50): muốn biết đúng hay sai thì phải so xong đã, mà "đọc
    // bộ đếm rồi mới ghi" là chỗ 200 lượt song song cùng đi lọt.
    const than = thanHam(ACTIONS, "xacMinhLai");
    const iDem = than.indexOf("chanNhip");
    const iSo = than.indexOf("verifyPassword");
    expect(iDem).toBeGreaterThan(-1);
    expect(iDem).toBeLessThan(iSo);
    // Gõ đúng thì bộ đếm được xoá, nên không ai tự khoá mình.
    expect(than).toContain("xoaNhip");
    expect(than.indexOf("xoaNhip")).toBeGreaterThan(iSo);
  });

  it("tạo hồ sơ trẻ cũng có hàng rào tần suất", () => {
    expect(thanHam(ACTIONS, "taoHoSoTre")).toContain("chanNhip");
  });

  it("hai ngăn đếm mới có ngưỡng hợp lý", () => {
    // Chật hơn `dang-nhap-ten` vì người thật ở cửa này chỉ gõ đúng một lần.
    expect(NHIP["xac-minh-lai"].soLan).toBeLessThanOrEqual(NHIP["dang-nhap-ten"].soLan);
    expect(NHIP["xac-minh-lai"].soLan).toBeGreaterThanOrEqual(3);
    expect(NHIP["ho-so-tre"].soLan).toBeGreaterThanOrEqual(3);
    expect(NHIP["ho-so-tre"].phut).toBeGreaterThan(0);
  });
});

describe("assent - 'không' là một câu trả lời thật", () => {
  const than = thanHam(ACTIONS, "ghiNhanAssent");

  it("thân hàm đọc được (tự kiểm)", () => {
    expect(than).not.toBe("");
    expect(than).toContain("childConsentEvent.create");
  });

  it("⭐ chỉ bật ACTIVE khi bé nói CÓ", () => {
    // Cám dỗ ở đây là làm cái nút "để sau" rồi lặng lẽ bật `ACTIVE`. Làm thế thì cả nghi
    // thức này chỉ là một màn hình đẹp.
    const iNeu = than.indexOf("if (dongY)");
    const iBat = than.indexOf('status: "ACTIVE"');
    expect(iNeu).toBeGreaterThan(-1);
    expect(iNeu).toBeLessThan(iBat);
  });

  it("⭐ dấu mốc consent được ghi DÙ bé trả lời gì", () => {
    // Bé nói "chưa muốn" cũng là một dấu mốc phải có trong sổ - không thì cuốn sổ chỉ chép
    // những lần mọi thứ suôn sẻ, và lúc cần tra "bé đã từng từ chối chưa" thì không có gì.
    //
    // Cách chốt: phép ghi sổ phải nằm NGOÀI nhánh `if (dongY)`. Đoạn giữa hai chỗ phải đóng
    // được cái ngoặc của nhánh đó lại.
    const iNeu = than.indexOf("if (dongY)");
    const iCreate = than.indexOf("childConsentEvent.create");
    expect(iNeu).toBeGreaterThan(-1);
    expect(iCreate).toBeGreaterThan(iNeu);
    const oGiua = than.slice(iNeu, iCreate);
    expect(oGiua).toContain("childProfile.updateMany");
    expect(oGiua).toContain("}");
    expect(than).toContain("childAssent: dongY");
  });

  it("chỉ nhóm 7–8 và chỉ hồ sơ DRAFT mới qua bước này", () => {
    expect(than).toContain("canAssent");
    expect(than).toContain('child.status !== "DRAFT"');
    expect(than).toContain("canParentManageChild");
  });
});

// ---------------------------------------------------------------------------
// FL-D11 - không thu dữ liệu trẻ ngoài ba trường đã khai
// ---------------------------------------------------------------------------

/**
 * Những chữ không được xuất hiện trong bảng hồ sơ trẻ hay trong biểu mẫu tạo hồ sơ.
 *
 * ⚠️ Quét theo **ranh giới từ** chứ không phải chuỗi con, và đó là bắt buộc chứ không phải
 * cho gọn: JSX đầy `className`, và `className` chứa `class`. Một phép kiểm đỏ vì lý do sai
 * sẽ bị người sau tắt đi - rồi mất luôn cả phép kiểm đúng nằm cạnh nó.
 */
const CAM = [
  "birth", "dob", "ngaysinh", "ngay_sinh", "birthday", "birthdate", "dateofbirth",
  "school", "truong", "lop", "grade", "class",
  "address", "diachi", "location", "latitude", "longitude", "geo",
  "photourl", "photo", "voice", "audio", "recording",
  "phone", "email", "fullname", "hoten",
];

/** Những chữ cấm có mặt trong đoạn chữ này, xét theo ranh giới từ. */
const tuCamTrong = (s: string) =>
  CAM.filter((tu) => new RegExp(`\\b${tu}\\b`).test(s.toLowerCase()));

describe("FL-D11 - không thu dữ liệu trẻ ngoài scope", () => {
  const khoiChildProfile = (() => {
    const i = SCHEMA.indexOf("model ChildProfile {");
    return SCHEMA.slice(i, SCHEMA.indexOf("\n}", i));
  })();

  it("khối schema đọc được (tự kiểm)", () => {
    expect(khoiChildProfile).toContain("nickname");
    expect(khoiChildProfile).toContain("ageBand");
    expect(khoiChildProfile).toContain("avatarKey");
  });

  it("⭐ bảng hồ sơ trẻ KHÔNG có cột nào trong danh sách cấm", () => {
    // Danh sách cột ở đó là một cam kết về quyền riêng tư, không phải một thiết kế bảng.
    // Thêm một cột nữa là một quyết định về dữ liệu của trẻ em, không phải một tiện ích.
    expect(tuCamTrong(boChuThich(khoiChildProfile))).toEqual([]);
  });

  it("⭐ biểu mẫu tạo hồ sơ cũng không hỏi thêm gì", () => {
    // Server đã chỉ đọc ba trường, nhưng một cái ô hỏi ngày sinh trên màn hình đã là thu
    // dữ liệu - người ta gõ vào rồi mới biết nó không được lưu.
    expect(tuCamTrong(boChuThich(doc("src/components/ChildProfileForm.tsx")))).toEqual([]);
  });

  it("⭐ action chỉ nhận đúng ba trường", () => {
    const than = thanHam(ACTIONS, "taoHoSoTre");
    expect(than).toContain("cleanLine(input?.nickname");
    expect(than).toContain("hopLeNhomTuoi");
    expect(than).toContain("hopLeAvatar");
    expect(tuCamTrong(than)).toEqual([]);
  });

  it("⭐ evidence của consent không mang mật khẩu, giấy tờ hay địa chỉ mạng", () => {
    // Spec §12.3: chỉ cách xác minh + mốc thời gian + bản chính sách.
    const evidences = boChuThich(ACTIONS).match(/evidence:\s*\{[^}]*\}/g) ?? [];
    expect(evidences.length).toBeGreaterThan(0);
    for (const e of evidences) {
      expect(e).not.toMatch(/password\s*[,:]|passwordHash|token|ip\b|cccd|cmnd/i);
      expect(e).toContain("method");
    }
  });

  it("⭐ đo đạc không mang gì lần ra được một đứa trẻ (§17.5)", () => {
    // Bảng `Event` hiện ra ở /admin cho người trực đọc. Dữ liệu của trẻ không có việc gì ở đó.
    const goi = boChuThich(ACTIONS).match(/track\([\s\S]{0,240}?\}\);/g) ?? [];
    expect(goi.length).toBeGreaterThan(0);
    for (const g of goi) {
      expect(g).not.toContain("nickname");
      expect(g).not.toContain("childId");
      expect(g).not.toContain("avatarKey");
      expect(g).not.toContain("child.id");
    }
  });
});

// ---------------------------------------------------------------------------
// Xoá dữ liệu - xoá gì, giữ gì
// ---------------------------------------------------------------------------

describe("§17.4 - xoá dữ liệu trẻ", () => {
  const than = thanHam(ACTIONS, "xoaDuLieuTre");

  it("⭐ bôi trắng biệt danh và hình, xoá hẳn mối nối bé↔suất", () => {
    expect(than).toContain('nickname: ""');
    expect(than).toContain('avatarKey: ""');
    expect(than).toContain("childBarnLink.deleteMany");
    expect(than).toContain('status: "DELETED"');
  });

  it("⭐ cuốn sổ consent SỐNG SÓT - có dấu mốc trước và sau khi xoá", () => {
    // Xoá hẳn dòng `ChildProfile` sẽ cascade mất luôn cuốn sổ chứng minh mình đã làm đúng -
    // đúng thứ §17.4 dặn giữ tối thiểu. Nên để lại một bia mộ không đọc ra được gì.
    expect(than).toContain('action: "DELETE_REQUESTED"');
    expect(than).toContain('action: "DELETED"');
    expect(than).not.toContain("childProfile.delete");
    expect(than).not.toContain("childConsentEvent.delete");
  });

  it("cả ba việc nằm trong MỘT transaction", () => {
    const iTx = than.indexOf("$transaction");
    expect(iTx).toBeGreaterThan(-1);
    expect(iTx).toBeLessThan(than.indexOf("childBarnLink.deleteMany"));
  });

  it("rút consent KHÔNG xoá gì - hai việc khác nhau", () => {
    // Người ta thường muốn rút trước; gộp lại nghĩa là ai đó mất cuốn album của con mình vì
    // tưởng chỉ đang tạm dừng.
    const rut = thanHam(ACTIONS, "rutConsentTre");
    expect(rut).not.toContain("deleteMany");
    expect(rut).not.toContain('nickname: ""');
    expect(rut).toContain('status: "CONSENT_WITHDRAWN"');
    expect(rut).toContain('action: "WITHDRAWN"');
  });

  it("quan hệ khoá ngoại đúng chiều trong schema", () => {
    const link = SCHEMA.slice(SCHEMA.indexOf("model ChildBarnLink {"));
    const khoi = link.slice(0, link.indexOf("\n}"));
    // Bé bị xoá thì mối nối đi theo; suất tham gia của nông trại thì không được biến mất.
    expect(khoi).toMatch(/child\s+ChildProfile[^\n]*onDelete: Cascade/);
    expect(khoi).toMatch(/enrollment\s+FamilyEnrollment[^\n]*onDelete: Restrict/);
  });
});

// ---------------------------------------------------------------------------
// Trang: hai cửa, đúng thứ tự
// ---------------------------------------------------------------------------

const TRANG = [
  "src/app/gia-dinh/page.tsx",
  "src/app/gia-dinh/xac-minh/page.tsx",
  "src/app/gia-dinh/tre-moi/page.tsx",
  "src/app/gia-dinh/quyen-rieng-tu/page.tsx",
];

describe("trang /gia-dinh - cổng và khung chờ", () => {
  it("⭐ mọi trang đều đăng nhập TRƯỚC, rồi mới tới cờ tổng", () => {
    // §9.5: không có xem thử ẩn danh ở bất cứ đâu trong cổng này.
    for (const t of TRANG) {
      const s = boChuThich(doc(t));
      const iDangNhap = s.indexOf("requireUser");
      const iCo = s.indexOf("batFamily()");
      expect(iDangNhap, t).toBeGreaterThan(-1);
      expect(iCo, t).toBeGreaterThan(-1);
      expect(iDangNhap, t).toBeLessThan(iCo);
    }
  });

  it("⭐ cờ tắt ⟹ notFound, không phải trang 'sắp có'", () => {
    // Một trang "tính năng đang tắt" vẫn là lời khoe rằng có gì đó sắp tới. Kill switch tồn
    // tại để KHÔNG LỘ GÌ CẢ.
    for (const t of TRANG) {
      expect(boChuThich(doc(t)), t).toContain("notFound()");
    }
  });

  it("⭐ hai trang nhạy cảm đòi xác minh lại ở tầng trang nữa", () => {
    for (const t of ["src/app/gia-dinh/tre-moi/page.tsx", "src/app/gia-dinh/quyen-rieng-tu/page.tsx"]) {
      const s = boChuThich(doc(t));
      expect(s, t).toContain("daXacMinhGanDay");
      expect(s, t).toContain("/gia-dinh/xac-minh");
    }
  });

  it("⭐ ?next= đi qua DANH SÁCH TRẮNG, không phải phép lọc", () => {
    // Nhận bừa rồi `push` là một cái máy chuyển hướng mở: dán link ChicChic vào đâu đó,
    // người ta gõ mật khẩu xong bị đẩy sang trang lạ.
    const s = boChuThich(doc("src/app/gia-dinh/xac-minh/page.tsx"));
    expect(s).toContain("DICH[raw]");
    expect(s).toContain('"/gia-dinh"');
  });

  it("mọi trang đều có khung chờ đúng hình", () => {
    for (const t of TRANG) {
      const loading = t.replace("page.tsx", "loading.tsx");
      const s = doc(loading);
      // Khung chờ không được async, không đụng DB, không chữ giả.
      expect(s, loading).not.toContain("async");
      expect(s, loading).not.toContain("prisma");
      expect(s, loading).toContain("Khung");
    }
  });

  it("⭐ màn hình cho bé không import được đường tiền hay đường vòng đời (§15.3)", () => {
    // Bé nhìn vào `ChildAssentCard`. Một import lỡ tay ở đây là một nút tiêu tiền cách tay
    // bé đúng một cú chạm.
    const cam = [
      "decor-actions", "market-actions", "billing-actions", "care-actions",
      "refund-actions", "harvest-actions", "decideEndOfLay",
    ];
    for (const f of ["src/components/ChildAssentCard.tsx", "src/components/ChildProfileForm.tsx"]) {
      const s = doc(f);
      for (const c of cam) expect(s, `${f} ↛ ${c}`).not.toContain(c);
    }
  });

  it("⭐ có ÍT NHẤT một lối vào /gia-dinh mà ngón tay bấm được", () => {
    // Bất biến này sinh ra từ một lỗi thật: Epic 2 dựng xong bốn trang mà **không trang
    // nào trong app dẫn tới chúng** - chủ dự án mở app lên và không có nút nào để bấm.
    // Một tính năng không có lối vào là một tính năng chưa tồn tại.
    //
    // Hai lối, và cần CẢ HAI: `SideNav` chỉ hiện ở laptop (`.side-nav` ẩn dưới `lg`), nên
    // trên điện thoại thẻ ở `/tai-khoan` là đường duy nhất.
    expect(boChuThich(doc("src/app/layout.tsx"))).toContain('href: "/gia-dinh"');
    expect(boChuThich(doc("src/app/tai-khoan/page.tsx"))).toContain('href="/gia-dinh"');
  });

  it("⭐ lối vào tắt theo cờ tổng, và chỉ hiện với người ĐÃ có gì đó ở đó", () => {
    // Cờ tắt mà mục vẫn hiện thì kill switch chỉ còn một nửa. Và `/gia-dinh` không có
    // đường tự đăng ký - bày mục cho mọi tài khoản là quảng cáo một chỗ họ không vào được.
    const than = thanHam(doc("src/lib/family.ts"), "loiVaoGiaDinh");
    expect(than).not.toBe("");
    const iCo = than.indexOf("batFamily()");
    const iDb = than.indexOf("prisma.");
    expect(iCo).toBeGreaterThan(-1);
    expect(iCo).toBeLessThan(iDb);
    // Hỏng thì ẩn, không phải hiện.
    expect(than.slice(than.indexOf("catch"))).toContain("KHONG_CO");
    // Hai nơi vẽ đều phải hỏi qua cờ đó, không tự quyết.
    expect(boChuThich(doc("src/app/layout.tsx"))).toContain("giaDinh.hien");
    expect(boChuThich(doc("src/app/tai-khoan/page.tsx"))).toContain("giaDinh.hien");
  });

  it("⭐ chuông lời mời dẫn về /gia-dinh, không về trang chuồng", () => {
    // Chuông nói "mở ra đọc rồi quyết định" - dẫn về trang chuồng thì không có gì để
    // quyết. Đã từng sai đúng như vậy: Epic 1 đặt `/chuong/<slug>` vì `/gia-dinh` chưa có.
    const than = thanHam(doc("src/app/family-admin-actions.ts"), "inviteFamilyEnrollment");
    const iNotify = than.indexOf("notify(");
    const sauNotify = than.slice(iNotify, iNotify + 500);
    expect(sauNotify).toContain('href: "/gia-dinh"');
    expect(sauNotify).not.toContain("href: `/chuong/");
  });

  it("component client không import lib chỉ-server", () => {
    // `lib/family.ts` đọc `process.env` và Prisma. Kéo nó vào bundle client là vừa vỡ build
    // vừa lộ quyết định của server.
    for (const f of [
      "src/components/ChildAssentCard.tsx", "src/components/ChildProfileForm.tsx",
      "src/components/FamilyInviteCard.tsx", "src/components/FamilyPrivacyForms.tsx",
      "src/components/FamilyReauthForm.tsx",
    ]) {
      const s = doc(f);
      expect(s, f).not.toContain('from "@/lib/family"');
      expect(s, f).not.toContain('from "@/lib/db"');
    }
  });
});
