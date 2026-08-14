// HỘP THƯ ĐI (outbox) - phần THUẦN: khoá chống trùng, danh sách trường được phép, và hàm
// dựng một dòng sự kiện từ việc vừa xảy ra ngoài đời.
//
// ⚠️ **Không import Prisma, không `next/headers`, không `process.env`.** File này phải chạy
// được trong `npm test` (không nối DB) - cùng khuôn với `family-gates.ts`, `nhip-meta.ts`.
// Phần chạm DB nằm ở `lib/su-kien.ts`.
//
// Vì sao có bảng này bên cạnh `Event` (lib/track.ts): xem chú thích dài ở `model DomainEvent`
// trong `prisma/schema.prisma`. Một câu: `Event` là đo đạc và được phép mất; `DomainEvent` là
// lời hứa với một đứa trẻ và phải xuất hiện đúng một lần.

/** Bảy việc có thật ngoài đời mà bài học của bé được sinh ra từ đó (spec §14.2). */
export type LoaiSuKien =
  | "FAMILY_ENROLLED"
  | "CARE_TASK_COMPLETED"
  | "FLOCK_STAGE_CHANGED"
  | "FIRST_EGG_RECORDED"
  | "HARVEST_LOGGED"
  | "LOT_CLAIMED"
  | "HANDOVER_COMPLETED";

export const MOI_LOAI_SU_KIEN: readonly LoaiSuKien[] = [
  "FAMILY_ENROLLED",
  "CARE_TASK_COMPLETED",
  "FLOCK_STAGE_CHANGED",
  "FIRST_EGG_RECORDED",
  "HARVEST_LOGGED",
  "LOT_CLAIMED",
  "HANDOVER_COMPLETED",
];

/** Giá trị được phép nằm trong `payload` - số, cờ, và **nhãn ngắn** (xem `MAX_CHU_PAYLOAD`). */
export type GiaTriPayload = string | number | boolean | null;

/** Một dòng `DomainEvent` đã sẵn sàng để ghi. */
export type DongSuKien = {
  type: LoaiSuKien;
  aggregateType: string;
  aggregateId: string;
  barnId: string | null;
  flockId: string | null;
  dedupeKey: string;
  schemaVersion: number;
  payload: Record<string, GiaTriPayload>;
  happenedAt: Date;
};

/**
 * Việc vừa xảy ra, mô tả bằng đúng những gì nơi phát đang cầm trong tay.
 *
 * Cố ý là một **kiểu hợp phân biệt** chứ không phải bảy hàm rời: khoá chống trùng và loại sự
 * kiện phải sinh ra cùng một chỗ, nếu không sẽ có ngày một loại mang khoá của loại khác và
 * hai việc khác nhau đè lên nhau vĩnh viễn.
 */
export type NguonSuKien =
  | {
      type: "FAMILY_ENROLLED";
      enrollmentId: string; barnId: string; flockId: string;
      programVersion: string; lifecyclePolicy: string;
    }
  | {
      type: "CARE_TASK_COMPLETED";
      taskId: string; barnId: string; flockId: string | null;
      kind: string; mediaType: string; proofMediaId: string;
      /**
       * Nhãn một chạm cô chú gắn lúc báo xong (Epic 7 · §18.3 · FL-D24), hoặc `null`.
       *
       * **Khoá đóng** trong `van-hanh-meta.NHAN_CHAM_SOC`, đã lọc ở `completeTask` - không
       * phải chữ cô chú gõ. Đây là điều kiện để nó được phép có mặt trong `payload`: chỗ này
       * chảy thẳng vào màn hình của một đứa trẻ 5 tuổi.
       */
      tag: string | null;
    }
  | {
      type: "FLOCK_STAGE_CHANGED";
      flockId: string; barnId: string;
      from: string; to: string; productLine: string;
    }
  | {
      type: "FIRST_EGG_RECORDED";
      flockId: string; barnId: string; productLine: string;
      // Số trứng của mẻ đầu tiên và tấm ảnh chụp nó. Hai thứ này ở đây vì chương 4 của
      // chương trình học đếm đúng con số đó và nhìn đúng tấm ảnh đó (spec §9) - không có
      // chúng thì bài học phải bịa ra một con số, mà bịa số cho một đứa trẻ về đàn gà của
      // chính nó là hỏng đúng cái điều sản phẩm này hứa.
      qty: number; proofMediaId: string;
    }
  | {
      type: "HARVEST_LOGGED";
      lotId: string; barnId: string; flockId: string;
      lotType: string; qty: number; weightKg: number | null; storage: string; proofMediaId: string;
    }
  | {
      type: "LOT_CLAIMED";
      lotId: string; barnId: string; flockId: string | null;
      lotType: string; qty: number;
    }
  | {
      type: "HANDOVER_COMPLETED";
      lotId: string; barnId: string; flockId: string | null;
      lotType: string; qty: number;
    };

/**
 * ⭐ TRƯỜNG DUY NHẤT ĐƯỢC PHÉP VÀO `payload`, theo từng loại (§9.38).
 *
 * Đây không phải danh sách cho gọn - nó là **hàng rào quyền riêng tư**. `payload` sẽ chảy qua
 * materializer (Epic 4) vào màn hình của một đứa trẻ 5 tuổi, nên tuyệt đối không có: dữ liệu
 * của trẻ · địa chỉ · số điện thoại · ngân hàng · tin nhắn · chữ người dùng gõ tự do.
 *
 * Muốn thêm một trường thì thêm ở ĐÂY, và bộ kiểm sẽ soi tên trường đó.
 */
export const TRUONG_PAYLOAD: Record<LoaiSuKien, readonly string[]> = {
  FAMILY_ENROLLED: ["programVersion", "lifecyclePolicy"],
  CARE_TASK_COMPLETED: ["kind", "mediaType", "proofMediaId", "tag"],
  FLOCK_STAGE_CHANGED: ["from", "to", "productLine"],
  FIRST_EGG_RECORDED: ["productLine", "qty", "proofMediaId"],
  HARVEST_LOGGED: ["lotType", "qty", "weightKg", "storage", "proofMediaId"],
  LOT_CLAIMED: ["lotType", "qty"],
  HANDOVER_COMPLETED: ["lotType", "qty"],
};

/**
 * Trần độ dài cho chữ trong `payload`.
 *
 * Mọi chuỗi hợp lệ ở đây đều là **nhãn đóng** (`EGG`, `LAYING`, `PHOTO`) hoặc một id. Một
 * chuỗi dài hơn thế gần như chắc chắn là chữ người thật gõ - ghi chú của nông dân, địa chỉ
 * giao hàng - tức đúng thứ không được đi tiếp.
 */
export const MAX_CHU_PAYLOAD = 60;

/**
 * Mẫu khoá chống trùng (spec §12.6).
 *
 * Khoá là toàn bộ cơ chế "đúng một lần": bấm lại, chạy lại việc nền, hai tab cùng gửi - tất
 * cả đều rơi vào cùng một khoá và lần sau không ghi thêm gì.
 */
export function khoaTrung(n: NguonSuKien): string {
  switch (n.type) {
    case "FAMILY_ENROLLED": return `family-enrolled:${n.enrollmentId}`;
    case "CARE_TASK_COMPLETED": return `task-done:${n.taskId}`;
    // Kèm cả chặng: một đàn đi qua nhiều chặng, mỗi chặng là một bài học khác nhau.
    case "FLOCK_STAGE_CHANGED": return `flock-stage:${n.flockId}:${n.to}`;
    case "FIRST_EGG_RECORDED": return `first-egg:${n.flockId}`;
    case "HARVEST_LOGGED": return `harvest:${n.lotId}`;
    case "LOT_CLAIMED": return `lot-claimed:${n.lotId}`;
    case "HANDOVER_COMPLETED": return `handover:${n.lotId}`;
  }
}

/** Đối tượng gốc của sự kiện: ("HarvestLot", <lotId>)… */
function goc(n: NguonSuKien): { aggregateType: string; aggregateId: string } {
  switch (n.type) {
    case "FAMILY_ENROLLED": return { aggregateType: "FamilyEnrollment", aggregateId: n.enrollmentId };
    case "CARE_TASK_COMPLETED": return { aggregateType: "BarnTask", aggregateId: n.taskId };
    case "FLOCK_STAGE_CHANGED":
    case "FIRST_EGG_RECORDED": return { aggregateType: "Flock", aggregateId: n.flockId };
    case "HARVEST_LOGGED":
    case "LOT_CLAIMED":
    case "HANDOVER_COMPLETED": return { aggregateType: "HarvestLot", aggregateId: n.lotId };
  }
}

/**
 * Lọc `payload` xuống đúng những gì được phép.
 *
 * ⚠️ **LOẠI BỎ, không ném lỗi.** Cân nhắc có thật ở đây: hàm này chạy bên trong transaction
 * của nông dân, nên ném lỗi nghĩa là một cái tên trường gõ sai làm **quay đầu việc đã làm
 * ngoài đời**. Còn bỏ đi thì hậu quả xấu nhất là bài học của bé thiếu một dữ kiện - sửa
 * được, và bộ kiểm sẽ bắt chuyện đó ở lần chạy tiếp theo.
 *
 * Hướng của hai kiểu hỏng không cân nhau: một dữ kiện thiếu thì vá; một địa chỉ nhà đã hiện
 * lên trong màn hình của trẻ thì không lấy lại được.
 */
export function locPayload(type: LoaiSuKien, tho: Record<string, unknown>): Record<string, GiaTriPayload> {
  const duoc = TRUONG_PAYLOAD[type];
  const ra: Record<string, GiaTriPayload> = {};
  for (const [k, v] of Object.entries(tho)) {
    if (!duoc.includes(k)) continue;
    if (v === null) { ra[k] = null; continue; }
    if (typeof v === "number") { ra[k] = Number.isFinite(v) ? v : null; continue; }
    if (typeof v === "boolean") { ra[k] = v; continue; }
    if (typeof v === "string") { if (v.length <= MAX_CHU_PAYLOAD) ra[k] = v; continue; }
    // Mảng, đối tượng lồng, Date… - không có loại nào trong bảy sự kiện cần tới, và một
    // đối tượng lồng là chỗ dữ liệu cấm hay đi nhờ nhất.
  }
  return ra;
}

/** Dựng dòng sẵn sàng ghi. `happenedAt` là lúc việc xảy ra NGOÀI ĐỜI, do nơi phát truyền vào. */
export function dungSuKien(n: NguonSuKien, happenedAt: Date): DongSuKien {
  const { aggregateType, aggregateId } = goc(n);
  // Bỏ mấy trường định danh ra khỏi phần thân: chúng đã nằm ở cột riêng, và nhân bản chúng
  // vào `payload` chỉ tạo thêm một chỗ để lệch nhau.
  const { type, barnId, flockId, ...phanConLai } = n as NguonSuKien & Record<string, unknown>;
  return {
    type,
    aggregateType,
    aggregateId,
    barnId: (barnId as string | null) ?? null,
    flockId: (flockId as string | null) ?? null,
    dedupeKey: khoaTrung(n),
    schemaVersion: 1,
    payload: locPayload(type, phanConLai),
    happenedAt,
  };
}
