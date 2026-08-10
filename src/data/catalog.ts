// Catalog dùng chung cho UI (client) và seed. Số tiền là MINH HOẠ cho PoC -
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
    story: "Đặc sản tiến vua, hiếm, có câu chuyện - hợp biếu tặng.",
    layerNote: "trứng to, quý", broilerNote: "chậm lớn, đặc sản",
  },
];

export const FEEDING_PLANS = [
  { slug: "chuan", name: "Chuẩn", ratio: "Cám nhiều", priceMultiplier: 1.0, note: "Nhanh, kinh tế", emoji: "⚡" },
  { slug: "que", name: "Quê", ratio: "20% cám : 80% ngô/thóc", priceMultiplier: 1.25, note: "Chậm hơn, 'gà thả vườn ăn ngô'", emoji: "🌾" },
  { slug: "dac-san", name: "Đặc sản", ratio: "Ngô/thóc + rau", priceMultiplier: 1.5, note: "Chậm nhất, để biếu", emoji: "✨" },
];

// Nhóm decor - dùng để chia tab ở màn "Trang trí"
export const DECOR_CATEGORIES = [
  { id: "nhan-dien", label: "Nhận diện", hint: "Cho chuồng một cái tên, một dấu ấn riêng." },
  { id: "tien-nghi", label: "Tiện nghi cho gà", hint: "Món gà thực sự dùng hằng ngày - không chỉ để đẹp." },
  { id: "cay-vuon", label: "Cây & vườn", hint: "Mảng xanh quanh chuồng, có bóng mát." },
  { id: "anh-sang", label: "Ánh sáng", hint: "Cho khung hình buổi tối ấm hơn." },
  {
    id: "yem",
    label: "Yếm cho gà",
    hint: "Mặc cho TỪNG CON - nhìn ảnh là biết ngay con nào là con Miu. Mua xong sang trang \"Đàn gà\" chọn con để mặc.",
  },
] as const;

export type DecorCategory = (typeof DECOR_CATEGORIES)[number]["id"];

// defaultX/defaultY: toạ độ gợi ý trong khung SVG 240×180 của chuồng.
// Người dùng kéo-thả đổi lại tuỳ ý ở /chuong/[id]/trang-tri.
export const DECOR_ITEMS: {
  slug: string; name: string; priceVnd: number; svgKey: string;
  category: DecorCategory; blurb: string; defaultX: number; defaultY: number; sortOrder: number;
  /** Món MẶC LÊN GÀ, không lắp vào chuồng - xem model BirdGear. */
  wearable?: boolean;
  /** Màu yếm: vẽ sprite + chấm màu cạnh tên gà. Chỉ có nghĩa khi `wearable`. */
  colorHex?: string;
  /** "sang" | "toi" - chia hai nhóm trong tab Yếm. */
  tone?: "sang" | "toi";
}[] = [
  { slug: "bien-ten", name: "Biển tên chuồng", priceVnd: 45000, svgKey: "bien", category: "nhan-dien",
    blurb: "Khắc tên bạn đặt, treo trước cửa chuồng.", defaultX: 120, defaultY: 58, sortOrder: 1 },
  { slug: "bang-phan", name: "Bảng phấn ghi tên gà", priceVnd: 42000, svgKey: "bang", category: "nhan-dien",
    blurb: "Cô Lan ghi tên từng bạn gà lên bảng.", defaultX: 42, defaultY: 100, sortOrder: 2 },
  { slug: "chong-chong", name: "Chong chóng gió", priceVnd: 38000, svgKey: "chong", category: "nhan-dien",
    blurb: "Quay tít mỗi khi có gió - dễ nhận ra chuồng bạn từ xa.", defaultX: 206, defaultY: 58, sortOrder: 3 },

  { slug: "mang-theme", name: "Máng ăn theo theme", priceVnd: 35000, svgKey: "mang", category: "tien-nghi",
    blurb: "Máng ăn sơn màu riêng cho chuồng bạn.", defaultX: 138, defaultY: 152, sortOrder: 4 },
  { slug: "mang-uong", name: "Máng uống tự động", priceVnd: 40000, svgKey: "nuoc", category: "tien-nghi",
    blurb: "Nước sạch cả ngày, gà không phải chờ.", defaultX: 196, defaultY: 150, sortOrder: 5 },
  { slug: "o-de-rom", name: "Ổ đẻ lót rơm", priceVnd: 60000, svgKey: "orom", category: "tien-nghi",
    blurb: "Ổ êm, gà đẻ yên tâm - trứng ít vỡ hơn.", defaultX: 76, defaultY: 142, sortOrder: 6 },
  { slug: "cau-dau", name: "Cầu đậu tre", priceVnd: 50000, svgKey: "cau", category: "tien-nghi",
    blurb: "Gà thích đậu cao khi ngủ. Tre thật, cô Lan tự vót.", defaultX: 196, defaultY: 116, sortOrder: 7 },

  { slug: "chau-cay", name: "Chậu cây mini", priceVnd: 30000, svgKey: "cay", category: "cay-vuon",
    blurb: "Một chút xanh cạnh cửa chuồng.", defaultX: 36, defaultY: 134, sortOrder: 8 },
  { slug: "hang-rao", name: "Hàng rào gỗ nhỏ", priceVnd: 65000, svgKey: "rao", category: "cay-vuon",
    blurb: "Quây một góc vườn riêng cho đàn bạn.", defaultX: 34, defaultY: 158, sortOrder: 9 },

  { slug: "den-day", name: "Đèn dây trang trí", priceVnd: 55000, svgKey: "den", category: "anh-sang",
    blurb: "Bật lúc chạng vạng - ảnh chiều đẹp hẳn.", defaultX: 168, defaultY: 46, sortOrder: 10 },

  // ---- Yếm cho gà ----
  // Yếm gà (chicken saddle) là món CÓ THẬT: che lưng gà mái khỏi bị trống đạp trụi
  // lông. Ở đây nó còn làm một việc nữa quan trọng hơn - cho mỗi con một dấu hiệu
  // nhận ra được trong ảnh, để cái tên chủ chuồng đặt thôi là chữ trên màn hình.
  //
  // Sáu màu này là màu TƯỢNG TRƯNG trên hệ thống; yếm thật do nông trại trang bị.
  // Chưa có màu nào ngoài đời thì nông dân bấm "không làm được" kèm lý do, chủ chuồng
  // đổi màu khác - không cần code thêm đường nào.
  //
  // defaultX/defaultY không dùng tới (yếm không nằm trên khung chuồng) nhưng vẫn phải
  // có giá trị vì cột NOT NULL, để mặc định giữa khung.
  { slug: "yem-do", name: "Yếm đỏ", priceVnd: 25000, svgKey: "yem", category: "yem",
    blurb: "Nổi nhất giữa vườn - nhìn phát ra ngay.", colorHex: "#E4572E", tone: "sang",
    defaultX: 120, defaultY: 120, sortOrder: 11, wearable: true },
  { slug: "yem-vang", name: "Yếm vàng nghệ", priceVnd: 25000, svgKey: "yem", category: "yem",
    blurb: "Sáng và ấm, ăn ảnh lúc chiều muộn.", colorHex: "#F0A202", tone: "sang",
    defaultX: 120, defaultY: 120, sortOrder: 12, wearable: true },
  { slug: "yem-xanh-ngoc", name: "Yếm xanh ngọc", priceVnd: 25000, svgKey: "yem", category: "yem",
    blurb: "Không lẫn với màu nào trong đàn.", colorHex: "#2EC4B6", tone: "sang",
    defaultX: 120, defaultY: 120, sortOrder: 13, wearable: true },

  { slug: "yem-xanh-than", name: "Yếm xanh than", priceVnd: 25000, svgKey: "yem", category: "yem",
    blurb: "Tối màu, ít lộ bẩn - hợp con hay bới đất.", colorHex: "#26415E", tone: "toi",
    defaultX: 120, defaultY: 120, sortOrder: 14, wearable: true },
  { slug: "yem-tim-than", name: "Yếm tím than", priceVnd: 25000, svgKey: "yem", category: "yem",
    blurb: "Trầm mà vẫn phân biệt được từ xa.", colorHex: "#5B3A5C", tone: "toi",
    defaultX: 120, defaultY: 120, sortOrder: 15, wearable: true },
  { slug: "yem-nau-dat", name: "Yếm nâu đất", priceVnd: 25000, svgKey: "yem", category: "yem",
    blurb: "Lẫn với sân vườn, bền màu nhất.", colorHex: "#6B4A2F", tone: "toi",
    defaultX: 120, defaultY: 120, sortOrder: 16, wearable: true },
];

export const HEALTH_PACKAGE = {
  slug: "an-tam", name: 'Gói "An tâm" sức khỏe (trả trước)', priceVnd: 40000,
  note: "Bao chi phí thuốc nếu đàn cần chữa - tránh phải quyết định lúc gà đang ốm.",
};

// Số lượng gà một chuồng nhận nuôi. Người dùng tự chọn trong khoảng này.
export const FLOCK_QTY = { min: 5, max: 10, default: 6 } as const;

// Giá NHẬN NUÔI - khách trả cho nông trại để nuôi hộ. Tính THEO ĐẦU CON, nên đổi số
// lượng là tiền đổi theo. Tách 3 phần để MINH BẠCH - điểm chống-đa-cấp.
//
// ⚠️ ĐỪNG LẪN với `MarketPrice` (giá bán lại nông sản trên chợ). Đây là giá ĐẦU VÀO,
// kia là giá ĐẦU RA - và tỉ lệ giữa hai cái quyết định sản phẩm này là dịch vụ nuôi hộ
// hay là một kênh đầu tư trá hình.
//
// Bộ số hiện tại được đặt để **thực nhận sau phí trên chợ ≈ chi phí nuôi**:
//
//   LAYER   90.000đ/mái/tháng   ~20 trứng × 5.500đ = 110.000đ, trừ phí 20% = 88.000đ
//   BROILER 218.000đ/con/lứa    1,8kg × 150.000đ  = 270.000đ, trừ phí 20% = 216.000đ
//
// Nghĩa là bán lại là cách **không phí đồ ăn khi bận**, không phải cách kiếm lời. Bộ số
// cũ (35k và 80k) làm điều ngược lại: bỏ 35k vào rút 72k ra mỗi tháng - tức là một máy
// in tiền, và là đúng thứ mà mọi trụ chống-đa-cấp của sản phẩm này được dựng để không
// phải là. Sửa `MarketPrice` mà quên sửa bảng này là mở lại đúng cái lỗ đó.
//
// Đổi bảng này KHÔNG ảnh hưởng đơn cũ: `Reservation.priceEstimateVnd` chốt lúc đặt.
export const BASE_PRICES: Record<
  ProductLine,
  { nuoi: number; cong: number; tn: number; noun: string; period: string }
> = {
  LAYER:   { nuoi: 46000,  cong: 24000, tn: 20000, noun: "mái", period: "/ tháng" },
  BROILER: { nuoi: 115000, cong: 57000, tn: 46000, noun: "con", period: "/ lứa" },
};

// Phí nuôi dưỡng khi cho gà "nghỉ hưu" - minh hoạ, minh bạch (thức ăn + công cô Lan)
export const RETIRE_CARE_VND = 60000; // /tháng

/**
 * Các khối tháng mua được cho đàn nghỉ hưu. **Trả trước, không phải hoá đơn hằng tháng.**
 *
 * Vì sao: mọi khoản tiền ở đây đi bằng chuyển khoản tay + đối soát tay. Hằng tháng nghĩa
 * là 12 lần chuyển khoản mỗi năm cho một đàn - và mỗi lần lỡ là một cuộc trò chuyện khó
 * xử về đàn gà mà người ta có tình cảm. Khối 3/6/12 tháng hợp với hạ tầng đang có.
 *
 * KHÔNG giảm giá theo khối. Bớt tiền cho người mua 12 tháng nghe thì hợp lý, nhưng nó
 * biến một lựa chọn tình cảm thành một phép tính, và đẩy người ta trả trước nhiều hơn
 * mức họ thực sự muốn cam kết cho một con vật đang sống. Giá là giá.
 */
export const CARE_MONTH_BLOCKS = [3, 6, 12] as const;
export type CareMonths = (typeof CARE_MONTH_BLOCKS)[number];
