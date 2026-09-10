import { cleanLine } from "@/lib/decor";

/** Admin chọn hình đã dựng an toàn; không nhận HTML/SVG/URL tùy ý. */
export const DECOR_TEMPLATES = [
  { key: "bien", label: "Biển tên", category: "nhan-dien" },
  { key: "bang", label: "Bảng phấn", category: "nhan-dien" },
  { key: "rao", label: "Hàng rào", category: "cay-vuon" },
  { key: "chong", label: "Chong chóng", category: "nhan-dien" },
  { key: "mang", label: "Máng ăn", category: "tien-nghi" },
  { key: "nuoc", label: "Máng uống", category: "tien-nghi" },
  { key: "orom", label: "Ổ rơm", category: "tien-nghi" },
  { key: "cau", label: "Cầu đậu", category: "tien-nghi" },
  { key: "cay", label: "Chậu cây", category: "cay-vuon" },
  { key: "den", label: "Dây đèn", category: "anh-sang" },
  { key: "tet-lantern", label: "Đèn lồng Tết", category: "le-hoi" },
  { key: "tet-blossom", label: "Chậu mai ngày Tết", category: "le-hoi" },
  { key: "noel-tree", label: "Cây thông Noel", category: "le-hoi" },
  { key: "noel-wreath", label: "Vòng lá Noel", category: "le-hoi" },
  { key: "festival-flags", label: "Dây cờ ngày hội", category: "le-hoi" },
  { key: "yem", label: "Yếm cho gà", category: "yem" },
] as const;

export type DecorCatalogInput = {
  slug: string; name: string; svgKey: string; blurb?: string;
  priceVnd: number; stockQty?: number; colorHex?: string;
  active?: boolean; expectedVersion?: number;
};

export function validateDecorCatalog(input: DecorCatalogInput) {
  const slug = String(input?.slug ?? "").trim().toLowerCase();
  const name = cleanLine(input?.name, 60);
  const blurb = cleanLine(input?.blurb, 180) || null;
  const template = DECOR_TEMPLATES.find((t) => t.key === input?.svgKey);
  if (!/^[a-z0-9][a-z0-9-]{2,59}$/.test(slug)) return { error: "Mã món cần 3–60 chữ thường, số hoặc dấu gạch ngang." } as const;
  if (!name || !template) return { error: "Nhập tên món và chọn một hình trong danh sách." } as const;
  if (!Number.isSafeInteger(input.priceVnd) || input.priceVnd < 1 || input.priceVnd > 10_000_000) return { error: "Giá phải là số nguyên từ 1 đến 10 triệu đồng." } as const;
  const stockQty = input.stockQty ?? 0;
  if (!Number.isSafeInteger(stockQty) || stockQty < 0 || stockQty > 9999) return { error: "Tồn kho phải là số nguyên từ 0 đến 9.999." } as const;
  const wearable = template.key === "yem";
  const colorHex = wearable ? String(input.colorHex ?? "").trim().toUpperCase() : null;
  if (wearable && !/^#[0-9A-F]{6}$/.test(colorHex!)) return { error: "Chọn màu yếm hợp lệ." } as const;
  if (input.active !== undefined && typeof input.active !== "boolean") return { error: "Trạng thái bán không hợp lệ." } as const;
  return { data: { slug, name, blurb, svgKey: template.key, category: template.category,
    priceVnd: input.priceVnd, stockQty, wearable, colorHex, tone: wearable ? "sang" : null,
    active: input.active ?? true } } as const;
}
