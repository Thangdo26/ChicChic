// Chính sách CC-B01 dùng chung server/UI; không phụ thuộc DB.
import { allowedLifecycleChoices, type LuaChon, type ChinhSachVongDoi } from "@/lib/family-gates";
import { WEIGHT_MIN, WEIGHT_MAX } from "@/lib/harvest";

export const RETIRE_TERMS_VERSION = "retire-monthly-v1";
export const RENEW_UNAVAILABLE = "Nuôi lứa mới chưa mở. Nông trại cần lưu riêng lịch sử từng lứa trước khi nhận yêu cầu này.";
export const LIFECYCLE_STATUS_VI = {
  REQUESTED: "Đã gửi yêu cầu · chờ cô chú nhận việc",
  ACCEPTED: "Cô chú đã nhận việc · chờ minh chứng hoàn tất",
  IN_PROGRESS: "Đã ghi lô · chờ cô chú đối soát và hoàn tất",
  COMPLETED: "Đã hoàn tất, có minh chứng",
  DECLINED: "Cô chú chưa làm được",
  CANCELLED: "Bạn đã rút yêu cầu",
} as const;

export class LifecycleError extends Error {}

export function assertLifecycleChoice(flock: {
  productLine: "LAYER" | "BROILER"; lifecyclePolicy: ChinhSachVongDoi; stage: string;
}, choice: LuaChon) {
  if (!allowedLifecycleChoices(flock).includes(choice)) {
    throw new LifecycleError("Lựa chọn này không phù hợp với cam kết hoặc giai đoạn của đàn.");
  }
  if (choice === "RENEW") throw new LifecycleError(RENEW_UNAVAILABLE);
}

export function assertLifecycleCount(expectedIds: string[], currentIds: string[], confirmedCount: number) {
  if (!Number.isSafeInteger(confirmedCount) || confirmedCount <= 0 ||
      confirmedCount !== expectedIds.length || currentIds.length !== expectedIds.length ||
      new Set(expectedIds).size !== expectedIds.length ||
      currentIds.some((id) => !expectedIds.includes(id))) {
    throw new LifecycleError("Số con hoặc danh sách đàn chưa khớp yêu cầu. Kiểm tra lại đàn và báo nông trại trước khi hoàn tất.");
  }
}

export function assertLifecycleWeight(qty: number, weightKg: number | null) {
  if (weightKg === null || !Number.isFinite(weightKg) ||
      weightKg < WEIGHT_MIN * qty || weightKg > WEIGHT_MAX * qty) {
    throw new LifecycleError("Lô cần số cân hợp lệ, khớp với số con đã đối soát.");
  }
}
