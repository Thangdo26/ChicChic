// VÒNG ĐỜI ĐÀN — lịch nuôi và cách gọi tên từng giai đoạn.
//
// File này KHÔNG import Prisma → an toàn cho client bundle (luật import §1.2).
// Phần ghi DB nằm ở `lib/jobs.ts` (việc nền chạy theo ngày) và `worker-actions.logHarvest`.
//
// ⭐ RANH GIỚI QUAN TRỌNG NHẤT của file này:
//
//   Thứ suy được từ LỊCH  → việc nền tự đổi.   ("đàn 21 ngày tuổi thì hết úm")
//   Thứ là SỰ THẬT NGOÀI ĐỜI → phải có ảnh.    ("đàn đang đẻ")
//
// Vì vậy `plannedStage()` cố ý KHÔNG bao giờ trả về `LAYING`. Một cái nhãn "Đang đẻ"
// bật lên chỉ vì hôm nay là ngày thứ 140 là một lời khẳng định không có gì bảo chứng —
// đúng thứ §9.11 cấm. Đàn chỉ sang `LAYING` khi nông dân ghi **quả trứng đầu tiên**
// vào sổ thu hoạch, và lô đó bắt buộc có ảnh (§9.1).

export type FlockStage =
  | "BROODING"
  | "GROWING"
  | "LAYING"
  | "FINISHING"
  | "END_OF_LAY"
  | "HARVESTED"
  | "RETIRED";

export type ProductLine = "LAYER" | "BROILER";

/**
 * Tên tiếng Việt của từng giai đoạn.
 *
 * Trước đây bảng này được chép lại y hệt ở 4 trang (`/tai-khoan`, `/chuong`,
 * `/chuong/[id]/truy-xuat`, `/nong-trai/chuong/[slug]`). Chép 4 bản nghĩa là sớm muộn
 * cùng một đàn được gọi bằng hai cái tên ở hai trang.
 */
export const STAGE_VI: Record<string, string> = {
  BROODING: "Đang úm",
  GROWING: "Đang lớn",
  LAYING: "Đang đẻ",
  FINISHING: "Sắp thu hoạch",
  END_OF_LAY: "Hết chu kỳ đẻ",
  HARVESTED: "Đã thu hoạch",
  RETIRED: "Đã nghỉ hưu",
};

/** Giai đoạn đã khép lại — không có việc nền nào được đụng vào nữa. */
export const CLOSED_STAGES: FlockStage[] = ["HARVESTED", "RETIRED"];

/**
 * Số ngày úm. Gà con cần đèn sưởi ~3 tuần rồi mới chịu được nhiệt độ ngoài trời —
 * đây là lịch nuôi, không phải một khẳng định về việc ai đó đã làm gì.
 */
export const BROOD_DAYS = 21;

/**
 * Gà thịt vào giai đoạn cuối trước ngày xuất chuồng bao nhiêu ngày.
 * Mục đích là BÁO TRƯỚC: chủ chuồng thấy "sắp thu hoạch" từ trước chứ không phải
 * sáng ra thì đàn đã đi mất.
 */
export const FINISH_LEAD_DAYS = 10;

/** Tuổi đàn tính bằng ngày tròn, kể từ `startDate`. Ngày vào đàn = 0. */
export function flockAgeDays(startDate: Date | string): number {
  return Math.floor((Date.now() - new Date(startDate).getTime()) / 86_400_000);
}

/**
 * Giai đoạn mà LỊCH nói đàn này đáng lẽ đang ở — hoặc `null` nếu không cần đổi gì.
 *
 * Chỉ trả về giai đoạn khi nó **tiến lên** so với hiện tại. Không bao giờ kéo ngược:
 * một đàn đã `END_OF_LAY` mà chủ chuồng chưa quyết định thì cứ nằm đó chờ, việc nền
 * không được phép đẩy nó về `LAYING` chỉ vì phép tính ngày.
 *
 * Ba đường duy nhất:
 *   1. hết úm       → GROWING     (cả hai dòng, sau `BROOD_DAYS`)
 *   2. gà thịt      → FINISHING   (trước ngày xuất chuồng `FINISH_LEAD_DAYS` ngày)
 *   3. gà đẻ        → END_OF_LAY  (hết `cycleDays` — mở màn "kết chu kỳ")
 *
 * ⚠️ KHÔNG có đường sang `LAYING` và KHÔNG có đường sang `HARVESTED`. Cả hai là sự
 * thật ngoài đời: `LAYING` đến từ quả trứng đầu tiên có ảnh, `HARVESTED` đến từ quyết
 * định của chủ chuồng ở `/chuong/<slug>/ket-chu-ky`.
 */
export function plannedStage(f: {
  productLine: ProductLine | string;
  stage: FlockStage | string;
  startDate: Date | string;
  cycleDays: number;
}): FlockStage | null {
  const stage = f.stage as FlockStage;
  if (CLOSED_STAGES.includes(stage) || stage === "END_OF_LAY") return null;

  const age = flockAgeDays(f.startDate);
  const cycle = Math.max(1, f.cycleDays);

  if (f.productLine === "LAYER") {
    // Hết chu kỳ là một sự thật của LỊCH, không phải lời khẳng định về đàn gà — nên
    // nó đúng kể cả với đàn chưa từng đẻ quả nào (lúc đó chủ chuồng càng cần được hỏi).
    if (age >= cycle) return "END_OF_LAY";
  } else if (age >= cycle - FINISH_LEAD_DAYS && stage !== "FINISHING") {
    return "FINISHING";
  }

  if (stage === "BROODING" && age >= BROOD_DAYS) return "GROWING";
  return null;
}

/**
 * Một dòng nhật ký cho chủ chuồng đọc khi đàn sang giai đoạn mới.
 * Viết bằng giọng người, không phải bằng tên enum.
 */
export const STAGE_MILESTONE: Record<string, string> = {
  GROWING: "Đàn đã qua giai đoạn úm — bỏ đèn sưởi, các bạn gà bắt đầu lớn 🐥",
  FINISHING: "Đàn vào giai đoạn cuối, sắp tới ngày thu hoạch 🌾",
  END_OF_LAY: "Đàn đã đi hết một chu kỳ đẻ. Giờ là lúc bạn chọn chặng tiếp theo cho các bạn gà 🌾",
};
