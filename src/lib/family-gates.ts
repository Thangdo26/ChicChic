// FAMILY LEARNING - phần quyết định THUẦN (Epic 0 của `CHICCHIC-NEXT-PLAN-FAMILY-LEARNING.md`).
//
// KHÔNG import Prisma, KHÔNG import `next/headers`, KHÔNG đọc `process.env` ở đây.
// Cùng khuôn với `lib/gates.ts` ↔ `lib/admin.ts`: luật nằm ở file thuần để bộ kiểm phủ
// được, còn việc đi lấy ba thứ nó cần (header, biến môi trường, phiên) nằm ở file gọi.
// `lib/family.ts` mới là nơi đọc biến môi trường và đọc/ghi DB.
//
// Vì sao tách: cổng quyền của repo này đã một lần rò đúng vì luật bị **chép tay hai bản**
// (§11.37 - `canViewBarn` và `barnViewer`). Family Learning sẽ có nhiều cổng hơn thế
// (cha mẹ · trẻ · consent · enrollment · cờ tính năng), nên mỗi luật chỉ được có một bản.

/**
 * Family Learning đã được bật chưa.
 *
 * ⚠️ **HỎNG THÌ ĐÓNG, không phải mở** - ngược hẳn với `lib/nhip.ts` (§9.35), và ngược
 * có lý do: bộ đếm tần suất hỏng thì thiệt hại là vài lượt gọi thừa, còn tính năng này
 * mở nhầm là **màn hình dành cho trẻ em hiện ra khi chưa ai duyệt nội dung**. Danh sách
 * NO-GO ở §23 của spec tồn tại chính vì thế.
 *
 * Cố ý **không có ngoại lệ cho dev** (khác `laQuanTri`, nơi dev được đi qua cho tiện
 * thao tác): bật ở máy chỉ tốn một dòng trong `.env`, còn một nhánh "dev thì mở" là thứ
 * sớm muộn cũng theo code lên production dưới dạng một điều kiện ai đó đọc nhầm.
 *
 * Nhận đúng ba chữ để không ai phải đoán: `1`, `true`, `on`. Mọi thứ khác - kể cả chuỗi
 * rỗng, `"false"`, hay `"YES"` - đều là **tắt**.
 */
export function coBatFamily(raw: string | undefined | null): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/**
 * Phiên bản chương trình, chụp vào `FamilyEnrollment.programVersion` lúc cha mẹ nhận lời
 * mời (§12.4 của spec).
 *
 * Đây **không** phải số phiên bản của nội dung bài học (cái đó là `LearningUnit.version`,
 * chụp riêng vào từng `LearningMoment`). Cái này trả lời một câu khác: *"gia đình này
 * tham gia theo bản cam kết nào"* - đổi luật vòng đời hay phạm vi dữ liệu trẻ thì tăng
 * số ở đây, và những gia đình đã ký bản cũ vẫn đọc được đúng thứ họ đã đồng ý.
 */
export const FAMILY_PROGRAM_VERSION = "1.1";

// ---------------- Vòng đời đàn ----------------

export type LuaChon = "MEAT" | "RETIRE" | "RENEW";
export type ChinhSachVongDoi = "STANDARD" | "FAMILY_RETIRE_ONLY";

/**
 * Đàn này được chọn những gì ở màn kết chu kỳ.
 *
 * **Một luật, một chỗ** - đây là bài học §11.37: `canViewBarn` và `barnViewer` từng là hai
 * bản chép tay của cùng một luật, và cái rò nằm đúng ở chỗ hai bản lệch nhau. Ở đây có ba
 * nơi cần cùng một câu trả lời (giao diện vẽ mấy thẻ · `decideEndOfLay` nhận cái gì · bộ
 * kiểm), nên cả ba gọi vào hàm này.
 *
 * ⚠️ **Giao diện lọc thẻ chỉ là mỹ quan.** `decideEndOfLay` là một `"use server"`, tức là
 * một endpoint công khai (§1.2 luật 4) - ai cũng bắn thẳng `choice=MEAT` vào được. Luật
 * thật nằm ở lời gọi trong action, không nằm ở việc thẻ có được vẽ ra hay không.
 *
 * `productLine` nhận vào nhưng **hiện chưa tách nhánh**: ba lựa chọn giống nhau cho cả gà
 * đẻ lẫn gà thịt, chỉ khác *cách gọi* (`lib/flock.stageLabel`, `EndOfLayChoices.optionsFor`).
 * Giữ tham số vì spec §15.2 khai như vậy và vì nếu có ngày một dòng bị cắt bớt lựa chọn
 * thì đây là chỗ duy nhất phải sửa.
 */
export function allowedLifecycleChoices(input: {
  productLine: "LAYER" | "BROILER";
  lifecyclePolicy: ChinhSachVongDoi | null | undefined;
  stage: string | null | undefined;
}): LuaChon[] {
  // Chưa tới cuối chu kỳ thì không có lựa chọn nào - cùng chốt `decideEndOfLay` đang có.
  if (input.stage !== "END_OF_LAY") return [];

  // Đàn đang đồng hành cùng một gia đình: **chỉ nghỉ hưu**.
  //
  // Đây là chỗ duy nhất trong repo mà một cam kết đã hứa với một đứa trẻ được cưỡng chế
  // bằng code. `MEAT` bị chặn vì FL-D12; `RENEW` bị chặn vì FL-D13 - nhánh đó reset chính
  // đàn đó về `BROODING`, tức là với đứa trẻ đã đặt tên từng con thì "đàn của con" biến
  // mất và một đàn khác đứng vào chỗ cũ, không ai giải thích nổi.
  if (input.lifecyclePolicy === "FAMILY_RETIRE_ONLY") return ["RETIRE"];

  return ["MEAT", "RETIRE", "RENEW"];
}
