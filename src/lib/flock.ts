// VÒNG ĐỜI ĐÀN - lịch nuôi và cách gọi tên từng giai đoạn.
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
// bật lên chỉ vì hôm nay là ngày thứ 140 là một lời khẳng định không có gì bảo chứng -
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
 *
 * ⚠️ Có `productLine` trong tay thì dùng `stageLabel()` chứ đừng tra thẳng bảng này -
 * xem chú thích ở đó.
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

/**
 * Tên giai đoạn ĐÚNG THEO DÒNG SẢN PHẨM.
 *
 * `FlockStage.END_OF_LAY` mang nghĩa *"hết chu kỳ, đang chờ chủ chuồng quyết định"* và
 * dùng cho **cả hai dòng** - nhưng chữ trên màn hình thì không được dùng chung: gọi một
 * lứa gà thịt là *"hết chu kỳ đẻ"* là nói sai về chính con vật người ta đang nuôi.
 *
 * Vì sao không thêm một giá trị enum riêng cho gà thịt: hai giá trị mang **cùng một ý
 * nghĩa nghiệp vụ** (mở màn `/ket-chu-ky`) sẽ bắt mọi câu truy vấn, mọi guard và mọi
 * việc nền phải nhớ kiểm cả hai - quên một chỗ là một dòng chuồng im lặng không bao giờ
 * được hỏi. Khác biệt ở đây thuần tuý là **cách gọi**, nên nó nằm ở tầng chữ.
 */
export function stageLabel(stage: FlockStage | string, productLine?: ProductLine | string | null): string {
  if (productLine === "BROILER") {
    if (stage === "END_OF_LAY") return "Hết lứa";
    if (stage === "HARVESTED") return "Đã xuất chuồng";
  }
  return STAGE_VI[stage] ?? String(stage);
}

/** Giai đoạn đã khép lại - không có việc nền nào được đụng vào nữa. */
export const CLOSED_STAGES: FlockStage[] = ["HARVESTED", "RETIRED"];

/**
 * Số ngày úm. Gà con cần đèn sưởi ~3 tuần rồi mới chịu được nhiệt độ ngoài trời -
 * đây là lịch nuôi, không phải một khẳng định về việc ai đó đã làm gì.
 */
export const BROOD_DAYS = 21;

/**
 * Gà thịt vào giai đoạn cuối trước ngày xuất chuồng bao nhiêu ngày.
 * Mục đích là BÁO TRƯỚC: chủ chuồng thấy "sắp thu hoạch" từ trước chứ không phải
 * sáng ra thì đàn đã đi mất.
 */
export const FINISH_LEAD_DAYS = 10;

/**
 * Đàn nằm ở `END_OF_LAY` bao nhiêu ngày rồi mà chủ chuồng chưa quyết định thì việc nền
 * nhắc một lần. Chọn 5 ngày: đủ để người ta suy nghĩ xong một quyết định không dễ
 * (mổ thịt / cho nghỉ hưu), chưa tới mức để đàn gà thật nằm chờ quá lâu.
 */
export const ENDOFLAY_NUDGE_DAYS = 5;

/** Tuổi đàn tính bằng ngày tròn, kể từ `startDate`. Ngày vào đàn = 0. */
export function flockAgeDays(startDate: Date | string): number {
  return Math.floor((Date.now() - new Date(startDate).getTime()) / 86_400_000);
}

/**
 * Đàn đã hết chu kỳ được bao nhiêu ngày.
 *
 * Suy từ `startDate + cycleDays` chứ không đọc một cột "ngày sang END_OF_LAY" - repo cố
 * ý không lưu mốc đổi giai đoạn (cùng lý do với hạn giữ hộ ở `lib/harvest`: lưu thành
 * cột thì sớm muộn có dòng lệch với `startDate` và lúc đó không biết tin cột nào).
 *
 * ⚠️ Đàn được admin đặt tay sang `END_OF_LAY` bằng nút dev `setEndOfLay` sẽ ra số lệch -
 * chấp nhận được, vì con số này chỉ dùng để quyết định có nhắc hay không.
 */
export function daysSinceCycleEnd(f: { startDate: Date | string; cycleDays: number }): number {
  return flockAgeDays(f.startDate) - Math.max(1, f.cycleDays);
}

/**
 * Giai đoạn mà LỊCH nói đàn này đáng lẽ đang ở - hoặc `null` nếu không cần đổi gì.
 *
 * Chỉ trả về giai đoạn khi nó **tiến lên** so với hiện tại. Không bao giờ kéo ngược:
 * một đàn đã `END_OF_LAY` mà chủ chuồng chưa quyết định thì cứ nằm đó chờ, việc nền
 * không được phép đẩy nó về `LAYING` chỉ vì phép tính ngày.
 *
 * Bốn đường duy nhất:
 *   1. hết úm       → GROWING     (cả hai dòng, sau `BROOD_DAYS`)
 *   2. gà thịt      → FINISHING   (trước ngày xuất chuồng `FINISH_LEAD_DAYS` ngày)
 *   3. gà thịt      → END_OF_LAY  (tới ngày xuất chuồng - mở màn "kết lứa")
 *   4. gà đẻ        → END_OF_LAY  (hết `cycleDays` - mở màn "kết chu kỳ đẻ")
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

  // Hết chu kỳ là một sự thật của LỊCH, không phải lời khẳng định về đàn gà - nên nó
  // đúng cho cả hai dòng, và đúng kể cả với đàn gà đẻ chưa từng đẻ quả nào (lúc đó chủ
  // chuồng càng cần được hỏi).
  if (age >= cycle) return "END_OF_LAY";

  if (f.productLine === "BROILER" && age >= cycle - FINISH_LEAD_DAYS && stage !== "FINISHING") {
    return "FINISHING";
  }
  if (stage === "BROODING" && age >= BROOD_DAYS) return "GROWING";
  return null;
}

/**
 * Một dòng nhật ký cho chủ chuồng đọc khi đàn sang giai đoạn mới.
 * Viết bằng giọng người, không phải bằng tên enum - và đúng theo dòng sản phẩm.
 */
export function stageMilestone(stage: FlockStage | string, productLine: ProductLine | string): string | null {
  const broiler = productLine === "BROILER";
  if (stage === "GROWING") return "Đàn đã qua giai đoạn úm - bỏ đèn sưởi, các bạn gà bắt đầu lớn 🐥";
  if (stage === "FINISHING") return "Đàn vào giai đoạn cuối, sắp tới ngày xuất chuồng 🌾";
  if (stage === "END_OF_LAY") {
    return broiler
      ? "Đàn đã tới ngày xuất chuồng. Giờ là lúc bạn chọn chặng tiếp theo cho các bạn gà 🌾"
      : "Đàn đã đi hết một chu kỳ đẻ. Giờ là lúc bạn chọn chặng tiếp theo cho các bạn gà 🌾";
  }
  return null;
}
