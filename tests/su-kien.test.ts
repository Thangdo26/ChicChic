// FAMILY LEARNING - Epic 3: hộp thư đi (outbox) của nghiệp vụ.
//
// Bộ kiểm này canh bốn thứ, và cả bốn đều thuộc loại "hỏng thì im lặng":
//
//  1. **Đúng một đường ghi.** Không file nào ngoài `lib/su-kien.ts` được gọi
//     `prisma.domainEvent.create*` - luật chống trùng, hàng rào riêng tư và cầu dao đều nằm
//     ở đó, nên đường ghi thứ hai là mất cả ba cùng lúc (§9.38).
//  2. **Đúng một lần.** Khoá chống trùng đúng mẫu spec, và cách ghi là `skipDuplicates` chứ
//     không phải `create` - vì trong Postgres một lỗi khoá trùng làm hỏng cả transaction
//     đang mở, tức kéo theo việc của nông dân quay đầu.
//  3. **Payload không mang dữ liệu cấm.** Đây là thứ chảy vào màn hình của một đứa trẻ.
//  4. **Sự kiện nằm trong transaction của việc thật** - trừ đúng một nguồn đã ghi rõ lý do.
//
// Không nối DB, không dựng server. Phần phải chạy thật ghi ở CODEMAP §13.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_CHU_PAYLOAD, MOI_LOAI_SU_KIEN, TRUONG_PAYLOAD,
  dungSuKien, khoaTrung, locPayload, type LoaiSuKien, type NguonSuKien,
} from "@/lib/su-kien-meta";

const doc = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");

function moiFileNguon(thuMuc = "src"): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(join(process.cwd(), thuMuc))) {
    const duong = `${thuMuc}/${ten}`;
    if (statSync(join(process.cwd(), duong)).isDirectory()) ra.push(...moiFileNguon(duong));
    else if (/\.tsx?$/.test(ten)) ra.push(duong);
  }
  return ra;
}

const META = doc("src/lib/su-kien-meta.ts");
const GHI = doc("src/lib/su-kien.ts");
const SCHEMA = doc("prisma/schema.prisma");
const WORKER = boChuThich(doc("src/app/worker-actions.ts"));
const HARVEST = boChuThich(doc("src/app/harvest-actions.ts"));
const FAMILY = boChuThich(doc("src/app/family-actions.ts"));
const JOBS = boChuThich(doc("src/lib/jobs.ts"));

/** Một mẫu của mỗi loại, đủ để dựng dòng thật. */
const MAU: Record<LoaiSuKien, NguonSuKien> = {
  FAMILY_ENROLLED: {
    type: "FAMILY_ENROLLED", enrollmentId: "en1", barnId: "b1", flockId: "f1",
    programVersion: "v1", lifecyclePolicy: "FAMILY_RETIRE_ONLY",
  },
  CARE_TASK_COMPLETED: {
    type: "CARE_TASK_COMPLETED", taskId: "t1", barnId: "b1", flockId: "f1",
    kind: "FEED", mediaType: "PHOTO", proofMediaId: "m1",
  },
  FLOCK_STAGE_CHANGED: {
    type: "FLOCK_STAGE_CHANGED", flockId: "f1", barnId: "b1",
    from: "BROODING", to: "GROWING", productLine: "LAYER",
  },
  FIRST_EGG_RECORDED: {
    type: "FIRST_EGG_RECORDED", flockId: "f1", barnId: "b1", productLine: "LAYER",
    qty: 7, proofMediaId: "m1",
  },
  HARVEST_LOGGED: {
    type: "HARVEST_LOGGED", lotId: "l1", barnId: "b1", flockId: "f1",
    lotType: "EGG", qty: 12, weightKg: null, storage: "CHILLED", proofMediaId: "m1",
  },
  LOT_CLAIMED: {
    type: "LOT_CLAIMED", lotId: "l1", barnId: "b1", flockId: "f1", lotType: "EGG", qty: 12,
  },
  HANDOVER_COMPLETED: {
    type: "HANDOVER_COMPLETED", lotId: "l1", barnId: "b1", flockId: "f1", lotType: "EGG", qty: 12,
  },
};

// ---------------------------------------------------------------------------
// 1. Khoá chống trùng - toàn bộ cơ chế "đúng một lần"
// ---------------------------------------------------------------------------

describe("khoá chống trùng", () => {
  it("⭐ đúng mẫu spec §12.6", () => {
    // Mẫu khoá là hợp đồng với chính mình ở tương lai: đổi mẫu sau khi đã chạy thật nghĩa là
    // mọi sự kiện cũ bỗng thành "chưa từng ghi", và mỗi đứa trẻ nhận lại toàn bộ bài học cũ.
    expect(khoaTrung(MAU.FAMILY_ENROLLED)).toBe("family-enrolled:en1");
    expect(khoaTrung(MAU.CARE_TASK_COMPLETED)).toBe("task-done:t1");
    expect(khoaTrung(MAU.FLOCK_STAGE_CHANGED)).toBe("flock-stage:f1:GROWING");
    expect(khoaTrung(MAU.FIRST_EGG_RECORDED)).toBe("first-egg:f1");
    expect(khoaTrung(MAU.HARVEST_LOGGED)).toBe("harvest:l1");
    expect(khoaTrung(MAU.LOT_CLAIMED)).toBe("lot-claimed:l1");
    expect(khoaTrung(MAU.HANDOVER_COMPLETED)).toBe("handover:l1");
  });

  it("bảy loại cho bảy khoá khác nhau - không loại nào đè lên loại nào", () => {
    const khoa = MOI_LOAI_SU_KIEN.map((t) => khoaTrung(MAU[t]));
    expect(new Set(khoa).size).toBe(khoa.length);
  });

  it("cùng một việc gọi lại thì ra ĐÚNG một khoá (bấm hai lần, chạy lại việc nền)", () => {
    for (const t of MOI_LOAI_SU_KIEN) {
      expect(khoaTrung(MAU[t]), t).toBe(khoaTrung({ ...MAU[t] }));
    }
  });

  it("⭐ chặng khác nhau của cùng một đàn là hai khoá khác nhau", () => {
    // Một đàn đi qua nhiều chặng, và mỗi chặng là một bài học riêng. Bỏ chặng khỏi khoá thì
    // đàn chỉ còn được kể chuyện đúng một lần trong cả vòng đời.
    const a = khoaTrung({ ...MAU.FLOCK_STAGE_CHANGED, to: "GROWING" } as NguonSuKien);
    const b = khoaTrung({ ...MAU.FLOCK_STAGE_CHANGED, to: "FINISHING" } as NguonSuKien);
    expect(a).not.toBe(b);
  });

  it("khoá luôn có tiền tố rồi mới tới id - không khoá nào là id trần", () => {
    for (const t of MOI_LOAI_SU_KIEN) {
      const k = khoaTrung(MAU[t]);
      expect(k, t).toContain(":");
      expect(k.split(":")[0].length, t).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Hàng rào quyền riêng tư - payload chảy vào màn hình của một đứa trẻ
// ---------------------------------------------------------------------------

/** Tên trường tuyệt đối không được có mặt trong payload (spec §12.6). */
const CAM = [
  "nickname", "childid", "child", "be", "tre", "avatar", "avatarkey", "birth", "dob", "ngaysinh",
  "address", "diachi", "deliverto", "line", "phone", "sdt", "email", "fullname", "hoten", "name",
  "bank", "accountno", "banksnapshot", "amount", "vnd", "price", "payout", "paycode",
  "note", "text", "message", "body", "caption", "reason", "url", "deliverline",
];

describe("payload - hàng rào quyền riêng tư (§9.38)", () => {
  it("⭐ không loại nào khai một trường nằm trong danh sách cấm", () => {
    // Quét theo RANH GIỚI TỪ ở dạng thường: `lotType` chứa "type" là chuyện bình thường,
    // nhưng một trường tên đúng `note` thì không.
    for (const t of MOI_LOAI_SU_KIEN) {
      for (const truong of TRUONG_PAYLOAD[t]) {
        expect(CAM, `${t}.${truong}`).not.toContain(truong.toLowerCase());
      }
    }
  });

  it("⭐ trường lạ bị LOẠI, không được ném lỗi", () => {
    // Ném lỗi ở đây nghĩa là một cái tên gõ sai làm quay đầu việc nông dân đã làm ngoài đời.
    const ra = locPayload("LOT_CLAIMED", {
      lotType: "EGG", qty: 12,
      deliverTo: { line: "số 4 ngõ 12", phone: "09xxxxxxx" },
      note: "để cổng sau",
    });
    expect(ra).toEqual({ lotType: "EGG", qty: 12 });
  });

  it("chữ dài hơn trần bị loại - đó là chữ người thật gõ, không phải nhãn", () => {
    const ngan = "E".repeat(MAX_CHU_PAYLOAD);
    const dai = "E".repeat(MAX_CHU_PAYLOAD + 1);
    expect(locPayload("LOT_CLAIMED", { lotType: ngan })).toEqual({ lotType: ngan });
    expect(locPayload("LOT_CLAIMED", { lotType: dai })).toEqual({});
  });

  it("đối tượng lồng và mảng bị loại - chỗ dữ liệu cấm hay đi nhờ nhất", () => {
    expect(locPayload("HARVEST_LOGGED", {
      qty: 3,
      lotType: ["EGG"],
      storage: { che: "do" },
      proofMediaId: new Date(),
    })).toEqual({ qty: 3 });
  });

  it("null và số giữ nguyên, số vô nghĩa thành null", () => {
    expect(locPayload("HARVEST_LOGGED", { weightKg: null })).toEqual({ weightKg: null });
    expect(locPayload("HARVEST_LOGGED", { weightKg: 1.8 })).toEqual({ weightKg: 1.8 });
    expect(locPayload("HARVEST_LOGGED", { weightKg: NaN })).toEqual({ weightKg: null });
    expect(locPayload("HARVEST_LOGGED", { weightKg: Infinity })).toEqual({ weightKg: null });
  });

  it("⭐ dòng dựng ra không mang định danh trong thân", () => {
    // `barnId`/`flockId` có cột riêng. Nhân bản chúng vào `payload` chỉ tạo thêm một chỗ để
    // lệch nhau, và một chỗ nữa để lộ ra ngoài.
    for (const t of MOI_LOAI_SU_KIEN) {
      const d = dungSuKien(MAU[t], new Date());
      for (const k of Object.keys(d.payload)) {
        expect(["barnId", "flockId", "type"], `${t}.${k}`).not.toContain(k);
      }
    }
  });

  it("mọi giá trị trong dòng dựng ra đều là số/cờ/chữ ngắn/null", () => {
    for (const t of MOI_LOAI_SU_KIEN) {
      for (const [k, v] of Object.entries(dungSuKien(MAU[t], new Date()).payload)) {
        const dung = v === null || typeof v === "number" || typeof v === "boolean" ||
          (typeof v === "string" && v.length <= MAX_CHU_PAYLOAD);
        expect(dung, `${t}.${k} = ${JSON.stringify(v)}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Dòng dựng ra khớp với bảng
// ---------------------------------------------------------------------------

describe("dựng dòng sự kiện", () => {
  it("mọi loại đều có đối tượng gốc và khoá", () => {
    for (const t of MOI_LOAI_SU_KIEN) {
      const d = dungSuKien(MAU[t], new Date("2026-01-02T03:04:05Z"));
      expect(d.type, t).toBe(t);
      expect(d.aggregateType.trim(), t).not.toBe("");
      expect(d.aggregateId.trim(), t).not.toBe("");
      expect(d.dedupeKey, t).toBe(khoaTrung(MAU[t]));
      expect(d.schemaVersion, t).toBe(1);
      expect(d.happenedAt.toISOString(), t).toBe("2026-01-02T03:04:05.000Z");
    }
  });

  it("`happenedAt` là lúc việc xảy ra, do nơi phát truyền vào - không phải `now` bên trong", () => {
    // Việc nền chạy 3 giờ sáng cho một việc xảy ra hôm qua: hai mốc đó không được lẫn nhau,
    // vì materializer lọc theo `acceptedAt` bằng đúng cột này.
    const cu = new Date("2020-05-06T07:08:09Z");
    expect(dungSuKien(MAU.HARVEST_LOGGED, cu).happenedAt).toEqual(cu);
  });

  it("bảy loại trong TS khớp đúng enum trong schema", () => {
    const khoi = SCHEMA.slice(SCHEMA.indexOf("enum DomainEventType"));
    const than = khoi.slice(khoi.indexOf("{") + 1, khoi.indexOf("}"));
    const trongSchema = than.split(/\s+/).filter(Boolean).sort();
    expect(trongSchema).toEqual([...MOI_LOAI_SU_KIEN].sort());
  });

  it("mỗi loại đều có bảng trường payload riêng", () => {
    for (const t of MOI_LOAI_SU_KIEN) expect(TRUONG_PAYLOAD[t], t).toBeDefined();
    expect(Object.keys(TRUONG_PAYLOAD).sort()).toEqual([...MOI_LOAI_SU_KIEN].sort());
  });
});

// ---------------------------------------------------------------------------
// 4. Một đường ghi duy nhất, và cách ghi phải là skipDuplicates
// ---------------------------------------------------------------------------

describe("§9.38 - một đường ghi duy nhất", () => {
  it("⭐ KHÔNG file nào ngoài lib/su-kien.ts gọi prisma.domainEvent.create*", () => {
    const pham: string[] = [];
    for (const f of moiFileNguon()) {
      if (f === "src/lib/su-kien.ts") continue;
      if (/\bdomainEvent\.create/.test(boChuThich(doc(f)))) pham.push(f);
    }
    expect(pham).toEqual([]);
  });

  it("⭐ ghi bằng createMany + skipDuplicates, KHÔNG phải create", () => {
    // Đây không phải chuyện gọn gàng. Postgres làm hỏng cả transaction đang mở khi gặp lỗi
    // khoá trùng, nên `create` + bắt P2002 sẽ kéo theo việc của nông dân quay đầu ở câu lệnh
    // kế tiếp. `ON CONFLICT DO NOTHING` thì lần thử lại lặng lẽ không ghi gì.
    const than = boChuThich(GHI);
    expect(than).toContain("skipDuplicates: true");
    expect(than).toContain("domainEvent.createMany");
    expect(/domainEvent\.create\s*\(/.test(than)).toBe(false);
  });

  it("⭐ cờ tổng tắt thì không ghi gì - kiểm đứng TRƯỚC phép ghi", () => {
    const than = boChuThich(GHI);
    for (const ham of than.split("export async function ").slice(1)) {
      const iCo = ham.indexOf("batFamily()");
      const iGhi = ham.indexOf("domainEvent.createMany");
      expect(iCo, ham.slice(0, 40)).toBeGreaterThan(-1);
      expect(iGhi, ham.slice(0, 40)).toBeGreaterThan(iCo);
    }
  });

  it("phần thuần không chạm Prisma, env hay next/headers", () => {
    // Cùng luật với `family-gates.ts`: có chạm là hết chạy được trong `npm test`.
    // Quét bản ĐÃ BỎ CHÚ THÍCH - chính chú thích ở đầu file đó nhắc tên mấy thứ bị cấm, và
    // một phép kiểm đỏ vì lý do sai là phép kiểm sẽ bị ai đó tắt đi.
    const than = boChuThich(META);
    expect(than).not.toContain("@/lib/db");
    expect(than).not.toContain("process.env");
    expect(than).not.toContain("next/headers");
    expect(than).not.toMatch(/from "@prisma\/client"/);
  });

  it("hộp thư đi KHÔNG dùng track() và track() không dùng hộp thư đi", () => {
    // Hai hệ thống, hai nghĩa vụ (FL-D14). `track` nuốt lỗi - dựng lời hứa trên một thứ nuốt
    // lỗi là cách chắc chắn nhất để một đứa trẻ mất bài học mà không ai biết.
    expect(boChuThich(GHI)).not.toContain("track(");
    expect(boChuThich(doc("src/lib/track.ts"))).not.toContain("domainEvent");
  });
});

// ---------------------------------------------------------------------------
// 5. Bảy nơi phát, và sự kiện phải nằm trong transaction của việc thật
// ---------------------------------------------------------------------------

describe("bảy nơi phát (§14.2)", () => {
  it("⭐ đủ bảy loại, đúng file", () => {
    const noi: Record<LoaiSuKien, string> = {
      FAMILY_ENROLLED: FAMILY,
      CARE_TASK_COMPLETED: WORKER,
      HANDOVER_COMPLETED: WORKER,
      HARVEST_LOGGED: WORKER,
      FIRST_EGG_RECORDED: WORKER,
      LOT_CLAIMED: HARVEST,
      FLOCK_STAGE_CHANGED: JOBS,
    };
    for (const t of MOI_LOAI_SU_KIEN) {
      expect(noi[t], t).toContain(`"${t}"`);
    }
  });

  it("⭐ sáu nguồn ghi sự kiện BÊN TRONG transaction của việc thật", () => {
    // Nghiệp vụ quay đầu ⟹ sự kiện không tồn tại (§14.3). Quét theo vị trí: lời gọi phải nằm
    // sau chỗ mở `$transaction` và dùng `tx`, không phải `prisma`.
    for (const [ten, src] of [["worker", WORKER], ["harvest", HARVEST], ["family", FAMILY]] as const) {
      for (const m of src.matchAll(/ghi(Nhieu)?SuKien\(\s*(\w+)/g)) {
        expect(m[2], `${ten}: ${m[0]}`).toBe("tx");
      }
    }
  });

  it("⭐ đúng MỘT nguồn được phép ghi ngoài transaction, và là advanceFlocks", () => {
    // Ngoại lệ có lý do đã ghi tại chỗ: `updateMany` gom nhiều đàn và không nói đàn nào đã
    // đổi, nên phải đọc lại mới biết sự thật - lúc đó transaction đã đóng. Nếu có ngày nguồn
    // thứ hai muốn ra ngoài, phép kiểm này phải đỏ trước.
    const ngoai = [...JOBS.matchAll(/ghi(Nhieu)?SuKien\(\s*(\w+)/g)].map((m) => m[2]);
    expect(ngoai).toEqual(["prisma"]);
    const than = JOBS.slice(JOBS.indexOf("async function advanceFlocks"));
    expect(than.slice(0, than.indexOf("\n}\n")), "phải nằm trong advanceFlocks").toContain("ghiNhieuSuKien");
  });

  it("⭐ việc chăm sóc: sự kiện đứng SAU dòng đặt DONE", () => {
    // Thứ tự này là phần "cùng sống cùng chết": sự kiện chỉ có nghĩa khi việc đã thật sự xong.
    const than = WORKER.slice(WORKER.indexOf("async function completeTask"));
    const iDone = than.indexOf('status: "DONE"');
    const iSuKien = than.indexOf("CARE_TASK_COMPLETED");
    expect(iDone).toBeGreaterThan(-1);
    expect(iSuKien).toBeGreaterThan(iDone);
  });

  it("⭐ xin nhận lô: sự kiện nằm sau phép so-sánh-rồi-đặt, không phải trước", () => {
    // Thua cuộc đua ⟹ không đổi được trạng thái ⟹ cũng không có sự kiện nào.
    const than = HARVEST.slice(HARVEST.indexOf("async function claimLot"));
    const iDoi = than.indexOf('status: "AT_FARM"');
    const iThua = than.indexOf("count === 0");
    const iSuKien = than.indexOf("LOT_CLAIMED");
    expect(iSuKien).toBeGreaterThan(iDoi);
    expect(iSuKien).toBeGreaterThan(iThua);
  });

  it("⭐ giao tận tay: KHÔNG mang deliverTo vào sự kiện", () => {
    // Đó là tên, số điện thoại và địa chỉ nhà của một gia đình.
    const than = WORKER.slice(WORKER.indexOf("HANDOVER_COMPLETED"));
    const khuc = than.slice(0, than.indexOf("}"));
    expect(khuc).not.toContain("deliverTo");
    expect(khuc).not.toContain("note");
  });

  it("⭐ quả trứng đầu tiên KHÔNG phát kèm FLOCK_STAGE_CHANGED", () => {
    // Hai bài học khác hẳn nhau; phát cả hai thì bé nhận hai lần cùng một câu chuyện. Chặng
    // do lịch đẩy là việc của `advanceFlocks`, chỗ này chỉ nói về quả trứng có ảnh làm chứng.
    expect(WORKER).toContain("FIRST_EGG_RECORDED");
    expect(WORKER).not.toContain("FLOCK_STAGE_CHANGED");
  });

  it("bảng Event (đo đạc) vẫn còn nguyên ở cả bảy nơi - không nguồn nào bị thay bằng outbox", () => {
    // Epic 3 mục 4: không đụng `track()`. Hai hệ thống cùng tồn tại.
    expect(WORKER).toContain('track("task_done"');
    expect(WORKER).toContain('track("harvest_logged"');
    expect(HARVEST).toContain('track("lot_claimed"');
    expect(FAMILY).toContain('track("family_enrolled"');
  });
});

// ---------------------------------------------------------------------------
// 6. Bảng trong schema
// ---------------------------------------------------------------------------

describe("bảng DomainEvent", () => {
  // Cắt tới đúng dấu `}` đóng của model, KHÔNG cắt tới `model Event` như bản đầu: Epic 4 chèn
  // hai bảng vào giữa hai model đó, và bộ kiểm lập tức đỏ vì cột `childId` của bảng khác chứ
  // không phải vì `DomainEvent` sai. Một phép kiểm đỏ vì lý do sai là phép kiểm sẽ bị tắt.
  const dau = SCHEMA.indexOf("model DomainEvent");
  const khoi = SCHEMA.slice(dau, SCHEMA.indexOf("\n}", dau));

  it("⭐ dedupeKey là duy nhất - không có nó thì không có gì chống trùng cả", () => {
    expect(khoi).toMatch(/dedupeKey\s+String\s+@unique/);
  });

  it("có schemaVersion, happenedAt tách khỏi createdAt, và hai chỉ mục tra cứu", () => {
    expect(khoi).toContain("schemaVersion");
    expect(khoi).toMatch(/happenedAt\s+DateTime/);
    expect(khoi).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(khoi).toContain("@@index([barnId, happenedAt])");
    expect(khoi).toContain("@@index([type, happenedAt])");
  });

  it("⭐ KHÔNG khoá ngoại sang Barn/Flock - đây là bản ghi lịch sử", () => {
    // Cùng luật với `Event.barnSlug`: sự kiện phải sống sót cả khi chuồng bị xoá hay đổi chủ.
    expect(khoi).not.toContain("@relation");
    expect(khoi).toMatch(/barnId\s+String\?/);
    expect(khoi).toMatch(/flockId\s+String\?/);
  });

  it("không có cột nào mang tên bị cấm", () => {
    for (const dong of khoi.split("\n")) {
      const ten = dong.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
      if (!ten || ten.startsWith("//") || ten.startsWith("@")) continue;
      expect(CAM, dong.trim()).not.toContain(ten);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Màn chẩn đoán ở /admin
// ---------------------------------------------------------------------------

describe("chẩn đoán ở /admin", () => {
  const ADMIN = boChuThich(doc("src/app/admin/page.tsx"));

  it("khối chỉ được vẽ khi cờ tổng bật", () => {
    const i = ADMIN.indexOf("Hộp thư đi");
    expect(i).toBeGreaterThan(-1);
    expect(ADMIN.slice(Math.max(0, i - 400), i)).toContain("batGiaDinh");
  });

  it("⭐ không lấy cột payload ra màn chẩn đoán", () => {
    const i = ADMIN.indexOf("prisma.domainEvent.findMany");
    expect(i).toBeGreaterThan(-1);
    expect(ADMIN.slice(i, i + 400)).not.toContain("payload");
  });

  it("màn chẩn đoán chỉ ĐỌC - không có action nào sửa sự kiện", () => {
    // Sự kiện nghiệp vụ là bản ghi lịch sử. Một cái nút sửa ở đây là một cái nút sửa lại
    // chuyện đã xảy ra ngoài đời.
    for (const f of moiFileNguon()) {
      if (f === "src/lib/su-kien.ts") continue;
      const s = boChuThich(doc(f));
      expect(/domainEvent\.(update|delete|upsert)/.test(s), f).toBe(false);
    }
  });
});
