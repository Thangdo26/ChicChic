// FAMILY LEARNING - Epic 0: cờ tổng và ranh giới tầng.
//
// Đợt này chưa có route nào, chưa có bảng nào. Thứ duy nhất có thật là **một cái công
// tắc**, và một cái công tắc thì chỉ đáng tin khi biết chắc nó nghiêng về phía nào lúc
// không ai đụng tới. Repo này đã có hai tiền lệ đi hai hướng ngược nhau, đều đúng:
// `SEPAY_WEBHOOK_KEY` trống ⟹ **đóng** (§9.20), còn bộ đếm tần suất hỏng ⟹ **mở** (§9.35).
// Cờ này thuộc nhóm đầu, và bộ kiểm ở đây khoá đúng điều đó.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILY_PROGRAM_VERSION, allowedLifecycleChoices, coBatFamily } from "@/lib/family-gates";

const doc = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");

describe("cờ tổng Family Learning", () => {
  it("⭐ không đặt gì thì TẮT - hỏng thì đóng, không phải mở", () => {
    // Mở nhầm ở đây là màn hình dành cho trẻ em hiện ra khi chưa ai duyệt nội dung.
    expect(coBatFamily(undefined)).toBe(false);
    expect(coBatFamily(null)).toBe(false);
    expect(coBatFamily("")).toBe(false);
    expect(coBatFamily("   ")).toBe(false);
  });

  it("nhận đúng ba chữ bật, không đoán thêm", () => {
    for (const v of ["1", "true", "on", "TRUE", " On "]) expect(coBatFamily(v), v).toBe(true);
  });

  it("⭐ chữ lạ là TẮT, kể cả chữ nghe như đang bật", () => {
    // `"yes"` và `"enabled"` là hai chữ người ta hay gõ theo phản xạ. Đoán bừa ở đây
    // nghĩa là một hôm nào đó tính năng bật lên vì ai đó gõ nhầm - đúng kiểu sự cố
    // không ai dựng lại được.
    for (const v of ["0", "false", "off", "yes", "enabled", "bat", "no"]) {
      expect(coBatFamily(v), v).toBe(false);
    }
  });

  it("phiên bản chương trình là chuỗi không rỗng", () => {
    // Nó được chụp vào `FamilyEnrollment.programVersion`, tức là nằm vĩnh viễn trong hồ
    // sơ của một gia đình thật. Rỗng thì bản cam kết họ đã ký thành vô danh.
    expect(FAMILY_PROGRAM_VERSION.trim().length).toBeGreaterThan(0);
  });
});

describe("ranh giới tầng - đường dây", () => {
  const gates = boChuThich(doc("src/lib/family-gates.ts"));
  const family = boChuThich(doc("src/lib/family.ts"));

  it("⭐ phần thuần không đụng Prisma, không đụng next/headers, không đọc biến môi trường", () => {
    // Cùng khuôn `nhip-meta.ts` ↔ `nhip.ts`. Kéo một trong ba thứ này vào là bộ kiểm
    // một giây không chạy được nữa, và luật quyền lại rơi về chỗ không ai phủ.
    expect(gates).not.toContain("@/lib/db");
    expect(gates).not.toContain("next/headers");
    expect(gates).not.toContain("process.env");
  });

  it("⭐ cờ KHÔNG được là biến NEXT_PUBLIC_", () => {
    // Biến `NEXT_PUBLIC_*` bị nướng vào bundle lúc build: tắt tính năng mà vẫn khoe ra
    // rằng nó tồn tại và sắp có gì. Kill switch phải là quyết định của server.
    expect(family).toContain("process.env.FAMILY_LEARNING_ENABLED");
    expect(family).not.toContain("NEXT_PUBLIC_FAMILY");
  });

  it("cờ đọc mỗi lần gọi, không chụp vào hằng số ở đầu module", () => {
    // Chụp vào hằng số thì đổi biến trên Vercel phải deploy lại mới ăn - với một kill
    // switch, khoảng cách giữa "quyết định tắt" và "thật sự tắt" là thứ không nên có.
    const truocHam = family.slice(0, family.indexOf("export function batFamily"));
    expect(truocHam).not.toContain("process.env");
  });

  it("`.env.example` có khai cờ này kèm lời dặn", () => {
    // Biến môi trường không khai ở đây thì người dựng hệ thống không có cách nào biết
    // nó tồn tại - đúng cách `CRON_SECRET` từng nằm im và bốn việc nền không chạy.
    const env = doc(".env.example");
    expect(env).toContain("FAMILY_LEARNING_ENABLED");
    expect(env).toContain("NO-GO");
  });
});

// ---------------------------------------------------------------------------
// §9.36 - cam kết vòng đời của đàn gắn với gia đình
// ---------------------------------------------------------------------------

function thanHam(src: string, ten: string): string {
  const khuc = boChuThich(src).split(/(?:export )?async function /).slice(1);
  return khuc.find((k) => k.slice(0, k.indexOf("(")).trim() === ten) ?? "";
}

const DONG = ["LAYER", "BROILER"] as const;

describe("§9.36 - đàn gắn với gia đình chỉ được NGHỈ HƯU", () => {
  it("⭐ FAMILY_RETIRE_ONLY: đúng một lựa chọn, và đó là RETIRE", () => {
    // `MEAT` bị chặn vì FL-D12. `RENEW` bị chặn vì FL-D13: nhánh đó reset chính đàn ấy
    // về BROODING, tức với đứa trẻ đã đặt tên từng con thì "đàn của con" biến mất và
    // một đàn khác đứng vào chỗ cũ.
    for (const productLine of DONG) {
      const duoc = allowedLifecycleChoices({
        productLine, lifecyclePolicy: "FAMILY_RETIRE_ONLY", stage: "END_OF_LAY",
      });
      expect(duoc, productLine).toEqual(["RETIRE"]);
    }
  });

  it("STANDARD giữ nguyên ba lựa chọn cho cả hai dòng", () => {
    // Bất biến quan trọng không kém: tính năng mới **không được** đổi hành vi của những
    // chuồng không liên quan. Epic 1 của spec ghi rõ "không sửa nhánh STANDARD".
    for (const productLine of DONG) {
      const duoc = allowedLifecycleChoices({
        productLine, lifecyclePolicy: "STANDARD", stage: "END_OF_LAY",
      });
      expect(duoc.sort(), productLine).toEqual(["MEAT", "RENEW", "RETIRE"]);
    }
  });

  it("chưa tới cuối chu kỳ thì KHÔNG lựa chọn nào - kể cả chuồng thường", () => {
    for (const stage of ["BROODING", "GROWING", "LAYING", "FINISHING", "HARVESTED", "RETIRED"]) {
      expect(allowedLifecycleChoices({ productLine: "LAYER", lifecyclePolicy: "STANDARD", stage }), stage)
        .toEqual([]);
    }
  });

  it("⭐ chính sách đọc không ra thì rơi về STANDARD, không rơi về rỗng", () => {
    // Hai hướng sai đều tệ nhưng khác nhau. Rơi về rỗng nghĩa là một dòng dữ liệu lỗi làm
    // chủ chuồng **không quyết định được gì** và đàn kẹt ở END_OF_LAY vĩnh viễn - hỏng
    // im lặng, không ai báo. Rơi về STANDARD là hành vi vốn có của mọi chuồng trước đợt
    // này; đàn gắn với gia đình có cột thật trong DB (`NOT NULL DEFAULT 'STANDARD'`) nên
    // không đi qua nhánh này được.
    for (const xau of [null, undefined]) {
      expect(allowedLifecycleChoices({ productLine: "LAYER", lifecyclePolicy: xau, stage: "END_OF_LAY" }))
        .toContain("MEAT");
    }
  });
});

describe("§9.36 - đường dây: luật phải nằm ở SERVER", () => {
  const actions = doc("src/app/actions.ts");
  const than = thanHam(actions, "decideEndOfLay");

  it("thân hàm decideEndOfLay đọc được (tự kiểm)", () => {
    // Bộ đọc mã nguồn cắt hụt thì mọi phép dưới đây xanh vì lý do sai.
    expect(than).not.toBe("");
    expect(than).toContain("lifecycleDecision.create");
  });

  it("⭐ decideEndOfLay tự kiểm, không tin giao diện", () => {
    // `EndOfLayChoices` có lọc thẻ, nhưng nó là component client. `decideEndOfLay` là một
    // `"use server"` nhận `FormData` - một dòng curl là gửi được `choice=MEAT`. Chặn ở
    // màn hình mà không chặn ở đây nghĩa là cam kết đã hứa với một đứa trẻ được bảo vệ
    // bởi đúng một cái <div> không được vẽ ra.
    expect(than).toContain("allowedLifecycleChoices");
  });

  it("⭐ phép kiểm đứng TRƯỚC mọi phép ghi", () => {
    // Cùng bài học §11.50: một hàng rào đặt sau phép ghi vẫn "có mặt trong mã nguồn",
    // `tsc` vẫn xanh, và đàn gà vẫn đã vào lò mổ trước khi nó kịp nói gì.
    const iKiem = than.indexOf("allowedLifecycleChoices");
    const iGhi = than.indexOf("lifecycleDecision.create");
    expect(iKiem).toBeGreaterThan(-1);
    expect(iKiem).toBeLessThan(iGhi);
  });

  it("trang kết chu kỳ và server dùng CHUNG một hàm", () => {
    // §11.37 xảy ra vì một luật có hai bản chép tay. Ở đây có ba nơi cần cùng câu trả lời
    // (trang vẽ thẻ · action nhận lựa chọn · bộ kiểm), cả ba phải đi qua một hàm.
    const page = boChuThich(doc("src/app/chuong/[id]/ket-chu-ky/page.tsx"));
    expect(page).toContain("allowedLifecycleChoices");
    expect(page).toContain("duocChon");
  });

  it("component lọc thẻ theo đúng danh sách server đưa xuống", () => {
    const cpn = boChuThich(doc("src/components/EndOfLayChoices.tsx"));
    expect(cpn).toContain("duocChon.includes");
  });
});

describe("Epic 1 - đường mời của quản trị", () => {
  const src = doc("src/app/family-admin-actions.ts");
  const than = thanHam(src, "inviteFamilyEnrollment");

  it("thân hàm đọc được (tự kiểm)", () => {
    expect(than).not.toBe("");
    expect(than).toContain("familyEnrollment.create");
  });

  it("⭐ mời KHÔNG khoá vòng đời đàn - cam kết chỉ khoá khi cha mẹ đồng ý", () => {
    // Khoá ngay lúc mời là quyết định thay người khác về số phận một đàn gà thật, dựa
    // trên một cái bấm của người thứ ba. Việc khoá thuộc về `acceptFamilyEnrollment`
    // (Epic 2), sau khi cha mẹ đọc và đồng ý rõ ràng (spec §10.2).
    expect(than).not.toContain("flock.update");
    expect(than).not.toContain("prisma.flock");
  });

  it("⭐ cổng quyền và cờ tổng đứng TRƯỚC mọi phép tra chuồng", () => {
    const iAdmin = than.indexOf("isAdmin");
    const iCo = than.indexOf("batFamily");
    const iTra = than.indexOf("barn.findUnique");
    expect(iAdmin).toBeGreaterThan(-1);
    expect(iAdmin).toBeLessThan(iCo);
    expect(iCo).toBeLessThan(iTra);
  });

  it("chỉ mời chuồng gà đẻ, có chủ, đàn chưa khép vòng đời", () => {
    expect(than).toContain("LAYER");
    expect(than).toContain("ownerId");
    expect(than).toContain("HARVESTED");
    expect(than).toContain("RETIRED");
  });

  it("⭐ chốt 'một chuồng một suất' nằm ở DB, không ở phép tra", () => {
    // Hai người trực bấm cùng lúc là hai câu lệnh xen kẽ nhau, cả hai cùng đọc được
    // "chưa có suất nào" (§9.24). Phép tra bên trên chỉ để nói được câu tử tế.
    expect(than).toContain("barnLiveKey");
    const schema = doc("prisma/schema.prisma");
    expect(schema).toMatch(/barnLiveKey\s+String\?\s+@unique/);
  });

  it("⭐ xoá chuồng bị TỪ CHỐI khi còn suất đang sống", () => {
    // Khoá ngoại `Restrict` đã chặn ở tầng DB; đoạn này để người trực đọc được lý do
    // thay vì một dòng lỗi Prisma - cùng khuôn với phép chặn "còn đơn chợ giữ tiền".
    const xoa = thanHam(doc("src/app/admin-actions.ts"), "deleteBarn");
    expect(xoa).toContain("familyEnrollment.count");
    const iKiem = xoa.indexOf("familyEnrollment.count");
    const iXoa = xoa.indexOf("$transaction");
    expect(iKiem).toBeLessThan(iXoa);
    expect(doc("prisma/schema.prisma")).toContain("onDelete: Restrict");
  });

  it("cột chính sách trên Flock mặc định STANDARD", () => {
    // Backfill an toàn cho toàn bộ dữ liệu đang có (spec §22.1): không chuồng nào của
    // người dùng hiện tại bị đổi hành vi vì đợt này.
    expect(doc("prisma/schema.prisma"))
      .toMatch(/lifecyclePolicy\s+FlockLifecyclePolicy\s+@default\(STANDARD\)/);
  });
});
