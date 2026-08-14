// FAMILY LEARNING - Epic 7: vận hành pilot (§9.42).
//
// Bộ kiểm này canh sáu thứ, và năm trong sáu **chỉ đọc được từ mã nguồn** - `tsc`, `lint`
// và `build` đều cho chúng đi qua:
//
//  1. **Tạm dừng một suất KHÔNG được đụng vào đàn gà** (spec §22.3). Tắt trải nghiệm số
//     không dừng chăm gà, không xoá sự kiện, không mở lại `MEAT`, không rút consent hộ ai.
//  2. **Lý do tạm dừng là chữ đã viết sẵn**, không phải chữ người trực gõ - và không câu
//     nào nói về bệnh tật hay cái chết của con vật (§18.4).
//  3. **Nhãn của nông dân không bao giờ bắt buộc** (§18.3 · FL-D24). Mục tiêu §4: cô chú
//     tăng tải ≤30 phút/nông trại/tuần.
//  4. **Đường xuất dữ liệu chỉ ĐỌC, và chỉ đọc của ĐÚNG bé đó** (§17.3).
//  5. **Bảng vận hành chỉ để nhìn**, và không mang dữ liệu của một đứa trẻ cụ thể (§17.5).
//  6. **Chưa đủ dữ liệu thì nói là chưa đủ**, không vẽ ra 0%.
//
// Không nối DB, không dựng server. Phần phải chạy thật ghi ở CODEMAP §13.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// ⚠️ Chỉ import từ file **thuần**. `lib/xuat-du-lieu.ts` và `lib/van-hanh.ts` kéo theo
// `lib/auth` → `react.cache`, thứ không chạy được ngoài Next - đó chính là lý do luật
// "một file thuần cạnh một file DB" tồn tại (§1.2).
import {
  CANH_BAO_UOC, CHU_DAN_XUAT, LY_DO_TAM_DUNG, NGUONG_PILOT, NHAN_CHAM_SOC, PHUT_MOI_VIEC_UOC,
  cauTamDung, locNhan, nhanChoViec, soNguong, soTran, tenTepXuat, tiLe, timLyDoTamDung,
} from "@/lib/van-hanh-meta";
import { TRUONG_PAYLOAD } from "@/lib/su-kien-meta";

const doc = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ADMIN_ACTIONS = boChuThich(doc("src/app/family-admin-actions.ts"));
const FAMILY_ACTIONS = boChuThich(doc("src/app/family-actions.ts"));
const WORKER_ACTIONS = boChuThich(doc("src/app/worker-actions.ts"));
const XUAT = boChuThich(doc("src/lib/xuat-du-lieu.ts"));
const VAN_HANH = boChuThich(doc("src/lib/van-hanh.ts"));
const BAI_HOC = boChuThich(doc("src/lib/bai-hoc.ts"));
const BAI_HOC_META = boChuThich(doc("src/lib/bai-hoc-meta.ts"));
const TRANG_ADMIN = boChuThich(doc("src/app/admin/gia-dinh/page.tsx"));
const TRACK = doc("src/lib/track.ts");

/** Thân một hàm: từ chỗ khai tới `export`/`function` kế tiếp ở đầu dòng. */
function than(src: string, ten: string): string {
  const i = src.search(new RegExp(`(export )?(async )?function ${ten}\\b`));
  if (i < 0) return "";
  const j = src.slice(i + 10).search(/\n(export |async function |function |const )/);
  return j < 0 ? src.slice(i) : src.slice(i, i + 10 + j);
}

/**
 * Đếm **lời gọi** phép ghi, không đếm chữ.
 *
 * ⚠️ Đây là bài học đã trả giá một lần ở Epic 6: quét chữ `"create"` làm đỏ một hàm chỉ đọc
 * vì nó có `orderBy: { createdAt: "asc" }`. Ranh giới đúng là **dấu chấm rồi tên rồi ngoặc**.
 */
const LOI_GOI_GHI = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/g;
const demGhi = (s: string) => (s.match(LOI_GOI_GHI) ?? []).length;

// ---------------------------------------------------------------------------
// 1. Tạm dừng một suất không đụng vào đàn gà
// ---------------------------------------------------------------------------

describe("§9.42 - tắt trải nghiệm số KHÔNG dừng chăm gà", () => {
  for (const ten of ["tamDungSuat", "moLaiSuat"]) {
    it(`⭐⭐ ${ten} không đụng vòng đời đàn, việc của nông dân, hay consent`, () => {
      const t = than(ADMIN_ACTIONS, ten);
      expect(t.length, `không tìm thấy thân hàm ${ten}`).toBeGreaterThan(200);
      // Bốn điều spec §22.3 cấm, cộng mấy đường vòng gần nhất tới chúng.
      for (const cam of [
        "lifecyclePolicy", "flock.update", "barnTask", "upsertTask", "workerId",
        "childProfile", "childConsentEvent", "domainEvent", "learningMoment",
        "harvestLot", "payout", "decorOrder",
      ]) {
        expect(t.includes(cam), `${ten} chứa "${cam}" - §22.3 cấm`).toBe(false);
      }
      // Và không xoá bất cứ thứ gì.
      expect(/\.delete(Many)?\s*\(/.test(t), `${ten} có phép xoá`).toBe(false);
    });

    it(`${ten}: isAdmin() rồi tới cờ tổng, TRƯỚC mọi phép đọc DB`, () => {
      const t = than(ADMIN_ACTIONS, ten);
      const iAdmin = t.indexOf("isAdmin()");
      const iCo = t.indexOf("batFamily()");
      const iDb = t.indexOf("prisma.");
      expect(iAdmin).toBeGreaterThan(-1);
      expect(iAdmin).toBeLessThan(iCo);
      expect(iCo).toBeLessThan(iDb);
    });

    it(`${ten}: đổi trạng thái bằng so-sánh-rồi-đặt, mang trạng thái cũ trong WHERE`, () => {
      const t = than(ADMIN_ACTIONS, ten);
      expect(t).toContain("updateMany");
      // §9.24: hai người trực cùng bấm là hai câu lệnh xen kẽ nhau.
      const iWhere = t.indexOf("where: { id: suat.id");
      expect(iWhere, `${ten} không lọc theo id + trạng thái cũ`).toBeGreaterThan(-1);
      expect(t.slice(iWhere, iWhere + 90)).toMatch(/status: "(ACTIVE|PAUSED)"/);
      // `count === 0` là kết cục BÌNH THƯỜNG, không phải lỗi.
      expect(t).toContain("count === 0");
      expect(t.slice(t.indexOf("count === 0"), t.indexOf("count === 0") + 60)).toContain("ok(");
    });
  }

  it("⭐ chỉ ACTIVE mới tạm dừng được, chỉ PAUSED mới mở lại được", () => {
    const dung = than(ADMIN_ACTIONS, "tamDungSuat");
    const mo = than(ADMIN_ACTIONS, "moLaiSuat");
    // Suất mới mời (INVITED) hay đã rút thì không có gì để dừng - và câu từ chối phải nói thế.
    expect(dung).toContain('suat.status !== "ACTIVE"');
    expect(mo).toContain('suat.status !== "PAUSED"');
    // Bấm lại đúng thứ mình vừa bấm ⟹ một câu tử tế, không phải lỗi (bài học §9.41).
    expect(dung).toContain('suat.status === "PAUSED"');
    expect(mo).toContain('suat.status === "ACTIVE"');
  });

  it("⭐ khu của bé đóng theo trạng thái suất - không cần thêm dòng nào ở Epic 7", () => {
    // Cổng cũ (§9.40) vốn đã đòi suất `ACTIVE`. Đây là lý do `tamDungSuat` không phải đụng
    // vào bất cứ thứ gì của bé; xoá điều kiện này đi là mở lại khu của bé cho suất đã dừng.
    expect(BAI_HOC).toContain('enrollment: { status: "ACTIVE" }');
  });

  it("⭐ materializer cũng ngừng sinh bài mới cho suất đã dừng", () => {
    expect(BAI_HOC).toContain('enrollment: { status: "ACTIVE", acceptedAt: { not: null } }');
  });

  it("cha mẹ được báo, và được báo bằng ĐÚNG câu người trực đã chọn", () => {
    const t = than(ADMIN_ACTIONS, "tamDungSuat");
    expect(t).toContain("notify(");
    // Không viết lại lời: `body` lấy thẳng từ catalog, nên `/admin` và `/gia-dinh` không
    // bao giờ nói hai câu khác nhau về cùng một chuyện.
    expect(t).toContain("body: ly.choChaMe");
  });
});

// ---------------------------------------------------------------------------
// 2. Lý do tạm dừng - chữ cha mẹ đọc
// ---------------------------------------------------------------------------

describe("§9.42 - lý do tạm dừng là danh sách ĐÓNG", () => {
  it("khoá không trùng, và có ít nhất ba lý do", () => {
    const khoa = LY_DO_TAM_DUNG.map((l) => l.khoa);
    expect(new Set(khoa).size).toBe(khoa.length);
    expect(khoa.length).toBeGreaterThanOrEqual(3);
  });

  it("⭐ không câu nào nói về bệnh tật hay cái chết của con vật (§18.4)", () => {
    // Nội dung về sức khoẻ/cái chết phải qua chuyên gia giáo dục, thú y và pháp lý duyệt
    // trước - một dòng trạng thái không phải chỗ để nó rò ra.
    const cam = ["chết", "ốm", "bệnh", "dịch", "tiêu huỷ", "tiêu hủy", "mổ", "thịt"];
    for (const l of LY_DO_TAM_DUNG) {
      for (const c of cam) {
        expect(l.choChaMe.toLowerCase().includes(c), `"${l.khoa}" nói tới "${c}"`).toBe(false);
        expect(l.choQuanTri.toLowerCase().includes(c), `"${l.khoa}" (quản trị) nói tới "${c}"`).toBe(false);
      }
    }
  });

  it("⭐ mọi câu cho cha mẹ đều trả lời câu họ sẽ hỏi đầu tiên: đàn gà có sao không", () => {
    for (const l of LY_DO_TAM_DUNG) {
      expect(l.choChaMe.toLowerCase(), `"${l.khoa}" không nhắc gì tới đàn`).toContain("đàn");
    }
  });

  it("khoá lạ / rỗng / kiểu dữ liệu lạ vẫn ra một câu tử tế, không ra khoảng trắng", () => {
    for (const rac of [null, undefined, "", "KHONG_CO_THAT", "  ", "0"]) {
      expect(timLyDoTamDung(rac as unknown)).toBeNull();
      const cau = cauTamDung(rac as unknown as string);
      expect(cau.length, `khoá ${String(rac)} ra câu rỗng`).toBeGreaterThan(20);
      expect(cau.toLowerCase()).toContain("đàn");
    }
  });

  it("catalog tra TRƯỚC khi chạm DB", () => {
    const t = than(ADMIN_ACTIONS, "tamDungSuat");
    expect(t.indexOf("timLyDoTamDung")).toBeLessThan(t.indexOf("prisma."));
  });
});

// ---------------------------------------------------------------------------
// 3. Nhãn của nông dân - không bao giờ bắt buộc
// ---------------------------------------------------------------------------

describe("§9.42 - nhãn một chạm là TUỲ CHỌN", () => {
  it("đúng năm nhãn của spec §18.3, không thêm", () => {
    expect(NHAN_CHAM_SOC.map((n) => n.khoa).sort()).toEqual(
      ["CHO_AN", "KIEM_TRA_CHUONG", "NHAT_TRUNG", "RA_VUON", "UONG_NUOC"],
    );
  });

  it("⭐⭐ completeTask không bao giờ từ chối vì thiếu nhãn", () => {
    const t = than(WORKER_ACTIONS, "completeTask");
    expect(t.length).toBeGreaterThan(500);
    // Không một nhánh từ chối nào nhìn tới `nhan`. Mục tiêu §4: cô chú tăng tải ≤30
    // phút/tuần, và một trường bắt buộc trên đường "báo xong" đứng chắn giữa một người
    // đang ở ngoài chuồng và việc họ vừa làm.
    for (const dong of t.split("\n")) {
      if (dong.includes("nope(")) {
        expect(dong.includes("nhan"), `một nhánh từ chối nhìn tới nhãn: ${dong.trim()}`).toBe(false);
      }
    }
    // Và nút gửi ở giao diện cũng không nhìn tới nhãn.
    const form = boChuThich(doc("src/components/WorkerForms.tsx"));
    const iNut = form.indexOf('onClick={finish} disabled=');
    expect(iNut).toBeGreaterThan(-1);
    expect(form.slice(iNut, iNut + 70).includes("nhan")).toBe(false);
  });

  it("⭐ nhãn THAY câu mặc định, và chữ cô chú tự gõ luôn thắng", () => {
    const t = than(WORKER_ACTIONS, "completeTask");
    // Thứ tự ba nhánh chính là lý do nhãn đáng một cái chạm: nó bớt gõ, không thêm việc.
    expect(t).toMatch(/const text = note \|\| nhan\?\.cau \|\|/);
  });

  it("⭐ khoá lạ / không hợp với loại việc ⟹ BỎ NHÃN, không hỏng cả việc", () => {
    // `CHO_AN` chỉ có ở việc `FEED`. Bắn nó vào một việc `HARVEST` là chuyện của người gõ
    // thẳng vào endpoint (§9.6) - và cái đáng làm với nó là lờ đi.
    expect(locNhan("HARVEST", "CHO_AN")).toBeNull();
    expect(locNhan("CHECK", "CHO_AN")).toBeNull();
    expect(locNhan("FEED", "CHO_AN")?.khoa).toBe("CHO_AN");
    for (const rac of [null, undefined, 0, {}, [], "", "XOA_HET", true]) {
      expect(locNhan("FEED", rac as unknown), `rác ${JSON.stringify(rac)} lọt qua`).toBeNull();
    }
    for (const rac of [null, undefined, "", "KHONG_CO_THAT"]) {
      expect(nhanChoViec(rac as unknown as string)).toEqual([]);
    }
  });

  it("mọi nhãn đều gắn được vào ít nhất một loại việc, và loại việc đó có thật", () => {
    const VIEC = ["FEED", "CHECK", "RANGE_OUT", "RANGE_IN"];
    for (const n of NHAN_CHAM_SOC) {
      expect(n.viec.length, `nhãn ${n.khoa} không gắn vào việc nào - một nút chết (§9.2)`)
        .toBeGreaterThan(0);
      for (const v of n.viec) expect(VIEC).toContain(v);
      // Chữ trên chip: ngón tay cái, ngoài nắng, một tay cầm điện thoại.
      expect(n.nhan.length).toBeLessThanOrEqual(14);
      expect(n.cau.length).toBeGreaterThan(20);
    }
  });

  it("⭐ CHECK có nhiều hơn một nhãn - đó là toàn bộ lý do nhãn tồn tại", () => {
    // `CHECK` gộp ba mong muốn khác nhau của bé (kiểm tra nước · dọn ổ đẻ · chụp cận cảnh).
    // Nếu có ngày nó chỉ còn một nhãn thì tính năng này không còn phân biệt được gì cả.
    expect(nhanChoViec("CHECK").length).toBeGreaterThanOrEqual(2);
  });

  it("⭐ nhãn đi vào sự kiện dưới dạng khoá đóng, và được khai trong danh sách trường", () => {
    expect(TRUONG_PAYLOAD.CARE_TASK_COMPLETED).toContain("tag");
    const t = than(WORKER_ACTIONS, "completeTask");
    // Chỉ khoá, không phải câu chữ - `payload` chảy vào màn hình của trẻ (§9.38).
    expect(t).toContain("tag: nhan?.khoa ?? null");
    expect(t.includes("tag: nhan?.cau")).toBe(false);
  });

  it("⭐ nhãn CHƯA đổi bài học nào - tách nội dung theo nhãn phải qua chuyên gia trước", () => {
    // NO-GO §23: mọi biến thể nội dung cho trẻ phải được chuyên gia giáo dục duyệt. Ở đợt
    // này nhãn là **đầu vào để đo**, không phải một nhánh nội dung. Ngày nào `chonDonVi`
    // đọc tới `tag` thì phép kiểm này đỏ, và người sửa phải quay lại đọc §23.
    const t = than(BAI_HOC_META, "chonDonVi");
    expect(t.length).toBeGreaterThan(100);
    expect(t.includes("tag")).toBe(false);
  });

  it("⭐ chỉ completeTask được ghi careTag - một cửa ghi", () => {
    for (const f of [
      "src/app/task-actions.ts", "src/app/care-actions.ts", "src/lib/task-store.ts",
      "src/app/learning-actions.ts", "src/app/admin-actions.ts",
    ]) {
      expect(doc(f).includes("careTag"), `${f} ghi careTag`).toBe(false);
    }
    expect(WORKER_ACTIONS).toContain("careTag: nhan?.khoa ?? null");
  });

  it("đo đạc chỉ bắn khi cô chú THẬT SỰ gắn nhãn", () => {
    const t = than(WORKER_ACTIONS, "completeTask");
    const i = t.indexOf('track("care_tag_used"');
    expect(i).toBeGreaterThan(-1);
    // Nằm trong một nhánh `if (nhan)`. Đếm số lần bỏ qua là bước đầu của việc nó thành bắt buộc.
    expect(t.slice(0, i)).toMatch(/if \(nhan\) \{\s*$/m);
  });
});

// ---------------------------------------------------------------------------
// 4. Xuất dữ liệu của bé
// ---------------------------------------------------------------------------

describe("§9.42 - xuất dữ liệu: chỉ ĐỌC, và chỉ của đúng bé đó", () => {
  it("⭐⭐ goiDuLieuTre không ghi một dòng nào", () => {
    // Kể cả một dấu "đã tải lúc nào". Ghi đo đạc là việc của action gọi nó.
    expect(demGhi(XUAT), "lib/xuat-du-lieu.ts có phép ghi").toBe(0);
  });

  it("⭐⭐ mọi truy vấn trong gói dữ liệu đều lọc theo ĐÚNG childId", () => {
    const t = than(XUAT, "goiDuLieuTre");
    expect(t.length).toBeGreaterThan(500);
    const soTruyVan = (t.match(/prisma\.\w+\./g) ?? []).length;
    const soLoc =
      (t.match(/childId: be\.id/g) ?? []).length + (t.match(/where: \{ id: childId \}/g) ?? []).length;
    // Một tệp sắp rời máy chủ về máy người dùng. Một dòng của nhà khác lọt vào đây thì
    // không có cách nào gọi nó về.
    expect(soTruyVan, "số truy vấn không khớp số phép lọc theo bé").toBe(soLoc);
    expect(soTruyVan).toBeGreaterThanOrEqual(4);
  });

  it("⭐ tệp không mang đường dẫn ảnh/video nào", () => {
    // Ảnh là dữ liệu của NÔNG TRẠI, không phải của bé (§17.4). Cha mẹ xem ở nhật ký chuồng.
    const t = than(XUAT, "goiDuLieuTre");
    for (const cam of ["url", "barnMedia", "proofMediaId", "mediaUrl"]) {
      expect(t.includes(cam), `gói dữ liệu mang "${cam}"`).toBe(false);
    }
    expect(CHU_DAN_XUAT.join(" ")).toContain("NÔNG TRẠI");
  });

  it("⭐ tên tệp không mang tên gọi ở nhà của bé", () => {
    // Tệp rơi vào thư mục Tải về của một cái máy có thể không chỉ mình cha mẹ dùng, và một
    // tên tệp hiện ra trước cả khi ai đó mở nó.
    const ten = tenTepXuat(new Date("2026-08-14T03:00:00Z"));
    expect(ten).toBe("chicchic-du-lieu-cua-be-2026-08-14.json");
    expect(than(XUAT, "tenTepXuat").includes("nickname")).toBe(false);
  });

  it("⭐ cổng của taiDuLieuTre cao BẰNG cổng rút/xoá, và đứng trước phép đọc", () => {
    const t = than(FAMILY_ACTIONS, "taiDuLieuTre");
    expect(t.length).toBeGreaterThan(300);
    const iMe = t.indexOf("chaMe()");
    const iXacMinh = t.indexOf("daXacMinhGanDay()");
    const iSoHuu = t.indexOf("canParentManageChild");
    const iGoi = t.indexOf("goiDuLieuTre");
    expect(iMe).toBeGreaterThan(-1);
    expect(iMe).toBeLessThan(iXacMinh);
    expect(iXacMinh).toBeLessThan(iSoHuu);
    expect(iSoHuu).toBeLessThan(iGoi);
  });

  it("⭐ tải về KHÔNG xoá dấu xác minh - đường đi thật là tải rồi mới xoá", () => {
    // Khác hẳn `rutConsentTre`/`xoaDuLieuTre`, và cố ý: bắt gõ mật khẩu hai lần trong một
    // phút không làm ai an toàn hơn, chỉ làm bước cuối khó chịu đúng lúc người ta đang buồn.
    // Việc này chỉ đọc; dấu vẫn tự hết sau `RECENT_AUTH_MS`.
    const t = than(FAMILY_ACTIONS, "taiDuLieuTre");
    expect(t.includes("xoaDauXacMinh")).toBe(false);
    // Còn hai hàm kia thì vẫn phải xoá - đừng nới lỏng nhầm chỗ.
    expect(than(FAMILY_ACTIONS, "rutConsentTre")).toContain("xoaDauXacMinh");
    expect(than(FAMILY_ACTIONS, "xoaDuLieuTre")).toContain("xoaDauXacMinh");
  });

  it("đo đạc của việc tải về chỉ mang nhóm tuổi", () => {
    const t = than(FAMILY_ACTIONS, "taiDuLieuTre");
    const i = t.indexOf('track("child_data_exported"');
    expect(i).toBeGreaterThan(-1);
    const doan = t.slice(i, i + 160);
    for (const cam of ["nickname", "childId", "soDong", "count", "avatarKey"]) {
      expect(doan.includes(cam), `đo đạc mang "${cam}"`).toBe(false);
    }
    expect(doan).toContain("ageBand");
  });

  it("nút tải nằm NGAY TRÊN nút xoá, không ở trang khác", () => {
    // §17.3 mục 5: cha mẹ được **chọn** giữa xoá ngay và mang dữ liệu đi trước. Thứ tự trên
    // màn hình là thứ tự người ta làm; đặt nó dưới nút xoá là để phần lớn không bao giờ thấy.
    const form = boChuThich(doc("src/components/FamilyPrivacyForms.tsx"));
    const iTai = form.indexOf("Tải dữ liệu của bé về máy");
    const iXoa = form.indexOf("Xoá hẳn dữ liệu của bé");
    expect(iTai).toBeGreaterThan(-1);
    expect(iXoa).toBeGreaterThan(-1);
    expect(iTai).toBeLessThan(iXoa);
  });
});

// ---------------------------------------------------------------------------
// 5. Bảng vận hành - chỉ để nhìn
// ---------------------------------------------------------------------------

describe("§9.42 - bảng vận hành chỉ ĐỌC và không mang dữ liệu của một đứa trẻ", () => {
  it("⭐⭐ lib/van-hanh.ts không có một phép ghi nào", () => {
    // Quét theo LỜI GỌI, không theo chữ: `createdAt` chứa "create" (bài học Epic 6).
    expect(demGhi(VAN_HANH), "lib/van-hanh.ts có phép ghi").toBe(0);
  });

  it("⭐ trang /admin/gia-dinh không có nút nào và không ghi gì", () => {
    expect(demGhi(TRANG_ADMIN)).toBe(0);
    // Nút tạm dừng nằm ở khối trên `/admin`, cạnh danh sách suất - chỗ người trực đang nhìn
    // khi họ quyết định. Một bảng số liệu có nút là một bảng người ta bấm nhầm lúc đọc.
    expect(TRANG_ADMIN.includes("<button")).toBe(false);
    expect(TRANG_ADMIN.includes("use client")).toBe(false);
  });

  it("⭐ cổng: isAdmin rồi cờ tổng, cả hai trước khi đọc số liệu", () => {
    const iAdmin = TRANG_ADMIN.indexOf("isAdmin()");
    const iCo = TRANG_ADMIN.indexOf("batFamily()");
    const iDoc = TRANG_ADMIN.indexOf("bangVanHanh()");
    expect(iAdmin).toBeGreaterThan(-1);
    expect(iAdmin).toBeLessThan(iCo);
    expect(iCo).toBeLessThan(iDoc);
    // Cờ tắt ⟹ không lộ gì cả, kể cả việc có tính năng này (§11.51).
    expect(TRANG_ADMIN).toContain("notFound()");
  });

  it("⭐ không dòng nào lần ngược ra được một đứa trẻ cụ thể (§17.5)", () => {
    for (const cam of ["nickname", "avatarKey", "childId", "biệt danh"]) {
      expect(TRANG_ADMIN.includes(cam), `trang vận hành mang "${cam}"`).toBe(false);
    }
    // `lib/van-hanh.ts` được phép **đếm** theo `childId` (nó là khoá để gộp), nhưng không
    // được trả một cái tên nào ra ngoài.
    for (const cam of ["nickname", "avatarKey"]) {
      expect(VAN_HANH.includes(cam), `lib/van-hanh.ts đọc "${cam}"`).toBe(false);
    }
  });

  it("mẫu số của tỉ lệ kích hoạt tính CẢ nhà đã rút", () => {
    // Bỏ họ ra là làm con số đẹp lên bằng cách quên đi những người bỏ đi.
    const t = than(VAN_HANH, "bangVanHanh");
    expect(t).toContain("tiLe(daNhan, suats.length)");
  });
});

// ---------------------------------------------------------------------------
// 6. Chưa đủ dữ liệu thì nói là chưa đủ
// ---------------------------------------------------------------------------

describe("§9.42 - không vẽ ra 0% khi chưa có dữ liệu", () => {
  it("⭐ mẫu số bằng 0 ⟹ null, KHÔNG phải 0", () => {
    // Lời nói dối kinh điển của bảng số liệu tự làm: chưa mời nhà nào thì bảng hiện
    // "0% kích hoạt", người đọc thấy đỏ và kết luận tính năng hỏng.
    expect(tiLe(0, 0)).toBeNull();
    expect(tiLe(5, 0)).toBeNull();
    expect(tiLe(0, 10)).toBe(0);
    expect(tiLe(1, 3)).toBe(33.3);
    expect(tiLe(3, 3)).toBe(100);
    for (const rac of [NaN, Infinity, -Infinity]) {
      expect(tiLe(rac, 10)).toBeNull();
      expect(tiLe(1, rac)).toBeNull();
    }
  });

  it("null đi thẳng thành 'chưa đo', không thành 'chưa đạt'", () => {
    expect(soNguong(null, 60)).toBe("chua-do");
    expect(soNguong(59.9, 60)).toBe("chua-dat");
    expect(soNguong(60, 60)).toBe("dat");
    expect(soTran(null, 30)).toBe("chua-do");
    expect(soTran(30, 30)).toBe("dat");
    expect(soTran(30.1, 30)).toBe("chua-dat");
  });

  it("trang vẽ dấu gạch chứ không vẽ số 0 khi chưa đủ dữ liệu", () => {
    expect(TRANG_ADMIN).toMatch(/giaTri === null \? "—"/);
  });

  it("⭐ số phút của nông dân luôn đi kèm chữ nói rõ nó là ƯỚC LƯỢNG", () => {
    // Repo này không bấm giờ cô chú và sẽ không bấm giờ. Một con số ước không kèm cảnh báo
    // là một con số sẽ bị trích ra khỏi ngữ cảnh vào một hôm nào đó.
    expect(CANH_BAO_UOC).toContain("không phải số bấm giờ");
    expect(TRANG_ADMIN).toContain("CANH_BAO_UOC");
    expect(PHUT_MOI_VIEC_UOC).toBeGreaterThan(0);
    // Và nói rõ chỗ lệch với §4.4: ngưỡng tính theo NÔNG TRẠI, còn ở đây tính theo CHUỒNG.
    expect(TRANG_ADMIN).toContain("nông trại</b>/tuần");
  });

  it("ngưỡng khớp §4.4 của bản kế hoạch", () => {
    expect(NGUONG_PILOT.kichHoat).toBe(60);
    expect(NGUONG_PILOT.moMan).toBe(50);
    expect(NGUONG_PILOT.giuChan).toBe(40);
    expect(NGUONG_PILOT.ngoaiDoi).toBe(30);
    expect(NGUONG_PILOT.traLoi).toBe(50);
    expect(NGUONG_PILOT.taiNongDanPhut).toBe(30);
  });

  it("⭐ chỉ số 'trẻ tự mua' được nói là theo CẤU TRÚC, không giả vờ là một phép đếm", () => {
    // Một số 0 lấy từ phép đếm rỗng trông y hệt một số 0 lấy từ phép đếm đúng, và cái người
    // đọc cần biết là **vì sao** nó bằng 0.
    expect(TRANG_ADMIN).toContain("0 theo cấu trúc");
    expect(TRANG_ADMIN).toContain("không phải một phép đếm");
  });
});

// ---------------------------------------------------------------------------
// 7. Đo đạc
// ---------------------------------------------------------------------------

describe("§9.42 - đo đạc của Epic 7", () => {
  it("bốn tên sự kiện mới đều nằm trong danh sách đóng", () => {
    for (const ten of [
      "family_enrollment_paused", "family_enrollment_resumed",
      "child_data_exported", "care_tag_used",
    ]) {
      expect(TRACK.includes(`| "${ten}"`), `thiếu "${ten}" trong EventName`).toBe(true);
    }
  });

  it("⭐ đo đạc của tạm dừng chỉ mang nhóm pilot và khoá lý do", () => {
    const t = than(ADMIN_ACTIONS, "tamDungSuat");
    const i = t.indexOf('track("family_enrollment_paused"');
    expect(i).toBeGreaterThan(-1);
    const doan = t.slice(i, i + 200);
    expect(doan).toContain("cohortKey");
    expect(doan).toContain("lyDo: ly.khoa");
    // Không nhãn chuồng, không tên người - bảng `Event` hiện ra ở `/admin` cho ai trực cũng đọc.
    for (const cam of ["barnLabel", "barn.label", "choChaMe", "nickname"]) {
      expect(doan.includes(cam), `đo đạc mang "${cam}"`).toBe(false);
    }
  });
});
