// MONG MUỐN CỦA BÉ - phần THUẦN (spec §12.8 · §10.4 · FL-D21..D24, Epic 6).
//
// KHÔNG import Prisma, KHÔNG đọc `process.env`, KHÔNG `next/headers`. `lib/de-xuat.ts` mới
// là nơi chạm DB. Cùng khuôn với `bai-hoc-meta.ts` ↔ `bai-hoc.ts`.
//
// ⚠️⚠️ **Ba luật của cả file này**, và cả ba đều được bộ kiểm quét mã nguồn canh:
//
//  1. **Danh sách ĐÓNG.** Bé chọn từ đây, không gõ chữ. Không có đường nào để một câu chưa
//     ai đọc đi từ màn hình của trẻ ra trước mắt người lớn (FL-D21: "không free text").
//  2. **Không một chữ nào về tiền.** Bé không biết món trang trí giá bao nhiêu, và không
//     được biết - đó là toàn bộ điểm của FL-D06: trẻ không phải một đường bán hàng vào nhà.
//     Giá, kho và thanh toán nằm ở luồng trang trí của **người lớn**, nguyên như cũ.
//  3. **Mong muốn KHÔNG phải hành động.** Một dòng trong catalog này chỉ mô tả điều bé
//     muốn; việc biến nó thành việc thật là một hành động **của cha mẹ** ở file khác, có
//     cổng quyền riêng (FL-D22).
import type { TaskKind } from "@/lib/tasks";

export type LoaiMongMuon =
  | "DECOR_WISH"
  | "CURATED_FARM_QUESTION"
  | "FAMILY_ACTIVITY_WISH"
  | "CARE_WISH";

export type TrangThaiMongMuon = "PENDING" | "REVIEWED" | "DECLINED" | "EXPIRED";

/** Việc thật sinh ra khi cha mẹ đồng ý một `CARE_WISH` (FL-D22). Chỉ `CARE_WISH` mới có. */
export type ViecCuaMongMuon = {
  kind: TaskKind;
  title: string;
  /**
   * Lời nhắn cho nông dân.
   *
   * ⚠️ **Không mang biệt danh của bé**, dù nghe ấm áp hơn hẳn. Nông dân không nằm trong
   * phạm vi consent mà cha mẹ đã ký (spec §17.2: dữ liệu trẻ chỉ đi tới cha mẹ), và một
   * cái tên đã gửi đi thì không rút lại được - kể cả sau khi cha mẹ rút lời đồng ý và xoá
   * sạch dữ liệu. "Gia đình" là đủ để cô chú hiểu vì sao có việc này.
   */
  note: string;
};

export type MongMuon = {
  /** Đi thẳng vào cột `ChildSuggestion.optionKey` - **đừng đổi chữ**, đổi là mọi dòng cũ mồ côi. */
  key: string;
  kind: LoaiMongMuon;
  emoji: string;
  /** Câu **bé** đọc trên nút bấm. Ngắn, không chữ khó, không tiền. */
  choBe: string;
  /** Câu **cha mẹ** đọc ở hàng chờ. Nói rõ chuyện gì sẽ xảy ra nếu bấm đồng ý. */
  choChaMe: string;
  /** `DECOR_WISH`: slug món thật trong `data/catalog.DECOR_ITEMS` - để lối cha mẹ bấm sang
   *  luồng trang trí có giá, có kho, có đối soát dẫn tới một món **có thật**. */
  decorSlug?: string;
  viec?: ViecCuaMongMuon;
};

/**
 * Catalog đóng.
 *
 * ⚠️ **Thêm một dòng vào đây thì phải trả lời được: "cha mẹ bấm đồng ý rồi thì SAO?"**
 * Không trả lời được nghĩa là đang thêm một cái nút không dẫn tới đâu - đúng loại nút chết
 * §9.2 cấm, và ở đây nó còn tệ hơn vì đứa trẻ đã gửi đi một điều nó thật sự mong.
 *
 * Năm mong muốn `CARE_WISH` lấy đúng danh sách khởi đầu ở FL-D21. Chúng map sang việc thật
 * của nông dân, nên **mỗi dòng thêm vào là công của một người thật** - mục tiêu §4 của spec
 * là ≤30 phút/nông trại/tuần, và trần ở `TRAN_CARE_WISH_TUAN` tồn tại vì thế.
 */
export const MONG_MUON: readonly MongMuon[] = [
  // ---- Bé mong đàn được chăm thế nào (CARE_WISH - FL-D21) ----
  {
    key: "CHO_AN_RAU", kind: "CARE_WISH", emoji: "🥬",
    choBe: "Cho các bạn gà ăn thêm rau xanh",
    choChaMe: "Bé mong cô chú cho đàn ăn thêm rau xanh.",
    viec: {
      kind: "FEED", title: "Cho đàn ăn thêm rau xanh",
      note: "Gia đình nhờ cô chú bổ sung một ít rau xanh vào cữ ăn hôm nay.",
    },
  },
  {
    key: "KIEM_TRA_NUOC", kind: "CARE_WISH", emoji: "💧",
    choBe: "Xem máng nước còn đầy không",
    choChaMe: "Bé mong cô chú ngó lại máng nước của đàn.",
    viec: {
      kind: "CHECK", title: "Ngó lại máng nước của đàn",
      note: "Gia đình nhờ cô chú kiểm tra máng nước còn đủ và sạch không.",
    },
  },
  {
    key: "DON_O_DE", kind: "CARE_WISH", emoji: "🪺",
    choBe: "Dọn lại ổ đẻ cho êm",
    choChaMe: "Bé mong cô chú dọn lại ổ đẻ cho đàn.",
    viec: {
      kind: "CHECK", title: "Dọn lại ổ đẻ cho đàn",
      note: "Gia đình nhờ cô chú thay lớp lót ổ đẻ nếu đã bẩn hoặc xẹp.",
    },
  },
  {
    key: "CHUP_CAN_CANH", kind: "CARE_WISH", emoji: "📷",
    choBe: "Chụp thật gần một bạn gà",
    choChaMe: "Bé mong có một tấm ảnh cận cảnh một bạn gà.",
    viec: {
      kind: "CHECK", title: "Chụp cận cảnh một bạn gà",
      note: "Gia đình nhờ cô chú chụp gần một con bất kỳ - thấy rõ mặt và bộ lông.",
    },
  },
  {
    key: "RA_VUON", kind: "CARE_WISH", emoji: "🌿",
    choBe: "Cho đàn ra vườn chơi",
    choChaMe: "Bé mong đàn được thả ra vườn.",
    viec: {
      kind: "RANGE_OUT", title: "Thả đàn ra vườn",
      note: "Gia đình nhờ cô chú thả đàn ra khu quây khi thời tiết cho phép.",
    },
  },

  // ---- Bé thích một món trang trí (DECOR_WISH - spec §10.4) ----
  // ⚠️ Bé **không** thấy giá, và cũng không thấy món có còn hàng hay không. Cha mẹ bấm là
  // sang đúng luồng trang trí cũ - nơi có giá, có kho, có đối soát tiền.
  {
    key: "DECOR_BIEN_TEN", kind: "DECOR_WISH", emoji: "🪧", decorSlug: "bien-ten",
    choBe: "Mình muốn chuồng có biển tên",
    choChaMe: "Bé thích có biển tên treo trước cửa chuồng.",
  },
  {
    key: "DECOR_CHAU_CAY", kind: "DECOR_WISH", emoji: "🪴", decorSlug: "chau-cay",
    choBe: "Mình muốn có chậu cây nhỏ",
    choChaMe: "Bé thích có một chậu cây cạnh cửa chuồng.",
  },
  {
    key: "DECOR_CHONG_CHONG", kind: "DECOR_WISH", emoji: "🎡", decorSlug: "chong-chong",
    choBe: "Mình muốn có chong chóng gió",
    choChaMe: "Bé thích có chong chóng gió trên nóc chuồng.",
  },
  {
    key: "DECOR_DEN_DAY", kind: "DECOR_WISH", emoji: "🏮", decorSlug: "den-day",
    choBe: "Mình muốn có đèn dây",
    choChaMe: "Bé thích có đèn dây thắp lúc chạng vạng.",
  },

  // ---- Bé muốn hỏi cô chú một câu (CURATED_FARM_QUESTION) ----
  // Câu hỏi soạn sẵn, không phải chữ bé gõ. Cha mẹ mở hộp thư của chuồng và tự hỏi -
  // app **không** tự gửi tin nào (§16.2: review không kéo theo hành động người lớn).
  {
    key: "HOI_TEN_GA", kind: "CURATED_FARM_QUESTION", emoji: "❓",
    choBe: "Các bạn gà tên là gì?",
    choChaMe: "Bé muốn hỏi cô chú: các bạn gà tên là gì?",
  },
  {
    key: "HOI_AN_GI", kind: "CURATED_FARM_QUESTION", emoji: "🌾",
    choBe: "Hôm nay các bạn gà ăn gì?",
    choChaMe: "Bé muốn hỏi cô chú: hôm nay đàn ăn gì?",
  },
  {
    key: "HOI_NGU_O_DAU", kind: "CURATED_FARM_QUESTION", emoji: "🌙",
    choBe: "Ban đêm các bạn gà ngủ ở đâu?",
    choChaMe: "Bé muốn hỏi cô chú: ban đêm đàn ngủ ở đâu?",
  },
  {
    key: "HOI_MOT_NGAY", kind: "CURATED_FARM_QUESTION", emoji: "👩‍🌾",
    choBe: "Một ngày ở nông trại có gì?",
    choChaMe: "Bé muốn hỏi cô chú: một ngày ở nông trại diễn ra thế nào?",
  },

  // ---- Bé muốn cả nhà cùng làm (FAMILY_ACTIVITY_WISH) ----
  // Những việc này xảy ra **ngoài đời**. App không có gì để làm ngoài việc chuyển lời -
  // và đó chính là điều đúng đắn nhất nó có thể làm ở đây.
  {
    key: "NHA_CUNG_NAU", kind: "FAMILY_ACTIVITY_WISH", emoji: "🍳",
    choBe: "Cả nhà cùng nấu một món có trứng",
    choChaMe: "Bé muốn cả nhà cùng nấu một món có trứng.",
  },
  {
    key: "NHA_CUNG_VE", kind: "FAMILY_ACTIVITY_WISH", emoji: "🎨",
    choBe: "Cả nhà cùng vẽ tranh đàn gà",
    choChaMe: "Bé muốn cả nhà cùng vẽ tranh về đàn gà.",
  },
  {
    key: "NHA_DI_THAM", kind: "FAMILY_ACTIVITY_WISH", emoji: "🚗",
    choBe: "Cả nhà cùng đi thăm nông trại",
    choChaMe: "Bé muốn cả nhà đi thăm nông trại một hôm nào đó.",
  },
  {
    key: "NHA_KE_CHUYEN", kind: "FAMILY_ACTIVITY_WISH", emoji: "📖",
    choBe: "Bố mẹ kể chuyện về gà trước khi ngủ",
    choChaMe: "Bé muốn nghe bố mẹ kể chuyện về gà trước khi ngủ.",
  },
];

/** Tra một mong muốn theo khoá. `null` = khoá lạ, và khoá lạ **luôn** bị từ chối (§9.6). */
export function timMongMuon(khoa: unknown): MongMuon | null {
  if (typeof khoa !== "string" || !khoa) return null;
  return MONG_MUON.find((m) => m.key === khoa) ?? null;
}

/** Nhóm theo loại, giữ đúng thứ tự khai báo - dùng để vẽ màn hình của bé. */
export function nhomMongMuon(kind: LoaiMongMuon): MongMuon[] {
  return MONG_MUON.filter((m) => m.kind === kind);
}

/** Nhãn của từng nhóm trên màn hình của bé. */
export const NHAN_NHOM: Record<LoaiMongMuon, { emoji: string; choBe: string; choChaMe: string }> = {
  CARE_WISH: { emoji: "🐔", choBe: "Mình mong cô chú…", choChaMe: "Mong muốn cho đàn" },
  DECOR_WISH: { emoji: "🎨", choBe: "Mình thích chuồng có…", choChaMe: "Món trang trí" },
  CURATED_FARM_QUESTION: { emoji: "💬", choBe: "Mình muốn hỏi…", choChaMe: "Câu hỏi cho nông trại" },
  FAMILY_ACTIVITY_WISH: { emoji: "💚", choBe: "Mình muốn cả nhà…", choChaMe: "Việc cả nhà cùng làm" },
};

/**
 * Trần số `CARE_WISH` một chuồng nhận trong 7 ngày (FL-D23).
 *
 * ⚠️ Đây **không phải** hàng rào chống lạm dụng - `lib/nhip.ts` lo việc đó. Đây là một lời
 * hứa với **nông dân**: mỗi mong muốn được duyệt là một việc thật, có người thật đi làm và
 * chụp ảnh. Ba việc thêm một tuần là đã đủ để một gia đình thấy đàn gà phản hồi lại mình,
 * và vẫn nằm trong mục tiêu ≤30 phút/nông trại/tuần ở §4 của spec.
 *
 * Đếm bằng **số dòng trong DB**, không bằng bộ đếm riêng: nó là con số thật, sống sót qua
 * mọi lần khởi động lại, và đọc lại được khi có ai hỏi "tuần này nhà tôi xin mấy việc?".
 */
export const TRAN_CARE_WISH_TUAN = 3;

/** Cửa sổ đếm của trần trên, tính bằng ngày. */
export const SO_NGAY_TUAN = 7;

/**
 * Mong muốn để quá ngần này ngày mà không ai trả lời thì việc nền tự đóng (`EXPIRED`).
 *
 * Vì sao không để nằm mãi: hàng chờ của cha mẹ dài dần lên bằng những điều bé đã quên từ
 * lâu, và một danh sách không bao giờ vơi thì người ta thôi mở nó ra. Đóng lại **không**
 * gửi thông báo nào - im lặng dọn dẹp, không phải một lời trách.
 */
export const NGAY_HET_HAN_MONG_MUON = 30;

/** Trần số mong muốn còn đang chờ của MỘT bé. Vượt thì mời bé nhắc bố mẹ, không tạo thêm. */
export const TRAN_DANG_CHO_MOI_BE = 6;
