// VÙNG GIAO - phần chạm DB. Phép tính thuần nằm ở `lib/delivery.ts`.
//
// Cố ý KHÔNG phải `"use server"`: đây là truy vấn cho trang server component gọi rồi
// truyền xuống làm props, không phải một endpoint công khai. Mỗi `"use server"` thêm
// vào là thêm một cửa phải gác (§1.2 luật 4) - danh sách vùng giao không cần cửa riêng.
import { prisma } from "@/lib/db";
import type { VungGiao } from "@/lib/delivery";

/** Vùng đang mở, thứ tự nông trại đã xếp. Rỗng ⟹ nông trại chưa khai vùng nào. */
export function vungDangMo(): Promise<VungGiao[]> {
  return prisma.deliveryZone.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, feeVnd: true },
  });
}

/**
 * Địa chỉ của một người kèm vùng, gộp trong MỘT truy vấn.
 *
 * Trả `zone` riêng ra thay vì để lồng trong `address`: chỗ gọi luôn cần hỏi hai câu
 * khác nhau - "có địa chỉ chưa" và "vùng đó còn giao không" - và vùng có thể đã bị
 * nông trại tắt sau khi người dùng lưu địa chỉ.
 */
export async function diaChiVaVung(userId: string): Promise<{
  address: { fullName: string; phone: string; line: string; note: string | null; zoneId: string | null } | null;
  zone: VungGiao | null;
}> {
  const a = await prisma.address.findUnique({
    where: { userId },
    select: {
      fullName: true, phone: true, line: true, note: true, zoneId: true,
      zone: { select: { id: true, name: true, feeVnd: true, active: true } },
    },
  });
  if (!a) return { address: null, zone: null };
  const { zone, ...address } = a;
  // Vùng đã tắt thì coi như KHÔNG có vùng - `vuongMacGiaoHang` sẽ ra "vung-ngung-giao"
  // và người dùng đọc được đúng lý do, thay vì bị tính phí của một tuyến đã đóng.
  return { address, zone: zone?.active ? { id: zone.id, name: zone.name, feeVnd: zone.feeVnd } : null };
}
