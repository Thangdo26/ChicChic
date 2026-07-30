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

// Nhóm decor — dùng để chia tab ở màn "Trang trí"
export const DECOR_CATEGORIES = [
  { id: "nhan-dien", label: "Nhận diện", hint: "Cho chuồng một cái tên, một dấu ấn riêng." },
  { id: "tien-nghi", label: "Tiện nghi cho gà", hint: "Món gà thực sự dùng hằng ngày — không chỉ để đẹp." },
  { id: "cay-vuon", label: "Cây & vườn", hint: "Mảng xanh quanh chuồng, có bóng mát." },
  { id: "anh-sang", label: "Ánh sáng", hint: "Cho khung hình buổi tối ấm hơn." },
] as const;

export type DecorCategory = (typeof DECOR_CATEGORIES)[number]["id"];

// defaultX/defaultY: toạ độ gợi ý trong khung SVG 240×180 của chuồng.
// Người dùng kéo-thả đổi lại tuỳ ý ở /chuong/[id]/trang-tri.
export const DECOR_ITEMS: {
  slug: string; name: string; priceVnd: number; svgKey: string;
  category: DecorCategory; blurb: string; defaultX: number; defaultY: number; sortOrder: number;
}[] = [
  { slug: "bien-ten", name: "Biển tên chuồng", priceVnd: 45000, svgKey: "bien", category: "nhan-dien",
    blurb: "Khắc tên bạn đặt, treo trước cửa chuồng.", defaultX: 120, defaultY: 58, sortOrder: 1 },
  { slug: "bang-phan", name: "Bảng phấn ghi tên gà", priceVnd: 42000, svgKey: "bang", category: "nhan-dien",
    blurb: "Cô Lan ghi tên từng bạn gà lên bảng.", defaultX: 42, defaultY: 100, sortOrder: 2 },
  { slug: "chong-chong", name: "Chong chóng gió", priceVnd: 38000, svgKey: "chong", category: "nhan-dien",
    blurb: "Quay tít mỗi khi có gió — dễ nhận ra chuồng bạn từ xa.", defaultX: 206, defaultY: 58, sortOrder: 3 },

  { slug: "mang-theme", name: "Máng ăn theo theme", priceVnd: 35000, svgKey: "mang", category: "tien-nghi",
    blurb: "Máng ăn sơn màu riêng cho chuồng bạn.", defaultX: 138, defaultY: 152, sortOrder: 4 },
  { slug: "mang-uong", name: "Máng uống tự động", priceVnd: 40000, svgKey: "nuoc", category: "tien-nghi",
    blurb: "Nước sạch cả ngày, gà không phải chờ.", defaultX: 196, defaultY: 150, sortOrder: 5 },
  { slug: "o-de-rom", name: "Ổ đẻ lót rơm", priceVnd: 60000, svgKey: "orom", category: "tien-nghi",
    blurb: "Ổ êm, gà đẻ yên tâm — trứng ít vỡ hơn.", defaultX: 76, defaultY: 142, sortOrder: 6 },
  { slug: "cau-dau", name: "Cầu đậu tre", priceVnd: 50000, svgKey: "cau", category: "tien-nghi",
    blurb: "Gà thích đậu cao khi ngủ. Tre thật, cô Lan tự vót.", defaultX: 196, defaultY: 116, sortOrder: 7 },

  { slug: "chau-cay", name: "Chậu cây mini", priceVnd: 30000, svgKey: "cay", category: "cay-vuon",
    blurb: "Một chút xanh cạnh cửa chuồng.", defaultX: 36, defaultY: 134, sortOrder: 8 },
  { slug: "hang-rao", name: "Hàng rào gỗ nhỏ", priceVnd: 65000, svgKey: "rao", category: "cay-vuon",
    blurb: "Quây một góc vườn riêng cho đàn bạn.", defaultX: 34, defaultY: 158, sortOrder: 9 },

  { slug: "den-day", name: "Đèn dây trang trí", priceVnd: 55000, svgKey: "den", category: "anh-sang",
    blurb: "Bật lúc chạng vạng — ảnh chiều đẹp hẳn.", defaultX: 168, defaultY: 46, sortOrder: 10 },
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
