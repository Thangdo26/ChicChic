// HỘP THƯ ĐI (outbox) - phần chạm DB và môi trường.
//
// ⚠️ **CHỈ SERVER**, và **không phải server action** (không có `"use server"`): giống
// `lib/family.ts`, nó tin dữ liệu đưa vào và chỉ được gọi từ chỗ đã kiểm quyền xong.
//
// ⭐ **ĐÂY LÀ ĐƯỜNG DUY NHẤT GHI `DomainEvent`** (§9.38). Không nơi nào khác được gọi
// `prisma.domainEvent.create*` - toàn bộ luật chống trùng, hàng rào quyền riêng tư và cái
// cầu dao đều nằm ở đây, nên một đường ghi thứ hai là mất cả ba cùng lúc.
import type { Prisma } from "@prisma/client";
import { batFamily } from "@/lib/family";
import { dungSuKien, type NguonSuKien } from "@/lib/su-kien-meta";

/**
 * Nơi ghi: **client trong transaction** của nghiệp vụ (`tx`), hoặc `prisma` khi nguồn không
 * có transaction để bám vào (chỉ `advanceFlocks` - xem chú thích ở đó).
 */
export type NoiGhi = Pick<Prisma.TransactionClient, "domainEvent">;

/**
 * Ghi một sự kiện nghiệp vụ, **trong cùng transaction với việc thật** (spec §14.3).
 *
 * Hai điều đáng nhớ khi đọc hàm này:
 *
 * ① **`createMany({ skipDuplicates: true })`, không phải `create`.** Postgres làm hỏng cả
 *    transaction đang mở khi gặp lỗi khoá trùng, nên kiểu "cứ ghi rồi bắt P2002" sẽ kéo theo
 *    việc của nông dân quay đầu ở câu lệnh kế tiếp. `ON CONFLICT DO NOTHING` thì lần thử lại
 *    lặng lẽ không ghi gì - đúng nghĩa "đây là một lần retry hợp lệ, không phải việc mới".
 *
 * ② **Cờ tắt ⟹ không ghi gì.** Cầu dao của cả chương trình (§22.3 của spec) phải cắt được
 *    tận gốc: lõi nông trại không gánh thêm một phép ghi nào cho một tính năng đang tắt.
 *    Hệ quả đã cân nhắc: việc xảy ra trong lúc cờ tắt **không** sinh sự kiện, nên sau này bật
 *    lại sẽ không có bài học cho quãng đó. Chấp nhận được - materializer vốn chỉ lấy sự kiện
 *    **sau `acceptedAt`** (§14.4), và dựng lịch sử giả cho một đứa trẻ còn tệ hơn là thiếu.
 */
export async function ghiSuKien(noi: NoiGhi, n: NguonSuKien, happenedAt: Date): Promise<void> {
  if (!batFamily()) return;
  await noi.domainEvent.createMany({ data: [dungSuKien(n, happenedAt)], skipDuplicates: true });
}

/**
 * Ghi nhiều sự kiện trong MỘT câu lệnh.
 *
 * Dùng khi một hành động đóng nhiều đối tượng cùng lúc (một chuyến giao trả nhiều lô, một
 * lượt việc nền đẩy nhiều đàn). DB nằm ở xa: mỗi câu lệnh là một lượt đi–về, và một vòng lặp
 * `await` bên trong transaction là cách chắc chắn nhất để giữ khoá lâu hơn cần thiết (§11.31).
 */
export async function ghiNhieuSuKien(noi: NoiGhi, ds: NguonSuKien[], happenedAt: Date): Promise<void> {
  if (!batFamily() || ds.length === 0) return;
  await noi.domainEvent.createMany({
    data: ds.map((n) => dungSuKien(n, happenedAt)),
    skipDuplicates: true,
  });
}
