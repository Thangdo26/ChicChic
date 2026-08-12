// FAMILY LEARNING - Epic 4: nội dung có kiểu + materializer.
//
// Bộ kiểm này canh bốn thứ, và cả bốn đều thuộc loại "không ai phát hiện ra cho tới khi một
// đứa trẻ đã đọc phải":
//
//  1. **Nội dung** - không một chữ nào trong danh sách cấm lọt vào thứ trẻ đọc (§21.5 của
//     spec), không URL ngoài, không con số bịa đặt về đàn gà.
//  2. **Đủ bộ** - mọi loại sự kiện đều có bài cho **cả hai** nhóm tuổi, hoặc có lý do bỏ qua
//     **khai rõ ràng**. Không có ô trống im lặng (§13.2).
//  3. **Chụp lại** - bài đã sinh không đổi khi catalog đổi (§13.3).
//  4. **Đúng một lần** - một sự kiện tạo tối đa một bài cho mỗi bé, và cửa sinh bài chỉ có
//     một (§9.39).
//
// Không nối DB, không dựng server. Phần phải chạy thật ghi ở CODEMAP §13.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATALOG, CHANG_CO_BAI, LY_DO_BO_QUA_VI, MAX_CHU_DU_KIEN, MAX_CHU_THE, TRUONG_DU_KIEN,
  TU_CAM_NOI_DUNG, VIEC_CO_BAI,
  chonDonVi, chuCuaTre, chupNoiDung, locDuKien, type DonViHoc,
} from "@/lib/bai-hoc-meta";
import { MOI_LOAI_SU_KIEN, type LoaiSuKien } from "@/lib/su-kien-meta";
import { NHIP } from "@/lib/nhip-meta";

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

const META = doc("src/lib/bai-hoc-meta.ts");
const DUNG = boChuThich(doc("src/lib/bai-hoc.ts"));
const ACTIONS = boChuThich(doc("src/app/learning-actions.ts"));
const SCHEMA = doc("prisma/schema.prisma");
const NHOM_TUOI = ["AGE_5_6", "AGE_7_8"] as const;

/** Payload mẫu để `chonDonVi` chạy được - loại nào cần gì thì có nấy. */
const PAYLOAD_HOP_LE: Record<LoaiSuKien, Record<string, unknown>> = {
  FAMILY_ENROLLED: { programVersion: "v1" },
  CARE_TASK_COMPLETED: { kind: "FEED" },
  FLOCK_STAGE_CHANGED: { from: "BROODING", to: "GROWING" },
  FIRST_EGG_RECORDED: { qty: 7 },
  HARVEST_LOGGED: { qty: 12, lotType: "EGG" },
  LOT_CLAIMED: { qty: 12, lotType: "EGG" },
  HANDOVER_COMPLETED: { qty: 12, lotType: "EGG" },
};

// ---------------------------------------------------------------------------
// 1. Hàng rào nội dung - thứ một đứa trẻ 5 tuổi sẽ đọc
// ---------------------------------------------------------------------------

describe("hàng rào nội dung (§21.5)", () => {
  it("⭐ không một chữ cấm nào lọt vào thứ trẻ đọc", () => {
    // Ba nhóm chữ, ba lý do khác nhau: tiền và mua bán (trẻ không phải đường bán hàng vào
    // nhà) · doạ và ép (kỹ thuật giữ chân dùng lên trẻ 5 tuổi thì gọi đúng tên là thao
    // túng) · giết mổ (MVP không kể chuyện đó cho hai nhóm tuổi này).
    for (const u of CATALOG) {
      for (const chu of chuCuaTre(u)) {
        const thuong = chu.toLowerCase();
        for (const cam of TU_CAM_NOI_DUNG) {
          expect(thuong.includes(cam), `${u.key}: "${chu}" chứa "${cam}"`).toBe(false);
        }
      }
    }
  });

  it("⭐ không con số nào về đàn gà bị viết cứng trong bài", () => {
    // Con số phải tới từ dữ kiện THẬT (`factSnapshot`), không từ câu chữ. Viết "hôm nay được
    // 12 quả" vào catalog nghĩa là mọi đứa trẻ ở mọi chuồng đều đọc đúng con số đó, và đó là
    // nói dối một đứa trẻ về chính đàn gà của nó.
    for (const u of CATALOG) {
      for (const chu of chuCuaTre(u)) {
        expect(/\d+\s*(quả|con|kg|trứng)/i.test(chu), `${u.key}: "${chu}"`).toBe(false);
      }
    }
  });

  it("không URL ngoài, không thẻ HTML", () => {
    for (const u of CATALOG) {
      for (const chu of chuCuaTre(u)) {
        expect(/https?:\/\/|www\./i.test(chu), `${u.key}: ${chu}`).toBe(false);
        expect(/<[a-z/]/i.test(chu), `${u.key}: ${chu}`).toBe(false);
      }
    }
  });

  it("mỗi mẩu chữ có trần độ dài và không rỗng", () => {
    for (const u of CATALOG) {
      for (const chu of chuCuaTre(u)) {
        expect(chu.trim(), u.key).not.toBe("");
        expect(chu.length, `${u.key}: "${chu.slice(0, 40)}…"`).toBeLessThanOrEqual(MAX_CHU_THE);
      }
    }
  });

  it("⭐ MVP không có bài nào cần bối cảnh người lớn ngồi cạnh", () => {
    // `CAREGIVER_CONTEXT` = bài đụng bệnh/chết/vòng đời khép lại. Thêm một bài như thế là một
    // quyết định phải có chuyên gia duyệt (§13.2), không phải một dòng code - nên phép kiểm
    // này đỏ lên là đúng lúc phải dừng lại hỏi người.
    for (const u of CATALOG) expect(u.sensitivity, u.key).toBe("NORMAL");
  });

  it("phản hồi khi trẻ chọn chưa đúng không mang giọng phạt (§8.2)", () => {
    for (const u of CATALOG) {
      for (const c of u.cards) {
        if (c.kind !== "observe") continue;
        for (const [k, loi] of Object.entries(c.explain)) {
          expect(/sai|dở|kém|thua|không được/i.test(loi), `${u.key}.${k}: ${loi}`).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Đủ bộ và đúng hình dạng
// ---------------------------------------------------------------------------

describe("catalog đủ bộ (§13.2)", () => {
  it("⭐ sáu chương × hai nhóm tuổi, không thiếu ô nào", () => {
    expect(CATALOG.length).toBe(12);
    for (const ch of [1, 2, 3, 4, 5, 6]) {
      for (const tuoi of NHOM_TUOI) {
        const co = CATALOG.filter((u) => u.chapter === ch && u.ageBand === tuoi);
        expect(co.length, `chương ${ch} · ${tuoi}`).toBe(1);
      }
    }
  });

  it("⭐ mọi loại sự kiện đều có bài cho CẢ HAI nhóm tuổi, hoặc có lý do bỏ qua khai rõ", () => {
    // Đây là phép kiểm chống "ô trống im lặng": thêm một loại sự kiện ở hộp thư đi mà quên
    // nội dung thì bé ở một nhóm tuổi có bài, nhóm kia không, và không ai biết.
    for (const t of MOI_LOAI_SU_KIEN) {
      const ket = NHOM_TUOI.map((tuoi) => chonDonVi(t, tuoi, PAYLOAD_HOP_LE[t]));
      const soCo = ket.filter((k) => k.chon === "co").length;
      expect([0, 2], `${t}: một nhóm tuổi có bài, nhóm kia không`).toContain(soCo);
      for (const k of ket) {
        if (k.chon === "bo") expect(Object.keys(LY_DO_BO_QUA_VI), t).toContain(k.lyDo);
      }
    }
  });

  it("khoá đơn vị không trùng nhau", () => {
    const khoa = CATALOG.map((u) => u.key);
    expect(new Set(khoa).size).toBe(khoa.length);
  });

  it("mỗi bài mở bằng một mẩu chuyện và đóng bằng một lời chúc mừng", () => {
    for (const u of CATALOG) {
      expect(u.cards.length, u.key).toBeGreaterThanOrEqual(3);
      expect(u.cards[0].kind, u.key).toBe("story");
      expect(u.cards[u.cards.length - 1].kind, u.key).toBe("finish");
    }
  });

  it("mỗi bài có mục tiêu, có số phút, và số phút vừa với trẻ nhỏ", () => {
    for (const u of CATALOG) {
      expect(u.objectives.length, u.key).toBeGreaterThan(0);
      expect(u.version, u.key).toBeGreaterThanOrEqual(1);
      expect(u.durationMinutes, u.key).toBeGreaterThan(0);
      // Trần 10 phút không phải con số tuỳ tiện: dài hơn thế thì bài học thành thứ giữ trẻ
      // ngồi trong app, đúng cái §8.3 cấm.
      expect(u.durationMinutes, u.key).toBeLessThanOrEqual(10);
    }
  });

  it("bài cho 7–8 tuổi luôn dài hơn hoặc bằng bài 5–6 của cùng chương", () => {
    for (const ch of [1, 2, 3, 4, 5, 6]) {
      const be = CATALOG.find((u) => u.chapter === ch && u.ageBand === "AGE_5_6")!;
      const lon = CATALOG.find((u) => u.chapter === ch && u.ageBand === "AGE_7_8")!;
      expect(lon.cards.length, `chương ${ch}`).toBeGreaterThanOrEqual(be.cards.length);
    }
  });

  it("⭐ thẻ dự đoán KHÔNG có đáp án đúng", () => {
    // "Ngày mai đàn có đẻ không" là một câu hỏi thật. Chấm điểm nó là dạy trẻ rằng đoán sai
    // là hỏng, trong khi điều cần dạy là: sinh vật sống thì không ai đoán chắc được (§8.2).
    for (const u of CATALOG) {
      for (const c of u.cards) {
        if (c.kind !== "predict") continue;
        for (const o of c.options) expect(o.dung, `${u.key}.${o.key}`).toBeUndefined();
      }
    }
  });

  it("thẻ quan sát có ít nhất một đáp án đúng, và giải thích cho MỌI lựa chọn", () => {
    for (const u of CATALOG) {
      for (const c of u.cards) {
        if (c.kind !== "observe") continue;
        expect(c.options.some((o) => o.dung), u.key).toBe(true);
        for (const o of c.options) {
          expect(c.explain[o.key], `${u.key}: thiếu lời giải thích cho "${o.key}"`).toBeTruthy();
        }
        // Lời giải thích cho một khoá không tồn tại là chữ chết - và là dấu hiệu ai đó vừa
        // đổi tên lựa chọn mà quên nửa còn lại.
        for (const k of Object.keys(c.explain)) {
          expect(c.options.some((o) => o.key === k), `${u.key}: thừa lời giải thích "${k}"`).toBe(true);
        }
      }
    }
  });

  it("thẻ sắp xếp có ít nhất ba bước, khoá không trùng", () => {
    for (const u of CATALOG) {
      for (const c of u.cards) {
        if (c.kind !== "sequence") continue;
        expect(c.items.length, u.key).toBeGreaterThanOrEqual(3);
        const khoa = c.items.map((i) => i.key);
        expect(new Set(khoa).size, u.key).toBe(khoa.length);
      }
    }
  });

  it("khoá lựa chọn trong một thẻ không trùng nhau", () => {
    for (const u of CATALOG) {
      for (const c of u.cards) {
        const khoa = c.kind === "observe" || c.kind === "predict" ? c.options.map((o) => o.key)
          : c.kind === "sequence" ? c.items.map((i) => i.key) : [];
        if (khoa.length) expect(new Set(khoa).size, u.key).toBe(khoa.length);
      }
    }
  });

  it("⭐ thẻ đếm chỉ nằm ở bài mà sự kiện CÓ mang con số thật", () => {
    // Thẻ đếm lấy số từ `factSnapshot.qty`. Đặt nó vào một bài mà sự kiện không mang `qty`
    // thì màn hình của bé hiện ra một ô trống - hoặc tệ hơn, một số 0.
    for (const u of CATALOG) {
      if (!u.cards.some((c) => c.kind === "count")) continue;
      const duKien = locDuKien(PAYLOAD_HOP_LE[u.eventType]);
      expect(typeof duKien.qty, `${u.key} có thẻ đếm nhưng ${u.eventType} không mang qty`).toBe("number");
    }
  });

  it("nhiệm vụ gia đình không đòi tải ảnh hay gõ chữ", () => {
    // §8.3 + §12.7: hoàn thành là một dấu tick, không phải một cái ô nhập.
    for (const u of CATALOG) {
      if (!u.familyMission) continue;
      expect(/tải lên|upload|chụp gửi|gõ vào|viết vào/i.test(u.familyMission.body), u.key).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Chọn bài
// ---------------------------------------------------------------------------

describe("chọn bài cho một sự kiện", () => {
  it("⭐ ghi lô hằng ngày KHÔNG sinh bài", () => {
    // Chủ ý, và là quyết định quan trọng nhất của Epic 4: nông dân ghi lô mỗi sáng. Mỗi lô
    // một bài nghĩa là đứa trẻ nhận cùng một bài lặp lại mỗi ngày - vừa nhàm, vừa đúng kiểu
    // "kéo trẻ vào app mỗi ngày" mà §8.3 cấm. Bài gắn với MỐC, không gắn với nhịp.
    for (const tuoi of NHOM_TUOI) {
      const k = chonDonVi("HARVEST_LOGGED", tuoi, { qty: 12 });
      expect(k.chon).toBe("bo");
      if (k.chon === "bo") expect(k.lyDo).toBe("khong-co-bai-cho-loai-nay");
    }
  });

  it("chỉ việc cho ăn / kiểm tra mới có bài, việc khác thì bỏ qua", () => {
    for (const tuoi of NHOM_TUOI) {
      for (const v of VIEC_CO_BAI) {
        expect(chonDonVi("CARE_TASK_COMPLETED", tuoi, { kind: v }).chon, v).toBe("co");
      }
      for (const v of ["DECOR", "GEAR", "FREEZE", "DELIVER", "HANDOVER", "WEIGH", "HARVEST", ""]) {
        const k = chonDonVi("CARE_TASK_COMPLETED", tuoi, { kind: v });
        expect(k.chon, v).toBe("bo");
        if (k.chon === "bo") expect(k.lyDo, v).toBe("viec-nay-chua-co-bai");
      }
    }
  });

  it("chỉ chặng úm → lớn mới có bài", () => {
    for (const tuoi of NHOM_TUOI) {
      for (const c of CHANG_CO_BAI) {
        expect(chonDonVi("FLOCK_STAGE_CHANGED", tuoi, { to: c }).chon, c).toBe("co");
      }
      for (const c of ["LAYING", "FINISHING", "END_OF_LAY", "HARVESTED", "RETIRED", ""]) {
        const k = chonDonVi("FLOCK_STAGE_CHANGED", tuoi, { to: c });
        expect(k.chon, c).toBe("bo");
        if (k.chon === "bo") expect(k.lyDo, c).toBe("chang-nay-chua-co-bai");
      }
    }
  });

  it("payload rỗng hoặc rác không làm hàm nổ", () => {
    for (const t of MOI_LOAI_SU_KIEN) {
      for (const tuoi of NHOM_TUOI) {
        expect(() => chonDonVi(t, tuoi, {})).not.toThrow();
        expect(() => chonDonVi(t, tuoi, { kind: null, to: 12 } as Record<string, unknown>)).not.toThrow();
      }
    }
  });

  it("bài chọn ra luôn đúng nhóm tuổi và đúng loại sự kiện đã hỏi", () => {
    for (const t of MOI_LOAI_SU_KIEN) {
      for (const tuoi of NHOM_TUOI) {
        const k = chonDonVi(t, tuoi, PAYLOAD_HOP_LE[t]);
        if (k.chon !== "co") continue;
        expect(k.unit.ageBand, `${t}/${tuoi}`).toBe(tuoi);
        expect(k.unit.eventType, `${t}/${tuoi}`).toBe(t);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Chụp lại nội dung và dữ kiện
// ---------------------------------------------------------------------------

describe("chụp lại (§13.3, §9.39)", () => {
  it("⭐ sửa catalog KHÔNG làm đổi bài đã sinh", () => {
    // Một đứa trẻ đang làm dở một bài mà câu chữ tự đổi dưới tay nó là hỏng lòng tin; và bản
    // ghi "bé đã học gì" cũng hết đọc được.
    const goc = CATALOG[0];
    const chup = chupNoiDung(goc);
    const the = chup.cards[0];
    if (the.kind === "story") the.title = "ĐÃ BỊ SỬA";
    const goc2 = CATALOG[0].cards[0];
    if (goc2.kind === "story") expect(goc2.title).not.toBe("ĐÃ BỊ SỬA");
  });

  it("bản chụp mang theo số phiên bản và khoá đơn vị", () => {
    for (const u of CATALOG) {
      const c = chupNoiDung(u);
      expect(c.key).toBe(u.key);
      expect(c.version).toBe(u.version);
      expect(c.cards.length).toBe(u.cards.length);
    }
  });

  it("⭐ dữ kiện chỉ nhận số, nhãn đóng và id ảnh - phần còn lại bị loại", () => {
    const ra = locDuKien({
      qty: 12, lotType: "EGG", kind: "FEED", to: "GROWING", proofMediaId: "m1",
      // Đây mới là phần quan trọng: ba thứ dưới đây đứng ngay cạnh trong dữ liệu thật.
      deliverTo: { line: "số 4 ngõ 12", phone: "09xxxxxxx" },
      note: "để cổng sau nhé",
      nickname: "Bắp",
      barnLabel: "Chuồng nhà mình",
    });
    expect(ra).toEqual({ qty: 12, lotType: "EGG", taskKind: "FEED", toStage: "GROWING", proofMediaId: "m1" });
  });

  it("dữ kiện loại chữ quá dài, mảng, đối tượng lồng và số vô nghĩa", () => {
    const dai = "E".repeat(MAX_CHU_DU_KIEN + 1);
    expect(locDuKien({ lotType: dai })).toEqual({});
    expect(locDuKien({ lotType: ["EGG"] })).toEqual({});
    expect(locDuKien({ lotType: { a: 1 } })).toEqual({});
    expect(locDuKien({ qty: NaN })).toEqual({});
    expect(locDuKien({ qty: Infinity })).toEqual({});
    expect(locDuKien({ lotType: "" })).toEqual({});
  });

  it("⭐ danh sách trường dữ kiện không chứa tên người hay chữ tự do", () => {
    const cam = ["nickname", "childid", "name", "label", "note", "text", "address", "phone", "deliverto", "workername", "barnlabel"];
    for (const t of TRUONG_DU_KIEN) expect(cam, t).not.toContain(t.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// 5. Một cửa sinh bài, và đúng một lần
// ---------------------------------------------------------------------------

describe("§9.39 - một cửa sinh bài", () => {
  it("⭐ KHÔNG file nào ngoài lib/bai-hoc.ts ghi LearningMoment / LearningEventReceipt", () => {
    const pham: string[] = [];
    for (const f of moiFileNguon()) {
      if (f === "src/lib/bai-hoc.ts") continue;
      const s = boChuThich(doc(f));
      if (/learning(Moment|EventReceipt)\.(create|update|upsert|delete)/.test(s)) pham.push(f);
    }
    expect(pham).toEqual([]);
  });

  it("⭐ KHÔNG Server Component nào gọi hàm sinh bài", () => {
    // Vẽ một trang không được ghi DB (§7.14): hai người mở cùng lúc là hai lượt sinh bài đua
    // nhau, nấp trong một lượt xem trang. Chỉ server action và việc nền được gọi.
    const duoc = ["src/app/learning-actions.ts", "src/lib/jobs.ts", "src/lib/bai-hoc.ts"];
    for (const f of moiFileNguon()) {
      if (duoc.includes(f)) continue;
      expect(boChuThich(doc(f)).includes("dungKhoanhKhac("), f).toBe(false);
    }
  });

  it("trang /gia-dinh chỉ ĐẾM, không sinh", () => {
    const trang = boChuThich(doc("src/app/gia-dinh/page.tsx"));
    expect(trang).toContain("demBaiDangCho");
    expect(trang).not.toContain("dungKhoanhKhac");
  });

  it("⭐ chốt chống nhân đôi nằm dưới DB, không ở tầng if", () => {
    for (const bang of ["model LearningMoment", "model LearningEventReceipt"]) {
      const dau = SCHEMA.indexOf(bang);
      expect(dau, bang).toBeGreaterThan(-1);
      const khoi = SCHEMA.slice(dau, SCHEMA.indexOf("\n}", dau));
      expect(khoi, bang).toContain("@@unique([childId, domainEventId])");
    }
  });

  it("bài học không bị xoá theo bảng sự kiện, nhưng đi theo hồ sơ bé", () => {
    const dau = SCHEMA.indexOf("model LearningMoment");
    const khoi = SCHEMA.slice(dau, SCHEMA.indexOf("\n}", dau));
    // `Restrict` từ DomainEvent: dọn bảng sự kiện không được làm bay nhật ký của một đứa trẻ.
    expect(khoi).toMatch(/domainEvent\s+DomainEvent\s+@relation\([^)]*onDelete:\s*Restrict/);
    // `Cascade` từ ChildProfile: xoá dữ liệu bé thì bài học đi theo - đúng hướng của §9.37.
    expect(khoi).toMatch(/child\s+ChildProfile\s+@relation\([^)]*onDelete:\s*Cascade/);
  });

  it("⭐ P2002 được coi là 'đã có', không phải lỗi", () => {
    // Hai lượt đồng bộ song song (việc nền + nút của cha mẹ) là chuyện bình thường. Coi đó là
    // lỗi thì mỗi đêm khối chẩn đoán đầy dòng đỏ về một hệ thống đang chạy đúng.
    expect(DUNG).toContain("P2002");
    expect(DUNG).toContain("laTrungKhoa");
  });

  it("⭐ hai đường ghi biên nhận, và mỗi đường dùng đúng cách của nó", () => {
    // Cố ý khác nhau, không phải thiếu nhất quán:
    //  · biên nhận "bỏ qua"/"hỏng" đứng MỘT MÌNH ⟹ `createMany({skipDuplicates})`, vì lượt
    //    đồng bộ song song đâm vào cùng khoá là chuyện thường và không có gì để quay đầu;
    //  · biên nhận "đã tạo" đi CÙNG bài học trong một transaction ⟹ `create`, vì ở đó trùng
    //    khoá **phải** kéo cả bài quay đầu - hai lượt song song thì chỉ một bên được ghi.
    const boQua = DUNG.slice(DUNG.indexOf("async function ghiBoQua"));
    expect(boQua).toContain("createMany");
    expect(boQua).toContain("skipDuplicates: true");

    const iTx = DUNG.indexOf("$transaction");
    const iCreate = DUNG.indexOf("learningEventReceipt.create({");
    expect(iTx, "phải có transaction").toBeGreaterThan(-1);
    expect(iCreate, "biên nhận 'đã tạo' phải nằm SAU chỗ mở transaction").toBeGreaterThan(iTx);
    expect(DUNG.indexOf("learningMoment.create(")).toBeGreaterThan(iTx);
  });
});

// ---------------------------------------------------------------------------
// 6. Phạm vi - không dựng lịch sử giả, không chạm con nhà khác
// ---------------------------------------------------------------------------

describe("phạm vi sinh bài (§14.4)", () => {
  it("⭐ chỉ lấy sự kiện xảy ra SAU khi gia đình nhận lời mời", () => {
    // Chuồng có thể đã nuôi cả năm trước khi gia đình tham gia. Đổ hết quá khứ đó vào nhật ký
    // của bé là dựng một lịch sử bé chưa từng sống.
    expect(DUNG).toContain("acceptedAt");
    expect(DUNG).toContain("gte: acceptedAt");
    expect(DUNG).toContain('acceptedAt: { not: null }');
  });

  it("⭐ bốn điều kiện của phạm vi đều có mặt", () => {
    expect(DUNG).toContain("unlinkedAt: null");
    expect(DUNG).toContain('child: { status: "ACTIVE"');
    expect(DUNG).toContain('status: "ACTIVE"');
    expect(DUNG).toContain("receipts: { none:");
  });

  it("cờ tổng đứng TRƯỚC mọi phép chạm DB", () => {
    for (const ham of DUNG.split("export async function ").slice(1)) {
      const iCo = ham.indexOf("batFamily()");
      const iDb = ham.indexOf("prisma.");
      if (iDb < 0) continue;
      expect(iCo, ham.slice(0, 40)).toBeGreaterThan(-1);
      expect(iDb, ham.slice(0, 40)).toBeGreaterThan(iCo);
    }
  });

  it("có trần cho mỗi bé và cho mỗi lượt chạy", () => {
    // Đàn im ắng cả tuần rồi bùng lên thì bé cũng không nhận 40 bài một lúc, và job đêm
    // không kéo dài vô hạn.
    expect(DUNG).toContain("TRAN_MOI_BE");
    expect(DUNG).toContain("TRAN_MOI_LUOT");
    expect(DUNG).toContain("take:");
  });

  it("⭐ hành động của cha mẹ KHÔNG nhận id nào từ client", () => {
    // Phạm vi là `me.id`. Không có tham số nào để bắn vào - cách rẻ nhất để một endpoint công
    // khai không bao giờ sinh bài cho con nhà người khác (§9.37).
    expect(ACTIONS).toContain("export async function dongBoKhoanhKhac(): Promise<ActionResult>");
    expect(ACTIONS).toContain("parentId: me.id");
  });

  it("hành động của cha mẹ: đăng nhập → hàng rào tần suất → mới sinh", () => {
    const than = ACTIONS.slice(ACTIONS.indexOf("async function dongBoKhoanhKhac"));
    const iMe = than.indexOf("chaMe()");
    const iNhip = than.indexOf("chanNhip");
    const iSinh = than.indexOf("dungKhoanhKhac(");
    expect(iMe).toBeGreaterThan(-1);
    expect(iNhip).toBeGreaterThan(iMe);
    expect(iSinh).toBeGreaterThan(iNhip);
  });

  it("ngăn đếm của nút đồng bộ có khai trong bảng nhịp", () => {
    expect(NHIP).toHaveProperty("dong-bo-bai-hoc");
    expect(ACTIONS).toContain('"dong-bo-bai-hoc"');
  });

  it("việc nền có gọi sinh bài, và không làm hỏng việc của nông trại", () => {
    const jobs = boChuThich(doc("src/lib/jobs.ts"));
    expect(jobs).toContain("dungKhoanhKhac()");
    // Gói trong `run(...)` = lỗi rơi vào `report.errors`, ba việc kia vẫn chạy xong.
    expect(jobs).toMatch(/run\("bai-hoc-cho-be"/);
  });
});

// ---------------------------------------------------------------------------
// 7. Đường dây
// ---------------------------------------------------------------------------

describe("đường dây", () => {
  it("phần thuần không chạm Prisma, env hay next/headers", () => {
    const than = boChuThich(META);
    expect(than).not.toContain("@/lib/db");
    expect(than).not.toContain("process.env");
    expect(than).not.toContain("next/headers");
  });

  it("⭐ catalog không import hành động của người lớn (§15.3)", () => {
    // Nội dung cho trẻ không được đứng cạnh tiền, chợ, hoá đơn hay vòng đời đàn.
    for (const cam of ["decor-actions", "market-actions", "billing-actions", "care-actions",
      "refund-actions", "harvest-actions", "@/lib/pricing", "@/lib/wallet"]) {
      expect(META, cam).not.toContain(cam);
      expect(DUNG, cam).not.toContain(cam);
    }
  });

  it("hàm sinh bài không phải server action", () => {
    // Quét bản đã bỏ chú thích: chính chú thích đầu file nhắc tới `"use server"` để nói rằng
    // nó KHÔNG có - một phép kiểm đỏ vì lý do sai là phép kiểm sẽ bị tắt.
    expect(DUNG).not.toContain('"use server"');
  });

  it("nút đồng bộ là component client và không đụng Prisma", () => {
    const nut = doc("src/components/LearningSyncButton.tsx");
    expect(nut).toContain('"use client"');
    expect(nut).not.toContain("@/lib/db");
    expect(nut).not.toContain("@/lib/bai-hoc");
  });

  it("⭐ màn chẩn đoán ở /admin không lấy dữ liệu của bé ra", () => {
    const admin = boChuThich(doc("src/app/admin/page.tsx"));
    const i = admin.indexOf("learningEventReceipt.findMany");
    expect(i).toBeGreaterThan(-1);
    const khuc = admin.slice(i, i + 500);
    for (const c of ["childId", "nickname", "child:", "factSnapshot", "contentSnapshot"]) {
      expect(khuc, c).not.toContain(c);
    }
  });
});
