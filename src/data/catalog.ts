// Catalog dùng chung cho UI (client) và seed. Số tiền là MINH HOẠ cho PoC —
// thay bằng unit economics thật ở lib/pricing.ts + seed.
// Type local để client bundle không phụ thuộc @prisma/client
export type ProductLine = "LAYER" | "BROILER";
export type EndOfLayChoice = "MEAT" | "RETIRE" | "RENEW";

export const BREEDS = [
  {
    slug: "ga-mia", name: "Gà Mía", layer: true, broiler: true,
    story: "Giống gà cổ truyền, hiền, dễ nuôi, thịt chắc.",
    layerNote: "~20 trứng/tháng", broilerNote: "~75 ngày",
  },
  {
    slug: "ga-dong-tao", name: "Gà Đông Tảo", layer: true, broiler: true,
    story: "Đặc sản tiến vua, hiếm, có câu chuyện — hợp biếu tặng.",
    layerNote: "trứng to, quý", broilerNote: "chậm lớn, đặc sản",
  },
];

export const FEEDING_PLANS = [
  { slug: "chuan", name: "Chuẩn", ratio: "Cám nhiều", priceMultiplier: 1.0, note: "Nhanh, kinh tế", emoji: "⚡" },
  { slug: "que", name: "Quê", ratio: "20% cám : 80% ngô/thóc", priceMultiplier: 1.25, note: "Chậm hơn, 'gà thả vườn ăn ngô'", emoji: "🌾" },
  { slug: "dac-san", name: "Đặc sản", ratio: "Ngô/thóc + rau", priceMultiplier: 1.5, note: "Chậm nhất, để biếu", emoji: "✨" },
];

export const DECOR_ITEMS = [
  { slug: "bien-ten", name: "Biển tên chuồng", priceVnd: 45000, svgKey: "bien" },
  { slug: "chau-cay", name: "Chậu cây mini", priceVnd: 30000, svgKey: "cay" },
  { slug: "den-day", name: "Đèn dây trang trí", priceVnd: 55000, svgKey: "den" },
  { slug: "mang-theme", name: "Máng ăn theo theme", priceVnd: 35000, svgKey: "mang" },
];

export const HEALTH_PACKAGE = {
  slug: "an-tam", name: 'Gói "An tâm" sức khỏe (trả trước)', priceVnd: 40000,
  note: "Bao chi phí thuốc nếu đàn cần chữa — tránh phải quyết định lúc gà đang ốm.",
};

// Giá gốc (minh hoạ). Tách 3 phần để MINH BẠCH — điểm chống-đa-cấp.
export const BASE_PRICES: Record<ProductLine, { nuoi: number; cong: number; tn: number; unit: string }> = {
  LAYER:   { nuoi: 180000, cong: 90000,  tn: 80000,  unit: "/ tháng · 10 mái" },
  BROILER: { nuoi: 250000, cong: 130000, tn: 100000, unit: "/ lứa · 6 con" },
};

// Phí nuôi dưỡng khi cho gà "nghỉ hưu" — minh hoạ, minh bạch (thức ăn + công cô Lan)
export const RETIRE_CARE_VND = 60000; // /tháng
