// FAMILY LEARNING - Epic 5: khu khám phá của bé.
//
// Bộ kiểm này canh bốn thứ. Ba trong bốn **chỉ đọc được từ mã nguồn** - `tsc`, `lint` và
// `build` đều cho chúng đi qua, và người duyệt PR thì không mở hết 8 file:
//
//  1. **Bề mặt của trẻ và bề mặt người lớn không chạm nhau** (§15.3 của spec). Không tiền,
//     không chợ, không hoá đơn, không một `Link` nào dẫn thẳng ra ngoài.
//  2. **Một cổng duy nhất**, và mọi trang `/be/**` đều đi qua nó (§9.40).
//  3. **Không cơ chế bị cấm** (§8.3): không tự phát tiếp, không cuộn vô tận, không điểm số.
//  4. **Vẽ trang không ghi DB** (§7.14) - kể cả "đánh dấu đã bắt đầu".
//
// Không nối DB, không dựng server. Phần phải chạy thật ghi ở CODEMAP §13.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canEnterChildSpace, canViewMoment, type TrangThaiBai, type TrangThaiTre } from "@/lib/family-gates";
import { MAX_LUA_CHON, locLuaChon } from "@/lib/bai-hoc-meta";

const doc = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function moiFileNguon(thuMuc: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(join(process.cwd(), thuMuc))) {
    const duong = `${thuMuc}/${ten}`;
    if (statSync(join(process.cwd(), duong)).isDirectory()) ra.push(...moiFileNguon(duong));
    else if (/\.tsx?$/.test(ten)) ra.push(duong);
  }
  return ra;
}

/** Mọi file thuộc bề mặt của trẻ: các trang `/be/**` và component chỉ dùng ở đó. */
const FILE_CUA_BE = [...moiFileNguon("src/app/be"), ...moiFileNguon("src/components/be")];
const TRANG_CUA_BE = FILE_CUA_BE.filter((f) => f.endsWith("page.tsx"));
const ACTIONS = boChuThich(doc("src/app/learning-actions.ts"));
const BAI_HOC = boChuThich(doc("src/lib/bai-hoc.ts"));
const SCHEMA = doc("prisma/schema.prisma");
const NOI_DUNG_BAI = ["AVAILABLE", "STARTED", "COMPLETED", "ARCHIVED"] as const;

/**
 * Thân một hàm: từ chỗ khai tới `export` kế tiếp.
 *
 * ⚠️ **Đừng cắt tới dấu `}` đầu dòng đầu tiên** như bản đầu của bộ kiểm này: `xongBai` khai
 * tham số trên nhiều dòng, nên dấu đó chính là dấu đóng của **kiểu tham số**, và thân hàm ra
 * rỗng. Ba phép kiểm đỏ lên vì đúng lý do đó - tức đỏ vì lý do sai, đúng thứ khiến người sau
 * tắt phép kiểm đi thay vì sửa.
 */
function than(src: string, ten: string): string {
  const i = src.indexOf(`export async function ${ten}`);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + 10);
  return src.slice(i, j < 0 ? undefined : j);
}


// ---------------------------------------------------------------------------
// 1. Bề mặt của trẻ không chạm bề mặt người lớn (§15.3)
// ---------------------------------------------------------------------------

describe("§9.40 - khu của bé và khu người lớn không chạm nhau", () => {
  it("⭐ không file nào của bé import hành động của người lớn", () => {
    // Danh sách lấy thẳng từ spec §15.3. Một `import` ở đây không chỉ là rủi ro bấm nhầm: nó
    // kéo cả cây phụ thuộc tiền bạc vào bundle của một màn hình cho trẻ 5 tuổi.
    const CAM = [
      "decor-actions", "market-actions", "billing-actions", "care-actions",
      "refund-actions", "harvest-actions", "worker-actions", "admin-actions",
      "family-admin-actions", "@/lib/pricing", "@/lib/wallet", "@/lib/market",
      "@/lib/invoices", "@/lib/billing", "@/lib/payments", "@/lib/vietqr", "@/lib/banks",
    ];
    const pham: string[] = [];
    for (const f of FILE_CUA_BE) {
      const s = boChuThich(doc(f));
      for (const c of CAM) if (s.includes(c)) pham.push(`${f} → ${c}`);
    }
    expect(pham).toEqual([]);
  });

  it("⭐ không chữ nào về tiền lọt vào màn hình của bé", () => {
    // Trẻ không phải một đường bán hàng vào nhà (FL-D06). Quét cả chữ hiển thị lẫn mã.
    const CAM = ["đồng", "vnđ", "vnd", "giá", "mua", "thanh toán", "hoá đơn", "hóa đơn", "giảm giá"];
    for (const f of FILE_CUA_BE) {
      const s = boChuThich(doc(f)).toLowerCase();
      for (const c of CAM) {
        expect(s.includes(c), `${f} chứa "${c}"`).toBe(false);
      }
    }
  });

  it("⭐ không trang nào của bé có Link thẳng sang khu người lớn", () => {
    // Lối ra duy nhất đi qua cổng ở `ExitGate`. Một `href="/chuong/…"` ở đây là một cánh cửa
    // mở sẵn cạnh chỗ đứa trẻ đang ngồi.
    const NGOAI = ["/chuong", "/cho", "/tai-khoan", "/nhan-chuong", "/nong-trai", "/admin", "/tx/"];
    for (const f of FILE_CUA_BE) {
      const s = boChuThich(doc(f));
      for (const m of s.matchAll(/href=[{"`]+([^"`}\s]+)/g)) {
        for (const n of NGOAI) {
          expect(m[1].startsWith(n), `${f}: href="${m[1]}"`).toBe(false);
        }
      }
    }
  });

  it("⭐ đường ra duy nhất là cổng, và cổng đòi mật khẩu", () => {
    const gate = boChuThich(doc("src/components/be/ExitGate.tsx"));
    expect(gate).toContain("moCuaRaNgoai");
    expect(gate).toContain("password");
    // Chỉ ĐÚNG MỘT file trong khu của bé được đẩy ra ngoài.
    const daydayRa = FILE_CUA_BE.filter((f) => /(?:router\.push|window\.location\.assign)\(\s*["'`]\/(?!be\/)/.test(boChuThich(doc(f))));
    expect(daydayRa).toEqual(["src/components/be/ExitGate.tsx"]);
  });

  it("⭐ cổng ra KHÔNG đóng dấu xác minh của ba việc nhạy cảm", () => {
    // Dùng chung dấu với `xacMinhLai` nghĩa là mỗi lần thoát khu của bé sẽ âm thầm mở 10 phút
    // cho: tạo hồ sơ trẻ · rút consent · xoá dữ liệu. Quyền leo thang vì một thao tác UX.
    const t = than(ACTIONS, "moCuaRaNgoai");
    expect(t).not.toContain("dongDauXacMinh");
    expect(t).not.toContain("reauthAt");
  });

  it("⭐ lớp bọc ngoài KHÔNG vẽ thanh điều hướng người lớn trong khu của bé", () => {
    // Lỗi này chỉ lộ ra khi mở trình duyệt: bốn phép kiểm quét `/be/**` đều xanh, `tsc`,
    // `lint`, `build` cũng xanh - mà màn hình của đứa trẻ vẫn có SideNav với "Chuồng của tôi",
    // "Chợ nông trại", "Giỏ hàng", "Tài khoản", vì thanh đó nằm ở `app/layout.tsx` chứ không
    // nằm trong thư mục `/be`. Quét chỗ đó luôn.
    const layout = boChuThich(doc("src/app/layout.tsx"));
    const mw = boChuThich(doc("src/middleware.ts"));
    expect(layout).toContain("HEADER_KHU_BE");
    // Nhánh khu-của-bé phải trả về TRƯỚC khi dựng thanh trên và SideNav.
    const iNhanh = layout.indexOf("HEADER_KHU_BE");
    // So theo chỗ **dùng** (`<SideNav`), không theo chỗ `import` - dòng import luôn nằm đầu
    // file nên so với nó thì phép kiểm đỏ vì lý do sai.
    expect(layout.indexOf("<SideNav"), "SideNav phải nằm SAU nhánh khu của bé").toBeGreaterThan(iNhanh);
    expect(layout.indexOf("<NotificationBell"), "chuông phải nằm SAU nhánh khu của bé").toBeGreaterThan(iNhanh);
    expect(layout.indexOf("app-footer"), "chân trang phải nằm SAU nhánh khu của bé").toBeGreaterThan(iNhanh);
    // Middleware phải gắn dấu, và matcher phải phủ `/be`.
    expect(mw).toContain("HEADER_KHU_BE");
    expect(mw).toContain("isChildPath(req.nextUrl.pathname)");
    expect(mw).toContain("h.delete(HEADER_KHU_BE)");
  });

  it("⭐ nút 'Vào khu của bé' chỉ hiện khi bé THẬT SỰ vào được", () => {
    // Bé có hồ sơ `ACTIVE` nhưng chưa gắn chuồng nào thì khu của bé vẫn đóng (một trong năm
    // điều kiện của `moKhuCuaBe`). Bày nút cho bé đó là bày một cánh cửa dẫn thẳng tới trang
    // "không tìm thấy" - đúng loại nút chết §9.2 cấm, và cha mẹ sẽ tưởng app hỏng.
    const trang = boChuThich(doc("src/app/gia-dinh/page.tsx"));
    expect(trang).toContain("beCoChuong");
    const i = trang.indexOf('<EnterChildSpace childId={t.id}');
    expect(i, "phải có nút vào khu của bé").toBeGreaterThan(-1);
    expect(trang.slice(Math.max(0, i - 200), i)).toContain("beCoChuong.has(t.id)");
  });

  it("component của bé không đụng Prisma và không đọc biến môi trường", () => {
    for (const f of moiFileNguon("src/components/be")) {
      const s = boChuThich(doc(f));
      expect(s, f).not.toContain("@/lib/db");
      expect(s, f).not.toContain("process.env");
      expect(s, f).toContain('"use client"');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Một cổng duy nhất
// ---------------------------------------------------------------------------

describe("cổng khu của bé", () => {
  it("⭐ MỌI trang /be/** đi qua requireChildUser rồi tới cổng", () => {
    for (const f of TRANG_CUA_BE) {
      const s = boChuThich(doc(f));
      expect(s, f).toContain("requireChildUser");
      expect(/moKhuCuaBe|moBaiCuaBe/.test(s), f).toBe(true);
      // Đăng nhập TRƯỚC cổng của khu (§9.5) - thứ tự, không chỉ sự có mặt.
      const iUser = s.indexOf("requireChildUser");
      const iCong = Math.min(...["moKhuCuaBe", "moBaiCuaBe"].map((k) => {
        const i = s.indexOf(k); return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      }));
      expect(iCong, f).toBeGreaterThan(iUser);
      expect(s, f).toContain("notFound()");
    }
  });

  it("⭐ KHÔNG file nào ngoài lib/bai-hoc.ts tự viết lại phép so của cổng", () => {
    // §11.37 đã rò đúng vì hai bản chép tay lệch nhau. Một phép so, một chỗ.
    const pham: string[] = [];
    for (const f of [...FILE_CUA_BE, "src/app/learning-actions.ts"]) {
      const s = boChuThich(doc(f));
      if (s.includes("canEnterChildSpace(") || s.includes("canViewMoment(")) pham.push(f);
    }
    expect(pham).toEqual([]);
    expect(BAI_HOC).toContain("canEnterChildSpace(");
    expect(BAI_HOC).toContain("canViewMoment(");
  });

  it("⭐ cổng đọc lại DB mỗi lần, không nhớ đệm", () => {
    // Cha mẹ rút consent trong lúc một tab của bé đang mở là ca có thật, và cái tab đó phải
    // đóng lại ở lần bấm kế tiếp.
    const t = than(BAI_HOC, "moKhuCuaBe");
    expect(t).toContain("prisma.childProfile.findUnique");
    expect(t).not.toContain("cache(");
    expect(t).toContain("unlinkedAt: null");
    expect(t).toContain('enrollment: { status: "ACTIVE" }');
  });

  it("⭐ ảnh của bài lọc theo chuồng, không chỉ theo id ảnh", () => {
    // `factSnapshot` là dữ liệu đã lưu, nhưng "đã lưu" không đồng nghĩa với "đúng": một dòng
    // hỏng là đủ để ảnh chuồng khác hiện lên màn hình của bé.
    const t = than(BAI_HOC, "anhCuaBai");
    expect(t).toContain("barnId");
    expect(t).toContain("id: mediaId");
  });

  it("hỏng thì ĐÓNG, không mở", () => {
    for (const ham of ["moKhuCuaBe", "moBaiCuaBe"]) {
      const t = than(BAI_HOC, ham);
      expect(t, ham).toContain("catch");
      expect(t, ham).toContain("return null");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. `canViewMoment` - bảng đầy đủ
// ---------------------------------------------------------------------------

describe("canViewMoment (§15.2)", () => {
  const co = { vaoDuocKhuCuaBe: true, momentChildId: "c1", childId: "c1", momentStatus: "AVAILABLE" as TrangThaiBai };

  it("⭐ bài của bé KHÁC thì đóng, ở mọi trạng thái", () => {
    // Id trên thanh địa chỉ ai cũng sửa được. Không có phép so này thì đổi một chữ trong URL
    // là mở được nhật ký con nhà khác - đúng hình dạng của lỗ rò §11.37.
    for (const st of NOI_DUNG_BAI) {
      expect(canViewMoment({ ...co, momentChildId: "c2", momentStatus: st }), st).toBe(false);
    }
  });

  it("chưa vào được khu thì đóng, dù bài đúng của bé", () => {
    for (const st of NOI_DUNG_BAI) {
      expect(canViewMoment({ ...co, vaoDuocKhuCuaBe: false, momentStatus: st }), st).toBe(false);
    }
  });

  it("id rỗng ở hai phía KHÔNG khớp nhau thành 'cùng một bé'", () => {
    expect(canViewMoment({ ...co, momentChildId: "", childId: "" })).toBe(false);
    expect(canViewMoment({ ...co, momentChildId: null, childId: null })).toBe(false);
    expect(canViewMoment({ ...co, momentChildId: undefined, childId: undefined })).toBe(false);
  });

  it("bài đã xong VẪN mở - xem lại là chuyện đẹp; ARCHIVED thì đóng", () => {
    expect(canViewMoment({ ...co, momentStatus: "AVAILABLE" })).toBe(true);
    expect(canViewMoment({ ...co, momentStatus: "STARTED" })).toBe(true);
    expect(canViewMoment({ ...co, momentStatus: "COMPLETED" })).toBe(true);
    expect(canViewMoment({ ...co, momentStatus: "ARCHIVED" })).toBe(false);
    expect(canViewMoment({ ...co, momentStatus: null })).toBe(false);
  });

  it("⭐ rút lời đồng ý ⟹ cổng khu đóng ⟹ mọi bài đóng theo", () => {
    // Hai lớp cùng một luật: `canEnterChildSpace` đóng thì `canViewMoment` không cần biết gì
    // thêm cũng đóng. Đây là lý do `withdrawal khoá Child Space ngay` đo được.
    for (const st of ["DRAFT", "CONSENT_WITHDRAWN", "DELETION_PENDING", "DELETED"] as TrangThaiTre[]) {
      const vao = canEnterChildSpace({
        featureEnabled: true, ownsChild: true, childStatus: st,
        consentActive: false, enrollmentActive: true,
      });
      expect(vao, st).toBe(false);
      expect(canViewMoment({ ...co, vaoDuocKhuCuaBe: vao }), st).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Lựa chọn của bé - lọc theo BẢN CHỤP
// ---------------------------------------------------------------------------

describe("lựa chọn của bé", () => {
  const chup = {
    cards: [
      { kind: "story", title: "a", body: "b" },
      { kind: "observe", options: [{ key: "nuoc" }, { key: "keo" }] },
      { kind: "sequence", items: [{ key: "mot" }, { key: "hai" }] },
    ],
  };

  it("giữ lựa chọn hợp lệ, bỏ khoá lạ", () => {
    expect(locLuaChon(chup, [{ the: 1, chon: "nuoc" }, { the: 2, chon: "hai" }]))
      .toEqual([{ the: 1, chon: "nuoc" }, { the: 2, chon: "hai" }]);
    expect(locLuaChon(chup, [{ the: 1, chon: "khong-co-that" }])).toEqual([]);
  });

  it("⭐ chỉ số thẻ ngoài khoảng, kiểu sai, chữ quá dài đều bị bỏ - không ném lỗi", () => {
    // Đây là màn hình của một đứa trẻ: không có đường nào dẫn tới một câu báo lỗi đỏ.
    expect(locLuaChon(chup, [{ the: 99, chon: "nuoc" }])).toEqual([]);
    expect(locLuaChon(chup, [{ the: -1, chon: "nuoc" }])).toEqual([]);
    expect(locLuaChon(chup, [{ the: 1.5, chon: "nuoc" }])).toEqual([]);
    expect(locLuaChon(chup, [{ the: 1, chon: "E".repeat(61) }])).toEqual([]);
    expect(locLuaChon(chup, [{ the: 1, chon: "" }])).toEqual([]);
    expect(() => locLuaChon(chup, "rác" as unknown)).not.toThrow();
    expect(locLuaChon(null, [{ the: 1, chon: "nuoc" }])).toEqual([]);
  });

  it("một thẻ chỉ lưu một lựa chọn, và có trần tổng", () => {
    expect(locLuaChon(chup, [{ the: 1, chon: "nuoc" }, { the: 1, chon: "keo" }]))
      .toEqual([{ the: 1, chon: "nuoc" }]);
    const nhieu = Array.from({ length: MAX_LUA_CHON + 5 }).map(() => ({ the: 1, chon: "nuoc" }));
    expect(locLuaChon(chup, nhieu).length).toBeLessThanOrEqual(MAX_LUA_CHON);
  });
});

// ---------------------------------------------------------------------------
// 5. Chuyển trạng thái - so-sánh-rồi-đặt và tử tế khi trùng
// ---------------------------------------------------------------------------

describe("hoàn thành một bài", () => {
  it("⭐ ba hành động đều so-sánh-rồi-đặt, và đều lọc theo childId", () => {
    for (const ham of ["batDauBai", "xongBai", "xongNhiemVu"]) {
      const t = than(ACTIONS, ham);
      expect(t, ham).toContain("updateMany");
      expect(t, ham).toContain("childId: b.be.id");
      expect(t, ham).toContain("count");
    }
  });

  it("⭐ hai tab cùng làm xong: tab sau nhận lời tử tế, không phải lỗi", () => {
    // Điều kiện nghiệm thu của Epic 5. Một câu đỏ ở đây rơi vào mắt một đứa trẻ.
    const t = than(ACTIONS, "xongBai");
    expect(t).toContain("count === 0");
    // Nhánh "đã xong rồi" phải trả `ok`, không phải `nope`.
    const sau = t.slice(t.indexOf("count === 0"));
    expect(sau.slice(0, 120)).toContain("return ok(");
  });

  it("⭐ nhiệm vụ gia đình có cột riêng, không nhét thêm cờ vào JSON", () => {
    // Hai hành động ghi cùng một cột JSON là đọc-sửa-ghi đè lên nhau (§9.24).
    const dau = SCHEMA.indexOf("model LearningMoment");
    const khoi = SCHEMA.slice(dau, SCHEMA.indexOf("\n}", dau));
    expect(khoi).toContain("missionDoneAt");
    const t = than(ACTIONS, "xongNhiemVu");
    expect(t).toContain("missionDoneAt: null");
    expect(t).not.toContain("completion");
  });

  it("nhiệm vụ gia đình không nhận ảnh hay chữ tự do", () => {
    const t = than(ACTIONS, "xongNhiemVu");
    for (const c of ["url", "upload", "note", "text"]) expect(t, c).not.toContain(c);
  });

  it("mọi hành động của bé mở bằng cổng trước khi chạm DB", () => {
    for (const ham of ["batDauBai", "xongBai", "xongNhiemVu"]) {
      const t = than(ACTIONS, ham);
      const iCong = t.indexOf("baiCuaBe(");
      const iDb = t.indexOf("prisma.");
      expect(iCong, ham).toBeGreaterThan(-1);
      if (iDb >= 0) expect(iDb, ham).toBeGreaterThan(iCong);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Cơ chế bị cấm (§8.3) và luật màn hình (§18.1)
// ---------------------------------------------------------------------------

describe("cơ chế bị cấm", () => {
  it("⭐ không tự mở bài kế tiếp, không cuộn vô tận", () => {
    for (const f of FILE_CUA_BE) {
      const s = boChuThich(doc(f));
      expect(/autoPlay|autoplay/i.test(s), f).toBe(false);
      expect(/setInterval|IntersectionObserver|infinite/i.test(s), f).toBe(false);
    }
    // Nhật ký và trang chính đều có trần cứng.
    expect(boChuThich(doc("src/app/be/[childId]/nhat-ky/page.tsx"))).toContain("take: SO_TRANG");
    expect(boChuThich(doc("src/app/be/[childId]/page.tsx"))).toContain("take: 1");
  });

  it("⭐ không điểm số, không đếm ngày liên tiếp, không xếp hạng", () => {
    const CAM = ["điểm", "streak", "xếp hạng", "bảng vàng", "huy chương vàng", "thắng", "thua", "sai rồi"];
    for (const f of FILE_CUA_BE) {
      const s = boChuThich(doc(f)).toLowerCase();
      for (const c of CAM) expect(s.includes(c), `${f} chứa "${c}"`).toBe(false);
    }
  });

  it("⭐ vẽ trang KHÔNG ghi DB - kể cả dấu 'đã bắt đầu'", () => {
    // Bài chuyển sang `STARTED` khi bé bấm sang thẻ thứ hai, không phải lúc trang được vẽ
    // (§7.14). Vẽ mà ghi thì hai lượt mở trang là hai phép ghi đua nhau, và con số "bé đã bắt
    // đầu học chưa" cũng sai theo.
    for (const f of TRANG_CUA_BE) {
      const s = boChuThich(doc(f));
      expect(/prisma\.\w+\.(create|update|delete|upsert)/.test(s), f).toBe(false);
      expect(s.includes("batDauBai"), f).toBe(false);
    }
  });

  it("ảnh thật có alt, và nút chạm đủ to cho tay trẻ nhỏ", () => {
    const player = doc("src/components/be/MomentPlayer.tsx");
    expect(player).toMatch(/<img[^>]*alt="/);
    // §18.1: tap target lớn. 44px là mức tối thiểu quen thuộc; ở đây đặt 52–54.
    expect(player).toMatch(/minHeight:\s*5[0-9]/);
  });

  it("mọi trang nặng có khung chờ, và khung chờ không async / không Prisma", () => {
    for (const f of TRANG_CUA_BE) {
      const kh = f.replace("page.tsx", "loading.tsx");
      const s = doc(kh);
      expect(s, kh).not.toContain("async");
      expect(s, kh).not.toContain("prisma");
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Đo đạc không mang dữ liệu của trẻ (§17.5)
// ---------------------------------------------------------------------------

describe("đo đạc", () => {
  it("⭐ props chỉ mang khoá của NỘI DUNG, không của trẻ", () => {
    const CAM = ["nickname", "childId", "avatarKey", "barnLabel", "b.be.id", "b.be.nickname"];
    for (const m of ACTIONS.matchAll(/track\([^)]*\{[\s\S]{0,400}?\}\)/g)) {
      for (const c of CAM) expect(m[0], c).not.toContain(c);
    }
  });

  it("có ba sự kiện đo của Epic 5, khai trong danh sách đóng", () => {
    const track = doc("src/lib/track.ts");
    for (const e of ["learning_moment_started", "learning_moment_completed", "family_mission_completed"]) {
      expect(track, e).toContain(`"${e}"`);
      expect(ACTIONS, e).toContain(`"${e}"`);
    }
  });
});
