// VẬN HÀNH PILOT - phần THUẦN (Epic 7 của `CHICCHIC-NEXT-PLAN-FAMILY-LEARNING.md`).
//
// ⚠️ KHÔNG import Prisma, KHÔNG `next/headers`, KHÔNG đọc `process.env`. Cùng khuôn với
// `family-gates.ts` · `de-xuat-meta.ts` · `bai-hoc-meta.ts`: luật và chữ nằm ở file thuần để
// bộ kiểm phủ được, phần chạm DB nằm ở `lib/van-hanh.ts`.
//
// Ba nhóm nội dung, ba lý do khác nhau:
//  · **Lý do tạm dừng** - chữ cha mẹ đọc khi phần học cùng con tắt đèn giữa chừng.
//  · **Nhãn chăm sóc một chạm** - thứ cô chú bấm lúc báo xong việc.
//  · **Ngưỡng pilot** - mấy con số ở §4.4 của spec, để bảng cohort đọc được chứ không chỉ đếm.

// ---------------------------------------------------------------------------
// 1. Lý do tạm dừng một suất (§22.3)
// ---------------------------------------------------------------------------

/**
 * Vì sao một suất đang tạm dừng.
 *
 * **Danh sách ĐÓNG, không có ô chữ tự do**, và không phải để cho gọn. Câu ở `choChaMe` hiện
 * thẳng trên `/gia-dinh` của một gia đình có con nhỏ; một ô chữ ở màn quản trị là đường đưa
 * chữ chưa ai đọc lại ra trước mặt họ. Đóng thì còn đếm được nữa - "pilot dừng vì cái gì"
 * chỉ trả lời được khi lý do là một trong mấy khoá này.
 *
 * ⚠️ **Không lý do nào được nói về sức khoẻ hay cái chết của con vật** (spec §18.4). Chuyện
 * đó phải đi qua luồng nông trại cho người lớn, kèm một playbook nội dung mà chuyên gia giáo
 * dục, thú y và pháp lý đã duyệt - không phải qua một dòng trạng thái.
 */
export type LyDoTamDung = {
  khoa: string;
  emoji: string;
  /** Người trực đọc lúc chọn - nói rõ khi nào dùng cái này. */
  choQuanTri: string;
  /** Cha mẹ đọc trên `/gia-dinh`. Đây mới là chữ khó viết. */
  choChaMe: string;
};

/**
 * Bốn lý do. Mỗi câu `choChaMe` đều phải trả lời được câu hỏi mà một gia đình sẽ hỏi
 * trước tiên - **"thế đàn gà của con tôi có sao không?"** - nên câu nào cũng nói tới đàn.
 */
export const LY_DO_TAM_DUNG: readonly LyDoTamDung[] = [
  {
    khoa: "NONG_TRAI_BAN",
    emoji: "🌾",
    choQuanTri: "Nông trại đang bận (mùa vụ, thiếu người) - tạm ngừng phần học ít hôm.",
    choChaMe:
      "Nông trại đang bận nên phần học cùng con tạm nghỉ ít hôm. Đàn gà vẫn được cô chú chăm mỗi ngày như thường.",
  },
  {
    khoa: "RA_SOAT_NOI_DUNG",
    emoji: "📖",
    choQuanTri: "Đang rà soát lại nội dung bài học - dừng để không gửi thêm bài mới.",
    choChaMe:
      "Chúng mình đang đọc lại nội dung dành cho bé nên tạm ngừng gửi bài mới. Đàn gà vẫn được chăm bình thường.",
  },
  {
    khoa: "GIA_DINH_XIN_NGHI",
    emoji: "🏠",
    choQuanTri: "Chính gia đình xin tạm nghỉ - dùng khoá này thay vì để họ tự rút consent.",
    choChaMe:
      "Phần học cùng con đang tạm nghỉ theo đề nghị của gia đình. Đàn gà vẫn được chăm mỗi ngày như thường - nhắn cho nông trại một câu là mình mở lại ngay.",
  },
  {
    khoa: "KY_THUAT",
    emoji: "🔧",
    choQuanTri: "Trục trặc kỹ thuật phía ChicChic - dừng để không gửi nhầm gì cho bé.",
    choChaMe:
      "Bên mình đang sửa một trục trặc kỹ thuật nên tạm ngừng phần học cùng con. Đàn gà và mọi thứ ở chuồng vẫn bình thường.",
  },
];

export function timLyDoTamDung(khoa: unknown): LyDoTamDung | null {
  if (typeof khoa !== "string" || !khoa) return null;
  return LY_DO_TAM_DUNG.find((l) => l.khoa === khoa) ?? null;
}

/**
 * Câu cha mẹ đọc khi suất đang tạm dừng.
 *
 * Khoá lạ hoặc rỗng (dữ liệu cũ, ai đó sửa tay dưới DB) vẫn phải ra **một câu tử tế** -
 * một khoảng trắng ở đúng chỗ này trông như app hỏng, và một gia đình đang không hiểu vì sao
 * con mình không vào được sẽ đọc nó theo hướng xấu nhất.
 */
export function cauTamDung(khoa: string | null | undefined): string {
  return (
    timLyDoTamDung(khoa)?.choChaMe ??
    "Phần học cùng con đang tạm nghỉ ít hôm. Đàn gà vẫn được cô chú chăm mỗi ngày như thường."
  );
}

// ---------------------------------------------------------------------------
// 2. Nhãn chăm sóc một chạm cho nông dân (§18.3 · FL-D24)
// ---------------------------------------------------------------------------

/** Loại việc mà nhãn được phép gắn vào - khớp `TaskKind` trong schema. */
export type ViecCoNhan = "FEED" | "CHECK" | "RANGE_OUT" | "RANGE_IN";

export type NhanChamSoc = {
  khoa: string;
  emoji: string;
  /** Chữ trên con chip cô chú bấm. NGẮN - ngón tay cái, ngoài nắng, một tay cầm điện thoại. */
  nhan: string;
  /**
   * Câu **thay** ghi chú mặc định khi cô chú không gõ gì.
   *
   * Đây là lý do nhãn này đáng một cái chạm: nó **bớt** việc chứ không thêm. Chủ chuồng đọc
   * được đúng thứ vừa xảy ra thay vì một câu chung chung, mà cô chú không phải gõ chữ nào.
   */
  cau: string;
  /** Nhãn này hiện ra ở những loại việc nào. */
  viec: readonly ViecCoNhan[];
};

/**
 * Năm nhãn, đúng danh sách §18.3 của spec - không thêm.
 *
 * ⚠️ **Không bắt buộc, và không được phép trở thành bắt buộc.** Mục tiêu §4 là nông dân tăng
 * tải ≤30 phút/nông trại/tuần; một trường bắt buộc trên đường "báo xong" là thứ đứng chắn
 * giữa một người đang đứng ngoài chuồng và việc họ vừa làm xong.
 *
 * Vì sao vẫn đáng có: `CHECK` gộp **ba** mong muốn khác nhau của bé (kiểm tra nước · dọn ổ
 * đẻ · chụp cận cảnh) vào cùng một loại việc, nên không có nhãn thì báo cáo pilot không phân
 * biệt nổi cô chú thật sự đã làm gì, và câu gửi về nhà cũng chung chung như nhau cả ba lần.
 */
export const NHAN_CHAM_SOC: readonly NhanChamSoc[] = [
  {
    khoa: "CHO_AN",
    emoji: "🌾",
    nhan: "Cho ăn",
    cau: "🌾 Đã cho đàn ăn xong, gửi bạn ảnh chụp lại.",
    viec: ["FEED"],
  },
  {
    khoa: "UONG_NUOC",
    emoji: "🚰",
    nhan: "Nước uống",
    cau: "🚰 Đã kiểm tra và thay nước uống cho đàn, gửi bạn ảnh chụp lại.",
    viec: ["FEED", "CHECK"],
  },
  {
    khoa: "RA_VUON",
    emoji: "🌳",
    nhan: "Ra vườn",
    cau: "🌳 Đàn đã được ra vườn chạy nhảy, gửi bạn ảnh chụp lại.",
    viec: ["RANGE_OUT", "RANGE_IN"],
  },
  {
    khoa: "KIEM_TRA_CHUONG",
    emoji: "🧹",
    nhan: "Dọn chuồng",
    cau: "🧹 Đã dọn và kiểm tra lại chuồng, gửi bạn ảnh chụp lại.",
    viec: ["CHECK"],
  },
  {
    khoa: "NHAT_TRUNG",
    emoji: "🥚",
    nhan: "Nhặt trứng",
    cau: "🥚 Đã đi nhặt trứng, gửi bạn ảnh chụp lại.",
    viec: ["FEED", "CHECK"],
  },
];

/** Những nhãn hiện ra ở một loại việc. Loại việc không có nhãn nào ⟹ mảng rỗng, không lỗi. */
export function nhanChoViec(kind: string | null | undefined): NhanChamSoc[] {
  if (typeof kind !== "string" || !kind) return [];
  return NHAN_CHAM_SOC.filter((n) => n.viec.some((v) => v === kind));
}

/**
 * Nhãn cô chú gửi lên có hợp lệ với **đúng loại việc này** không.
 *
 * ⚠️ **Không hợp lệ ⟹ BỎ NHÃN, không từ chối cả việc.** Đây là quyết định có chủ ý: người
 * đang gọi hàm này vừa đứng ngoài chuồng làm xong một việc thật và vừa chụp một tấm ảnh; từ
 * chối ghi nhận công của họ vì một con chip sai là hỏng đúng thứ quan trọng để giữ một thứ
 * chỉ để đo. Giao diện vốn chỉ bày nhãn hợp lệ, nên một khoá lệch tới đây nghĩa là ai đó bắn
 * thẳng vào endpoint (§9.6) - và cái đáng làm với nó là **lờ đi**, không phải hoảng lên.
 */
export function locNhan(kind: string | null | undefined, khoa: unknown): NhanChamSoc | null {
  if (typeof khoa !== "string" || !khoa) return null;
  return nhanChoViec(kind).find((n) => n.khoa === khoa) ?? null;
}

// ---------------------------------------------------------------------------
// 3. Ngưỡng pilot (§4.4) và cách đọc một tỉ lệ
// ---------------------------------------------------------------------------

/**
 * ⭐ **Mẫu bằng 0 ⟹ `null`, KHÔNG phải 0%.**
 *
 * Đây là lời nói dối kinh điển của mọi bảng số liệu tự làm: chưa mời gia đình nào thì bảng
 * hiện "0% kích hoạt", người đọc thấy màu đỏ và kết luận là tính năng hỏng. `null` buộc chỗ
 * vẽ phải nói "chưa đủ dữ liệu" - một câu đúng, và là câu duy nhất đúng lúc đó.
 */
export function tiLe(tu: number, mau: number): number | null {
  if (!Number.isFinite(tu) || !Number.isFinite(mau) || mau <= 0) return null;
  return Math.round((tu / mau) * 1000) / 10;
}

export type MucDat = "chua-do" | "dat" | "chua-dat";

/** So một tỉ lệ với ngưỡng. `null` (chưa đủ dữ liệu) đi thẳng thành `chua-do`. */
export function soNguong(giaTri: number | null, nguong: number): MucDat {
  if (giaTri === null) return "chua-do";
  return giaTri >= nguong ? "dat" : "chua-dat";
}

/** Ngược lại: ngưỡng dạng "không được vượt quá" (tải nông dân). */
export function soTran(giaTri: number | null, tran: number): MucDat {
  if (giaTri === null) return "chua-do";
  return giaTri <= tran ? "dat" : "chua-dat";
}

/** Ngưỡng quyết định NỘI BỘ ở §4.4 của spec - không phải benchmark thị trường. */
export const NGUONG_PILOT = {
  /** ≥60% gia đình được mời kích hoạt. */
  kichHoat: 60,
  /** ≥50% hoàn thành bài mở màn. */
  moMan: 50,
  /** ≥40% còn hoàn thành ≥1 bài/tuần ở tuần 6. */
  giuChan: 40,
  /** ≥30% hoàn thành ít nhất một việc cả nhà ngoài đời/tháng. */
  ngoaiDoi: 30,
  /** ≥50% mong muốn của bé được cha mẹ trả lời. */
  traLoi: 50,
  /** Tải nông dân **không quá** 30 phút/nông trại/tuần. */
  taiNongDanPhut: 30,
} as const;

/**
 * Số phút quy đổi cho một việc chăm sinh ra từ mong muốn của bé.
 *
 * ⚠️ **Đây là một con số ƯỚC, không phải một phép đo** - repo không bấm giờ cô chú, và sẽ
 * không bấm giờ. Nó có mặt để bảng cohort nói được "khoảng bao nhiêu phút" thay vì bắt người
 * đọc tự nhân trong đầu, và mọi chỗ vẽ nó **bắt buộc** phải ghi rõ là ước lượng. Con số thật
 * cho §4.4 phải hỏi chính cô chú ở tuần phỏng vấn (Epic 8), không lấy từ màn hình này.
 */
export const PHUT_MOI_VIEC_UOC = 5;

/** Chữ đi kèm mọi chỗ hiện số phút - để không ai đọc con số ước thành con số đo. */
export const CANH_BAO_UOC = "ước lượng, không phải số bấm giờ";

// ---------------------------------------------------------------------------
// 4. Tệp cha mẹ tải về (§17.3 mục 5)
// ---------------------------------------------------------------------------

/**
 * Chữ dẫn đặt ngay đầu tệp.
 *
 * Tệp là JSON - máy đọc được, đó là mục đích. Nhưng người mở nó gần như chắc chắn là một
 * phụ huynh bấm hai lần vào tệp vừa tải, và thứ hiện ra sẽ là một cửa sổ đầy dấu ngoặc. Mấy
 * dòng này ở đó để dòng đầu tiên họ đọc là tiếng Việt, không phải `{"xuatLuc":`.
 */
export const CHU_DAN_XUAT = [
  "Đây là toàn bộ dữ liệu ChicChic đang giữ về bé nhà bạn.",
  "Mở bằng Notepad hoặc bất cứ trình xem văn bản nào cũng đọc được.",
  "Không có gì của gia đình khác trong tệp này.",
  "Ảnh và video là của NÔNG TRẠI, không phải dữ liệu của bé - chúng ở lại chuồng và bạn xem",
  "được ở mục Nhật ký chuồng bất cứ lúc nào.",
];

/**
 * Tên tệp.
 *
 * ⚠️ **Cố ý không có tên gọi ở nhà của bé.** Tệp này rơi vào thư mục Tải về của một cái máy
 * có thể không chỉ mình cha mẹ dùng, và một tên tệp thì hiện ra trước cả khi ai đó mở nó.
 * Ngày tháng là đủ để phân biệt hai lần tải.
 */
export function tenTepXuat(luc: Date): string {
  const d = luc.toISOString().slice(0, 10);
  return `chicchic-du-lieu-cua-be-${d}.json`;
}
