// Nhật ký nông trại — cửa duy nhất để đóng dấu tên nông dân lên một dòng `FarmUpdate`.
//
// Tách khỏi actions.ts vì `lib/payments.ts` cũng cần ghi nhật ký ("đã nhận cọc"),
// mà một file "use server" thì không import ngược vào lib được. Không có "use server"
// ở đây (giống notify.ts / task-store.ts): hàm này TIN dữ liệu đưa vào, chỉ được gọi
// từ chỗ đã kiểm quyền xong.
import { prisma } from "@/lib/db";

export const UPDATE_KINDS = [
  "NOTE", "PHOTO", "VIDEO", "CARE", "HEALTH", "DECOR", "MILESTONE", "RANGE",
] as const;
export type UpdateKind = (typeof UPDATE_KINDS)[number];

/** Ép một chuỗi bất kỳ về một loại hợp lệ — mặc định NOTE. */
export const asUpdateKind = (raw: string): UpdateKind =>
  (UPDATE_KINDS as readonly string[]).includes(raw) ? (raw as UpdateKind) : "NOTE";

/**
 * Đóng dấu tên nông dân lên nhật ký của chuồng.
 * Bỏ qua nếu vừa đăng đúng nội dung đó trong 60 giây (chống double-submit), và bỏ qua
 * nếu chuồng chưa có nông dân — nhật ký không có tên người thì mất luôn ý nghĩa.
 */
export async function stamp(
  barnId: string,
  workerId: string | null,
  kind: UpdateKind,
  text: string,
): Promise<void> {
  if (!workerId) return;
  const dup = await prisma.farmUpdate.findFirst({
    where: { barnId, text, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (dup) return;
  await prisma.farmUpdate.create({ data: { barnId, workerId, kind, text } });
}
