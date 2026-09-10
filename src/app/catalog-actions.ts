"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { validateDecorCatalog, type DecorCatalogInput } from "@/lib/decor-catalog";

export async function saveDecorCatalog(input: DecorCatalogInput) {
  if (!(await isAdmin())) return { ok: false, message: "Chỉ quản trị nông trại được sửa danh mục." };
  const parsed = validateDecorCatalog(input);
  if ("error" in parsed) return { ok: false, message: parsed.error ?? "Dữ liệu món chưa hợp lệ." };
  const { stockQty, ...data } = parsed.data;
  const version = input.expectedVersion;
  if (version !== undefined && (!Number.isSafeInteger(version) || version < 0)) return { ok: false, message: "Phiên bản món không hợp lệ." };
  const changed = await prisma.$transaction(async (tx) => {
    if (version === undefined) {
      // slug ổn định là khóa retry; tạo lại không ghi đè món/tồn kho đã có.
      return (await tx.decorItem.createMany({ data: [{ ...data, stockQty }], skipDuplicates: true })).count === 1;
    }
    // Không đổi hình, màu hay loại của món đã bán: đó là nhận diện món khách đã mua.
    return (await tx.decorItem.updateMany({
      where: { slug: data.slug, version, svgKey: data.svgKey, wearable: data.wearable, colorHex: data.colorHex },
      data: { name: data.name, blurb: data.blurb, priceVnd: data.priceVnd, active: data.active, version: { increment: 1 } },
    })).count === 1;
  });
  revalidateTag("catalog");
  revalidatePath("/admin");
  return { ok: changed, message: changed ? "Đã lưu vật phẩm. Giá mới chỉ áp dụng cho đơn tạo sau đó." : "Mã món đã có hoặc dữ liệu vừa đổi. Tải lại danh mục để kiểm tra; tồn kho và đơn cũ được giữ nguyên." };
}
