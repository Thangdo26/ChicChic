import { cache } from "react";
import { prisma } from "@/lib/db";

/**
 * "Bấm vào thì đi đâu" - một chỗ duy nhất trả lời câu đó cho mọi lời mời chào trên
 * trang chủ.
 *
 * Vấn đề nó sinh ra để giải: trang chủ hứa bốn thứ (*ảnh thật mỗi ngày · bạn tự xếp,
 * nông dân lắp thật · farm có thật · giá minh bạch*) và cả bốn **là chữ chết** - thứ
 * duy nhất bấm được là nút đăng ký. Một lời hứa không mở ra xem được thì đúng bằng
 * một lời hứa của kẻ đang đi lừa; cả định vị chống-đa-cấp của sản phẩm nằm ở chỗ mọi
 * khẳng định đều **mở ra được một trang có dữ liệu thật**.
 *
 * Ba đích đến, theo đúng thứ tự ưu tiên:
 *  1. **chuồng của chính bạn** - người đang nuôi thì mọi lối tắt phải về chuồng thật
 *     của họ, không phải về một chuồng mẫu của người khác;
 *  2. **chuồng trưng bày** (`isPublic`) - khách vãng lai và người chưa nhận chuồng;
 *  3. `null` - không có chuồng trưng bày nào (DB trống) ⟹ chỗ gọi phải tự lo, đừng
 *     dựng link chết.
 */
export type LoiVaoChuong = {
  /** Slug để dựng đường dẫn. `null` = chưa có chuồng nào mở được. */
  slug: string | null;
  /** true = chuồng của chính người đang xem (đổi cách xưng hô: "chuồng bạn" vs "xem thử"). */
  cuaToi: boolean;
};

/**
 * Chuồng trưng bày cũ nhất còn có đàn.
 *
 * `isPublic` hiện **chỉ do `prisma/seed.ts` đặt** - không một action nào trong `src/`
 * ghi vào cột đó, nên đây luôn là chuồng của nông trại chứ không phải của người dùng
 * thật. Đừng đổi điều đó mà không đọc §9.5 trước.
 */
export const chuongTrungBay = cache(async (): Promise<string | null> => {
  const b = await prisma.barn.findFirst({
    where: { isPublic: true, flock: { isNot: null } },
    orderBy: { createdAt: "asc" },
    select: { slug: true },
  });
  return b?.slug ?? null;
});

/** Chuồng để một người cụ thể bấm vào - của họ nếu có, không thì chuồng trưng bày. */
export const loiVaoChuong = cache(async (userId: string | null): Promise<LoiVaoChuong> => {
  if (userId) {
    const mine = await prisma.barn.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
      select: { slug: true },
    });
    if (mine) return { slug: mine.slug, cuaToi: true };
  }
  return { slug: await chuongTrungBay(), cuaToi: false };
});
