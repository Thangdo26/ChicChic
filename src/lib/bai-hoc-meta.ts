// CHƯƠNG TRÌNH HỌC - phần THUẦN: sáu chương nội dung, luật chọn bài, và hàng rào nội dung.
//
// ⚠️ **Không import Prisma, không `next/headers`, không `process.env`.** Cùng khuôn với
// `family-gates.ts` và `su-kien-meta.ts`. Phần chạm DB nằm ở `lib/bai-hoc.ts`.
//
// ⚠️⚠️ **NỘI DUNG DƯỚI ĐÂY CHƯA ĐƯỢC CHUYÊN GIA GIÁO DỤC DUYỆT.** Đó là một mục NO-GO của
// spec (§23), và không phải thứ code làm thay được. Nó đủ đúng về *cấu trúc* - bốn cơ chế
// được phép, không cơ chế nào bị cấm, không con số bịa - nhưng câu chữ cho một đứa trẻ 5 tuổi
// thì phải có người biết nghề đọc trước khi mời gia đình thật. Sửa nội dung ⟹ **tăng
// `version`** của đúng đơn vị đó, đừng sửa lặng lẽ (§13.3 của spec).
//
// ⚠️ **Không làm CMS** (§13.1): catalog là code, có kiểu, và bộ kiểm đọc được. Nội dung tự do
// từ một cái bảng quản trị nghĩa là không ai đảm bảo được điều gì về thứ hiện trên màn hình
// của trẻ.
import type { NhomTuoi } from "@/lib/family-gates";
import type { LoaiSuKien } from "@/lib/su-kien-meta";

// ---------------------------------------------------------------------------
// Hình dạng của một bài
// ---------------------------------------------------------------------------

/**
 * Một lựa chọn **đóng**. Trẻ chỉ bấm, không bao giờ gõ.
 *
 * `dung` cố ý là tuỳ chọn: thẻ *dự đoán* không có đáp án đúng - "ngày mai có trứng không"
 * là một câu hỏi thật, và chấm điểm nó là dạy sai (§8.2).
 */
export type LuaChonDong = { key: string; label: string; dung?: boolean };

/** Nhiệm vụ làm CÙNG cha mẹ - không upload, không ghi gì ngoài một dấu đã xong. */
export type NhiemVuGiaDinh = { key: string; title: string; body: string };

/**
 * Bốn cơ chế được phép (§8.1) + hai thẻ khung (`story`, `finish`). Không có thẻ nào cho
 * điểm số, đếm ngày liên tiếp, hay hộp quà - xem `CO_CHE_BI_CAM` ở cuối file.
 */
export type TheHoc =
  | { kind: "story"; title: string; body: string; media: "EVENT_PROOF" | "NONE" }
  | { kind: "observe"; prompt: string; options: LuaChonDong[]; explain: Record<string, string> }
  | { kind: "predict"; prompt: string; options: LuaChonDong[] }
  | { kind: "sequence"; prompt: string; items: LuaChonDong[] }
  | { kind: "count"; prompt: string; source: "HARVEST_QTY"; variant: "COUNT" | "GROUP_5" | "GROUP_10" | "SHARE" }
  | { kind: "finish"; message: string; achievementKey?: string };

export type DonViHoc = {
  key: string;
  /** Sửa nội dung có nghĩa ⟹ tăng số này. Bài đã sinh giữ bản cũ (§13.3). */
  version: number;
  ageBand: NhomTuoi;
  eventType: LoaiSuKien;
  chapter: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  objectives: string[];
  /**
   * `CAREGIVER_CONTEXT` = bài đụng tới bệnh/chết/vòng đời khép lại, phải có cha mẹ ngồi cạnh
   * **và** phải có chuyên gia duyệt riêng (§13.2). MVP **không có bài nào** loại này, và bộ
   * kiểm chốt điều đó - thêm một bài như vậy là một quyết định, không phải một dòng code.
   */
  sensitivity: "NORMAL" | "CAREGIVER_CONTEXT";
  durationMinutes: number;
  cards: TheHoc[];
  familyMission?: NhiemVuGiaDinh;
};

// ---------------------------------------------------------------------------
// Sáu chương (spec §9)
// ---------------------------------------------------------------------------

const CH1_5_6: DonViHoc = {
  key: "ch1-gap-nguoi-cham-5-6",
  version: 1,
  ageBand: "AGE_5_6",
  eventType: "FAMILY_ENROLLED",
  chapter: 1,
  title: "Chào chuồng gà của mình",
  objectives: ["Biết đàn gà là thật và có một người thật chăm nó mỗi ngày"],
  sensitivity: "NORMAL",
  durationMinutes: 4,
  cards: [
    {
      kind: "story",
      title: "Từ hôm nay, mình có một chuồng gà để ghé thăm",
      body: "Ở nông trại có một đàn gà thật. Mỗi ngày có một cô hoặc chú tới cho gà ăn, thay nước và xem đàn có khoẻ không. Mình sẽ được xem ảnh thật của đàn.",
      media: "NONE",
    },
    {
      kind: "observe",
      prompt: "Ai là người tới chăm đàn gà mỗi ngày?",
      options: [
        { key: "nong-dan", label: "Cô chú làm ở nông trại", dung: true },
        { key: "may-moc", label: "Một cái máy" },
        { key: "khong-ai", label: "Không ai cả" },
      ],
      explain: {
        "nong-dan": "Đúng rồi. Có một người thật đi tới tận chuồng mỗi ngày.",
        "may-moc": "Mình nhìn lại nhé - gà cần một người để ý xem hôm nay chúng thế nào.",
        "khong-ai": "Mình nhìn lại nhé - luôn có một cô hoặc chú tới chăm đàn.",
      },
    },
    {
      kind: "finish",
      message: "Xong rồi! Lần sau, khi cô chú làm xong một việc ở chuồng, mình sẽ được biết.",
      achievementKey: "chao-chuong",
    },
  ],
  familyMission: {
    key: "ke-ve-nguoi-cham",
    title: "Kể cho bố mẹ nghe",
    body: "Cùng bố mẹ mở trang chuồng và kể xem ai đang chăm đàn gà nhà mình.",
  },
};

const CH1_7_8: DonViHoc = {
  key: "ch1-gap-nguoi-cham-7-8",
  version: 1,
  ageBand: "AGE_7_8",
  eventType: "FAMILY_ENROLLED",
  chapter: 1,
  title: "Chuồng gà của mình bắt đầu từ đây",
  objectives: [
    "Biết đàn gà là thật, ở một nơi thật, do một người thật chăm",
    "Nhận ra vài dấu hiệu cho thấy một chuồng đã được chuẩn bị tử tế",
  ],
  sensitivity: "NORMAL",
  durationMinutes: 6,
  cards: [
    {
      kind: "story",
      title: "Một đàn gà thật, ở một nông trại thật",
      body: "Từ hôm nay đàn gà này đi cùng mình. Mỗi lần cô chú ở nông trại làm xong một việc, họ chụp lại một tấm ảnh - nên những gì mình xem đều là chuyện đã xảy ra thật.",
      media: "NONE",
    },
    {
      kind: "observe",
      prompt: "Ba thứ nào cho thấy một chuồng gà đã được chuẩn bị tốt?",
      options: [
        { key: "nuoc-sach", label: "Máng nước sạch", dung: true },
        { key: "thuc-an", label: "Máng ăn có thức ăn", dung: true },
        { key: "cho-tru", label: "Chỗ khô ráo để trú", dung: true },
        { key: "do-choi", label: "Nhiều đồ chơi sặc sỡ" },
      ],
      explain: {
        "nuoc-sach": "Đúng. Nước sạch là thứ đàn cần mỗi ngày.",
        "thuc-an": "Đúng. Không có thức ăn thì đàn không lớn được.",
        "cho-tru": "Đúng. Gà cần chỗ khô để trú lúc mưa và lúc nắng gắt.",
        "do-choi": "Cái này cho vui mắt người thôi - đàn gà không cần tới nó.",
      },
    },
    {
      kind: "predict",
      prompt: "Theo bạn, việc nào cô chú sẽ làm nhiều lần nhất trong tuần này?",
      options: [
        { key: "cho-an", label: "Cho ăn và thay nước" },
        { key: "don-chuong", label: "Dọn chuồng" },
        { key: "kiem-tra", label: "Xem đàn có khoẻ không" },
      ],
    },
    {
      kind: "finish",
      message: "Xong rồi. Từ giờ, mỗi việc thật ở chuồng sẽ mở ra một điều để mình tìm hiểu.",
      achievementKey: "chao-chuong",
    },
  ],
  familyMission: {
    key: "ke-ve-nguoi-cham",
    title: "Hỏi bố mẹ một câu",
    body: "Cùng bố mẹ mở trang chuồng, tìm tên cô chú đang chăm đàn và kể lại xem hôm nay họ đã làm gì.",
  },
};

const CH2_5_6: DonViHoc = {
  key: "ch2-ga-can-gi-5-6",
  version: 1,
  ageBand: "AGE_5_6",
  eventType: "CARE_TASK_COMPLETED",
  chapter: 2,
  title: "Gà cần gì mỗi ngày?",
  objectives: ["Nhận ra ba nhu cầu cơ bản của một con vật sống: ăn, uống, chỗ trú"],
  sensitivity: "NORMAL",
  durationMinutes: 4,
  cards: [
    {
      kind: "story",
      title: "Cô chú vừa làm xong một việc ở chuồng",
      body: "Đây là tấm ảnh cô chú vừa chụp ở chuồng nhà mình.",
      media: "EVENT_PROOF",
    },
    {
      kind: "observe",
      prompt: "Thứ nào đàn gà cần mỗi ngày?",
      options: [
        { key: "nuoc", label: "Nước", dung: true },
        { key: "thoc", label: "Thóc và cám", dung: true },
        { key: "cho-tru", label: "Chỗ khô để trú", dung: true },
        { key: "keo", label: "Kẹo" },
      ],
      explain: {
        nuoc: "Đúng rồi. Thiếu nước là đàn mệt ngay.",
        thoc: "Đúng rồi. Đó là bữa ăn của đàn.",
        "cho-tru": "Đúng rồi. Mưa hay nắng to thì đàn phải có chỗ vào.",
        keo: "Mình nhìn lại nhé - kẹo là món của người, không phải của gà.",
      },
    },
    {
      kind: "finish",
      message: "Giỏi lắm! Hôm nay đàn gà nhà mình đã được lo đủ.",
      achievementKey: "biet-ga-can-gi",
    },
  ],
};

const CH2_7_8: DonViHoc = {
  key: "ch2-ga-can-gi-7-8",
  version: 1,
  ageBand: "AGE_7_8",
  eventType: "CARE_TASK_COMPLETED",
  chapter: 2,
  title: "Một ngày của đàn gà",
  objectives: [
    "Phân biệt nhu cầu của sinh vật sống với thứ chỉ để cho đẹp",
    "Nghĩ xem thời tiết đổi thì việc chăm phải đổi thế nào",
  ],
  sensitivity: "NORMAL",
  durationMinutes: 6,
  cards: [
    {
      kind: "story",
      title: "Việc hôm nay đã xong",
      body: "Cô chú vừa làm xong một việc ở chuồng và gửi về tấm ảnh này. Mỗi việc ở nông trại đều phải có ảnh thì mới được tính là xong.",
      media: "EVENT_PROOF",
    },
    {
      kind: "observe",
      prompt: "Cái nào là nhu cầu của đàn, cái nào chỉ để người nhìn cho vui?",
      options: [
        { key: "nuoc", label: "Nước sạch trong máng", dung: true },
        { key: "thuc-an", label: "Thức ăn đúng bữa", dung: true },
        { key: "o-de", label: "Ổ đẻ kín và êm", dung: true },
        { key: "bien-ten", label: "Tấm biển tên treo trước chuồng" },
        { key: "co-day", label: "Dây cờ nhiều màu" },
      ],
      explain: {
        nuoc: "Đúng. Không có nước thì mọi thứ khác đều vô nghĩa.",
        "thuc-an": "Đúng. Ăn đủ và đúng giờ thì đàn khoẻ.",
        "o-de": "Đúng. Gà mái cần chỗ yên tĩnh để đẻ.",
        "bien-ten": "Cái này để người ta nhận ra chuồng nhà mình - đàn gà không cần.",
        "co-day": "Nhìn vui mắt, nhưng đàn gà sống không phụ thuộc vào nó.",
      },
    },
    {
      kind: "predict",
      prompt: "Nếu mai trời nắng gắt cả ngày, theo bạn cô chú sẽ chú ý thêm điều gì?",
      options: [
        { key: "them-nuoc", label: "Thay nước nhiều lần hơn" },
        { key: "che-nang", label: "Che bớt nắng cho chuồng" },
        { key: "ca-hai", label: "Cả hai việc trên" },
      ],
    },
    {
      kind: "finish",
      message: "Xong rồi. Chăm một đàn gà là làm mấy việc nhỏ, đều đặn, mỗi ngày.",
      achievementKey: "biet-ga-can-gi",
    },
  ],
  familyMission: {
    key: "quan-sat-thoi-tiet",
    title: "Cùng bố mẹ nhìn ra ngoài",
    body: "Hôm nay trời thế nào? Cùng bố mẹ đoán xem thời tiết đó làm việc chăm đàn khó hơn hay dễ hơn.",
  },
};

const CH3_5_6: DonViHoc = {
  key: "ch3-dan-dang-lon-5-6",
  version: 1,
  ageBand: "AGE_5_6",
  eventType: "FLOCK_STAGE_CHANGED",
  chapter: 3,
  title: "Đàn gà đang lớn",
  objectives: ["Nhận ra sinh vật sống thay đổi theo thời gian"],
  sensitivity: "NORMAL",
  durationMinutes: 4,
  cards: [
    {
      kind: "story",
      title: "Đàn gà nhà mình vừa lớn thêm một chút",
      body: "Lúc mới về, đàn còn bé xíu và phải ở chỗ thật ấm. Bây giờ đàn đã cứng cáp hơn và đi lại nhiều hơn.",
      media: "NONE",
    },
    {
      kind: "sequence",
      prompt: "Xếp lại cho đúng thứ tự nhé",
      items: [
        { key: "gan-con", label: "Gà con mới nở" },
        { key: "lon-hon", label: "Gà lớn hơn, chạy nhanh hơn" },
        { key: "truong-thanh", label: "Gà mái trưởng thành" },
      ],
    },
    {
      kind: "finish",
      message: "Đúng rồi! Lớn lên là chuyện xảy ra từ từ, mỗi ngày một chút.",
      achievementKey: "thay-dan-lon",
    },
  ],
};

const CH3_7_8: DonViHoc = {
  key: "ch3-dan-dang-lon-7-8",
  version: 1,
  ageBand: "AGE_7_8",
  eventType: "FLOCK_STAGE_CHANGED",
  chapter: 3,
  title: "Đàn đã qua một chặng",
  objectives: [
    "Hiểu một đàn gà đi qua nhiều chặng, mỗi chặng cần cách chăm khác nhau",
    "Tập nghĩ theo mốc thời gian",
  ],
  sensitivity: "NORMAL",
  durationMinutes: 6,
  cards: [
    {
      kind: "story",
      title: "Đàn vừa sang chặng mới",
      body: "Đàn gà không lớn lên một cách đều đều. Có những chặng rõ rệt: lúc còn phải sưởi ấm, lúc đã tự đi kiếm ăn quanh chuồng, rồi lúc bắt đầu đẻ.",
      media: "NONE",
    },
    {
      kind: "sequence",
      prompt: "Xếp các chặng theo đúng thứ tự đàn đi qua",
      items: [
        { key: "um", label: "Chặng úm - cần sưởi ấm" },
        { key: "lon", label: "Chặng lớn - chạy nhảy quanh chuồng" },
        { key: "de", label: "Chặng đẻ - bắt đầu có trứng" },
      ],
    },
    {
      kind: "predict",
      prompt: "Sang chặng mới, theo bạn điều gì sẽ thay đổi trước nhất?",
      options: [
        { key: "an-nhieu", label: "Đàn ăn nhiều hơn" },
        { key: "cho-rong", label: "Đàn cần chỗ rộng hơn" },
        { key: "ca-hai", label: "Cả hai" },
      ],
    },
    {
      kind: "finish",
      message: "Xong rồi. Mỗi chặng cần một cách chăm khác - đó là lý do cô chú phải để ý đàn mỗi ngày.",
      achievementKey: "thay-dan-lon",
    },
  ],
};

const CH4_5_6: DonViHoc = {
  key: "ch4-qua-trung-dau-tien-5-6",
  version: 1,
  ageBand: "AGE_5_6",
  eventType: "FIRST_EGG_RECORDED",
  chapter: 4,
  title: "Quả trứng đầu tiên!",
  objectives: ["Nối được: chăm mỗi ngày → chờ đủ lâu → có trứng", "Đếm trong phạm vi nhỏ"],
  sensitivity: "NORMAL",
  durationMinutes: 5,
  cards: [
    {
      kind: "story",
      title: "Đàn gà nhà mình đã đẻ quả trứng đầu tiên",
      body: "Đây là ảnh mẻ trứng đầu tiên, cô chú vừa nhặt sáng nay. Đàn đã được chăm nhiều ngày mới tới được hôm nay.",
      media: "EVENT_PROOF",
    },
    { kind: "count", prompt: "Cùng đếm xem hôm nay được bao nhiêu quả nhé", source: "HARVEST_QTY", variant: "COUNT" },
    {
      kind: "predict",
      prompt: "Ngày mai đàn có đẻ nữa không?",
      options: [
        { key: "co", label: "Chắc là có" },
        { key: "khong-chac", label: "Không chắc, phải chờ xem" },
      ],
    },
    {
      kind: "finish",
      message: "Không ai biết chắc ngày mai được mấy quả - mình cùng chờ xem nhé!",
      achievementKey: "trung-dau-tien",
    },
  ],
  familyMission: {
    key: "khoe-trung-dau",
    title: "Khoe với bố mẹ",
    body: "Cùng bố mẹ xem lại ảnh mẻ trứng đầu tiên và đếm lại một lần nữa.",
  },
};

const CH4_7_8: DonViHoc = {
  key: "ch4-qua-trung-dau-tien-7-8",
  version: 1,
  ageBand: "AGE_7_8",
  eventType: "FIRST_EGG_RECORDED",
  chapter: 4,
  title: "Mẻ trứng đầu tiên của đàn",
  objectives: [
    "Nối được công chăm với kết quả, và hiểu kết quả không đều nhau mỗi ngày",
    "Gom nhóm 5 để đếm nhanh",
  ],
  sensitivity: "NORMAL",
  durationMinutes: 7,
  cards: [
    {
      kind: "story",
      title: "Sau nhiều ngày chăm, đàn bắt đầu đẻ",
      body: "Đây là ảnh mẻ trứng đầu tiên của đàn nhà mình. Từ hôm nay chuồng bước vào chặng đẻ - nhưng số trứng mỗi ngày sẽ không giống nhau.",
      media: "EVENT_PROOF",
    },
    { kind: "count", prompt: "Gom trứng thành từng nhóm rồi đếm xem có mấy nhóm nhé", source: "HARVEST_QTY", variant: "GROUP_5" },
    {
      kind: "predict",
      prompt: "Tuần sau, số trứng mỗi ngày sẽ thế nào?",
      options: [
        { key: "nhieu-hon", label: "Nhiều hơn hôm nay" },
        { key: "bang", label: "Bằng hôm nay" },
        { key: "khong-deu", label: "Có ngày nhiều, có ngày ít" },
      ],
    },
    {
      kind: "finish",
      message: "Xong rồi. Đàn gà là sinh vật sống, nên con số mỗi ngày một khác - và như thế là bình thường.",
      achievementKey: "trung-dau-tien",
    },
  ],
  familyMission: {
    key: "khoe-trung-dau",
    title: "Cùng bố mẹ ghi lại",
    body: "Cùng bố mẹ xem sổ thu hoạch của chuồng và đoán xem tuần này tổng cộng được bao nhiêu quả.",
  },
};

const CH5_5_6: DonViHoc = {
  key: "ch5-trung-di-dau-5-6",
  version: 1,
  ageBand: "AGE_5_6",
  eventType: "LOT_CLAIMED",
  chapter: 5,
  title: "Mẻ trứng đi đâu?",
  objectives: ["Biết trứng phải đi qua vài bước mới về tới nhà"],
  sensitivity: "NORMAL",
  durationMinutes: 4,
  cards: [
    {
      kind: "story",
      title: "Mẻ trứng nhà mình sắp về nhà",
      body: "Bố mẹ vừa nhờ cô chú mang mẻ trứng của chuồng mình về. Trứng sẽ đi một quãng đường mới tới nơi.",
      media: "NONE",
    },
    {
      kind: "sequence",
      prompt: "Trứng đi theo thứ tự nào?",
      items: [
        { key: "nhat", label: "Cô chú nhặt trứng" },
        { key: "xep-hop", label: "Xếp vào hộp" },
        { key: "giao", label: "Mang về nhà mình" },
      ],
    },
    {
      kind: "finish",
      message: "Đúng rồi! Trứng không tự bay về nhà - có người mang nó đi cả quãng đường.",
      achievementKey: "duong-di-cua-trung",
    },
  ],
};

const CH5_7_8: DonViHoc = {
  key: "ch5-trung-di-dau-7-8",
  version: 1,
  ageBand: "AGE_7_8",
  eventType: "LOT_CLAIMED",
  chapter: 5,
  title: "Một mẻ trứng đi những đâu",
  objectives: [
    "Hình dung một chuỗi ngắn: thu hoạch → bảo quản → đóng gói → giao",
    "Biết vì sao trứng cần được giữ mát",
  ],
  sensitivity: "NORMAL",
  durationMinutes: 6,
  cards: [
    {
      kind: "story",
      title: "Mẻ trứng đang trên đường về",
      body: "Mẻ trứng của chuồng nhà mình vừa được xếp vào chuyến giao. Từ chuồng gà tới bàn ăn là cả một quãng, và mỗi bước đều có người làm.",
      media: "NONE",
    },
    {
      kind: "sequence",
      prompt: "Xếp lại đúng hành trình của mẻ trứng",
      items: [
        { key: "nhat", label: "Nhặt trứng ở ổ" },
        { key: "kiem", label: "Xem lại từng quả" },
        { key: "giu-mat", label: "Giữ mát" },
        { key: "dong-hop", label: "Xếp hộp" },
        { key: "giao", label: "Giao về nhà" },
      ],
    },
    {
      kind: "observe",
      prompt: "Vì sao trứng cần được giữ mát trước khi về nhà?",
      options: [
        { key: "giu-tuoi", label: "Để giữ được lâu và ngon hơn", dung: true },
        { key: "cho-dep", label: "Để vỏ trứng bóng đẹp hơn" },
        { key: "cho-nhe", label: "Để trứng nhẹ hơn khi mang đi" },
      ],
      explain: {
        "giu-tuoi": "Đúng. Mát thì trứng giữ được lâu hơn.",
        "cho-dep": "Mình nghĩ lại nhé - việc này không liên quan tới màu vỏ.",
        "cho-nhe": "Mình nghĩ lại nhé - trứng không nhẹ đi khi để mát.",
      },
    },
    {
      kind: "finish",
      message: "Xong rồi. Từ ổ gà tới nhà mình có nhiều bàn tay, và mỗi bước đều cần cẩn thận.",
      achievementKey: "duong-di-cua-trung",
    },
  ],
};

const CH6_5_6: DonViHoc = {
  key: "ch6-tu-qr-toi-bua-an-5-6",
  version: 1,
  ageBand: "AGE_5_6",
  eventType: "HANDOVER_COMPLETED",
  chapter: 6,
  title: "Trứng đã về tới nhà",
  objectives: ["Nối được món trên bàn với đàn gà mình đã theo dõi"],
  sensitivity: "NORMAL",
  durationMinutes: 4,
  cards: [
    {
      kind: "story",
      title: "Mẻ trứng đã về tới nhà mình",
      body: "Chính là những quả trứng của đàn gà mình vẫn xem mỗi ngày. Chúng đi từ chuồng, qua tay cô chú, rồi tới bàn ăn nhà mình.",
      media: "NONE",
    },
    {
      kind: "observe",
      prompt: "Những quả trứng này từ đâu tới?",
      options: [
        { key: "chuong-minh", label: "Từ đàn gà của chuồng mình", dung: true },
        { key: "cua-hang", label: "Từ một cái kho nào đó" },
      ],
      explain: {
        "chuong-minh": "Đúng rồi! Mình đã xem đàn gà này lớn lên.",
        "cua-hang": "Mình nhìn lại nhé - đây đúng là trứng của đàn gà nhà mình.",
      },
    },
    {
      kind: "finish",
      message: "Trước khi ăn, mình nhớ rửa tay và cảm ơn cô chú đã chăm đàn nhé.",
      achievementKey: "tu-chuong-toi-ban-an",
    },
  ],
  familyMission: {
    key: "cung-chuan-bi-mon",
    title: "Cùng bố mẹ chuẩn bị một món",
    body: "Cùng bố mẹ rửa tay, đếm lại số trứng trong hộp và chọn một món để cả nhà cùng làm.",
  },
};

const CH6_7_8: DonViHoc = {
  key: "ch6-tu-qr-toi-bua-an-7-8",
  version: 1,
  ageBand: "AGE_7_8",
  eventType: "HANDOVER_COMPLETED",
  chapter: 6,
  title: "Từ mã truy xuất tới bữa ăn",
  objectives: [
    "Biết có thể tra lại nguồn gốc của thức ăn mình đang ăn",
    "Nối chuỗi: người chăm → ngày thu → hộp trứng trên bàn",
  ],
  sensitivity: "NORMAL",
  durationMinutes: 7,
  cards: [
    {
      kind: "story",
      title: "Hộp trứng này có một mã riêng",
      body: "Mỗi mẻ trứng ở ChicChic đều có một mã truy xuất. Bố mẹ mở mã đó lên là thấy: ai chăm đàn, đàn giống gì, và mẻ này thu ngày nào.",
      media: "NONE",
    },
    {
      kind: "sequence",
      prompt: "Xếp lại hành trình từ chuồng tới bàn ăn",
      items: [
        { key: "cham", label: "Cô chú chăm đàn mỗi ngày" },
        { key: "de", label: "Đàn đẻ trứng" },
        { key: "thu", label: "Nhặt và ghi vào sổ" },
        { key: "giao", label: "Giao về nhà" },
        { key: "bua-an", label: "Lên bàn ăn nhà mình" },
      ],
    },
    {
      kind: "observe",
      prompt: "Mã truy xuất cho mình biết điều gì?",
      options: [
        { key: "nguoi-cham", label: "Ai đã chăm đàn", dung: true },
        { key: "ngay-thu", label: "Mẻ này thu ngày nào", dung: true },
        { key: "giong", label: "Đàn thuộc giống gì", dung: true },
        { key: "ten-hang-xom", label: "Tên những người hàng xóm của nông trại" },
      ],
      explain: {
        "nguoi-cham": "Đúng. Thức ăn có tên người làm ra nó.",
        "ngay-thu": "Đúng. Biết ngày thu thì biết trứng còn mới hay không.",
        giong: "Đúng. Mỗi giống gà một khác.",
        "ten-hang-xom": "Không - mã chỉ nói về đàn gà và mẻ trứng này thôi.",
      },
    },
    {
      kind: "finish",
      message: "Xong rồi. Biết thức ăn của mình từ đâu tới là một việc người lớn cũng nên làm.",
      achievementKey: "tu-chuong-toi-ban-an",
    },
  ],
  familyMission: {
    key: "cung-chuan-bi-mon",
    title: "Cùng bố mẹ quét mã",
    body: "Nhờ bố mẹ mở mã truy xuất của mẻ trứng này, tìm tên cô chú đã chăm đàn, rồi cùng chuẩn bị một món.",
  },
};

/** Toàn bộ catalog. Sáu chương × hai nhóm tuổi. */
export const CATALOG: readonly DonViHoc[] = [
  CH1_5_6, CH1_7_8,
  CH2_5_6, CH2_7_8,
  CH3_5_6, CH3_7_8,
  CH4_5_6, CH4_7_8,
  CH5_5_6, CH5_7_8,
  CH6_5_6, CH6_7_8,
];

// ---------------------------------------------------------------------------
// Chọn bài cho một sự kiện
// ---------------------------------------------------------------------------

/**
 * Lý do một sự kiện **không** sinh ra bài - danh sách **đóng**.
 *
 * Vì sao phải đóng: mã này được ghi vào `LearningEventReceipt.reason` và hiện lên màn chẩn
 * đoán ở `/admin`. Chữ tự do ở đó nghĩa là có ngày một mẩu dữ liệu thật (hay một stack trace)
 * đi lạc vào bảng gắn với hồ sơ trẻ.
 */
export type LyDoBoQua =
  | "khong-co-bai-cho-loai-nay"
  | "viec-nay-chua-co-bai"
  | "chang-nay-chua-co-bai"
  | "khong-co-bai-cho-nhom-tuoi";

export const LY_DO_BO_QUA_VI: Record<LyDoBoQua, string> = {
  "khong-co-bai-cho-loai-nay": "Loại sự kiện này chưa có bài trong chương trình MVP",
  "viec-nay-chua-co-bai": "Việc chăm sóc loại này chưa có bài (chỉ cho ăn / kiểm tra mới có)",
  "chang-nay-chua-co-bai": "Chặng này của đàn chưa có bài (chỉ chặng úm → lớn mới có)",
  "khong-co-bai-cho-nhom-tuoi": "Chưa có biến thể cho nhóm tuổi này",
};

export type KetQuaChon =
  | { chon: "co"; unit: DonViHoc }
  | { chon: "bo"; lyDo: LyDoBoQua };

/** Việc chăm sóc có bài (spec §9 chương 2). Các loại việc khác **cố ý** không có. */
export const VIEC_CO_BAI = ["FEED", "CHECK"] as const;

/** Chặng có bài (spec §9 chương 3): đàn rời chỗ úm để ra chạy nhảy. */
export const CHANG_CO_BAI: readonly string[] = ["GROWING"];

/**
 * Sự kiện này có sinh bài cho bé ở nhóm tuổi này không.
 *
 * ⚠️ **Bỏ qua là một kết quả HỢP LỆ, không phải lỗi.** Phần lớn sự kiện ở nông trại không
 * thành bài, và đó là chủ ý: nông dân ghi lô mỗi ngày, nên nếu mỗi lô là một bài thì đứa trẻ
 * nhận đúng một bài học lặp lại mỗi sáng cho tới khi chán - vừa nhàm vừa đúng kiểu "kéo trẻ
 * vào app mỗi ngày" mà §8.3 cấm. Bài phải gắn với **mốc**, không gắn với nhịp.
 */
export function chonDonVi(
  eventType: LoaiSuKien,
  ageBand: NhomTuoi,
  payload: Record<string, unknown>,
): KetQuaChon {
  if (eventType === "HARVEST_LOGGED") return { chon: "bo", lyDo: "khong-co-bai-cho-loai-nay" };
  if (eventType === "CARE_TASK_COMPLETED") {
    const kind = String(payload?.kind ?? "");
    if (!VIEC_CO_BAI.some((v) => v === kind)) return { chon: "bo", lyDo: "viec-nay-chua-co-bai" };
  }
  if (eventType === "FLOCK_STAGE_CHANGED") {
    const to = String(payload?.to ?? "");
    if (!CHANG_CO_BAI.includes(to)) return { chon: "bo", lyDo: "chang-nay-chua-co-bai" };
  }
  const unit = CATALOG.find((u) => u.eventType === eventType && u.ageBand === ageBand);
  return unit ? { chon: "co", unit } : { chon: "bo", lyDo: "khong-co-bai-cho-nhom-tuoi" };
}

// ---------------------------------------------------------------------------
// Chụp lại nội dung và dữ kiện
// ---------------------------------------------------------------------------

/**
 * ⭐ **Dữ kiện được phép chụp vào bài** (§9.39) - chỉ **số, nhãn đóng và id ảnh**.
 *
 * Không tên người, không nhãn chuồng, không chữ ai gõ tự do. Hai lý do, và lý do thứ hai mới
 * là lý do thật:
 *  · nhãn chuồng và ghi chú của nông dân là **chữ người thật gõ**, và chỗ này chảy thẳng vào
 *    màn hình của một đứa trẻ 5 tuổi;
 *  · tên cô chú **đổi được** - chụp lại nghĩa là một hôm nào đó bài học gọi tên một người
 *    không còn chăm đàn nữa. Tên hiện tại được tra lúc vẽ (Epic 5), như thế mới đúng.
 */
export const TRUONG_DU_KIEN = ["qty", "lotType", "taskKind", "fromStage", "toStage", "productLine", "proofMediaId"] as const;

export type DuKienBai = Partial<Record<(typeof TRUONG_DU_KIEN)[number], string | number>>;

/** Trần độ dài cho chữ trong dữ kiện - mọi giá trị hợp lệ đều là nhãn đóng hoặc id. */
export const MAX_CHU_DU_KIEN = 60;

/**
 * Rút dữ kiện của bài từ `payload` của sự kiện.
 *
 * **Loại bỏ, không ném lỗi** - cùng luật và cùng lý do với `locPayload` ở `su-kien-meta.ts`:
 * hàm này chạy trong đường sinh bài, và một cái tên trường gõ sai không đáng để làm hỏng cả
 * lượt đồng bộ của một gia đình.
 */
export function locDuKien(payload: Record<string, unknown>): DuKienBai {
  const ra: DuKienBai = {};
  const dat = (k: (typeof TRUONG_DU_KIEN)[number], v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) ra[k] = v;
    else if (typeof v === "string" && v.length > 0 && v.length <= MAX_CHU_DU_KIEN) ra[k] = v;
  };
  dat("qty", payload?.qty);
  dat("lotType", payload?.lotType);
  dat("taskKind", payload?.kind);
  dat("fromStage", payload?.from);
  dat("toStage", payload?.to);
  dat("productLine", payload?.productLine);
  dat("proofMediaId", payload?.proofMediaId);
  return ra;
}

/** Bản chụp nội dung đi kèm bài - đọc lại được mãi mãi kể cả khi catalog đã đổi. */
export type ChupNoiDung = {
  key: string;
  version: number;
  chapter: number;
  title: string;
  durationMinutes: number;
  cards: TheHoc[];
  familyMission?: NhiemVuGiaDinh;
};

export function chupNoiDung(unit: DonViHoc): ChupNoiDung {
  return {
    key: unit.key,
    version: unit.version,
    chapter: unit.chapter,
    title: unit.title,
    durationMinutes: unit.durationMinutes,
    // Sao sâu: giữ nguyên bản văn lúc bé nhận bài, không phải một con trỏ tới catalog hiện tại.
    cards: JSON.parse(JSON.stringify(unit.cards)) as TheHoc[],
    ...(unit.familyMission ? { familyMission: { ...unit.familyMission } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Hàng rào nội dung (§21.5)
// ---------------------------------------------------------------------------

/**
 * Chữ **không được** xuất hiện trong bất cứ thứ gì trẻ đọc.
 *
 * Ba nhóm, ba lý do khác nhau:
 *  · **tiền và mua bán** - trẻ không được biến thành đường bán hàng vào nhà (FL-D06, §8.3);
 *  · **doạ và ép** - "gà buồn vì con", "sắp hết hạn", đếm ngày liên tiếp: đó là kỹ thuật giữ
 *    chân, dùng lên một đứa trẻ 5 tuổi thì gọi đúng tên là thao túng;
 *  · **giết mổ** - MVP không kể chuyện đó cho hai nhóm tuổi này, kể cả khi chuồng có gà thịt.
 */
export const TU_CAM_NOI_DUNG: readonly string[] = [
  "mua ngay", "mua giúp", "nhờ bố mẹ mua", "đặt mua", "giảm giá", "khuyến mãi", "ưu đãi",
  "đầu tư", "lợi nhuận", "kiếm tiền", "sinh lời", "đồng/quả", "vnd", "vnđ", "giá bán",
  "sắp hết hạn", "sắp hết giờ", "nhanh lên kẻo", "bỏ lỡ", "gà buồn", "gà đói vì",
  "chuỗi ngày", "streak", "xếp hạng", "bảng xếp hạng", "điểm số", "thua cuộc", "sai rồi",
  "thịt gà", "giết", "mổ thịt", "xuất chuồng",
  "http://", "https://", "www.",
];

/** Mọi chữ một đứa trẻ sẽ đọc trong một đơn vị - dùng cho bộ kiểm hàng rào nội dung. */
export function chuCuaTre(unit: DonViHoc): string[] {
  const ra: string[] = [unit.title, ...unit.objectives];
  for (const c of unit.cards) {
    if (c.kind === "story") ra.push(c.title, c.body);
    if (c.kind === "observe") { ra.push(c.prompt, ...c.options.map((o) => o.label), ...Object.values(c.explain)); }
    if (c.kind === "predict") ra.push(c.prompt, ...c.options.map((o) => o.label));
    if (c.kind === "sequence") ra.push(c.prompt, ...c.items.map((o) => o.label));
    if (c.kind === "count") ra.push(c.prompt);
    if (c.kind === "finish") ra.push(c.message);
  }
  if (unit.familyMission) ra.push(unit.familyMission.title, unit.familyMission.body);
  return ra;
}

/** Trần độ dài từng mẩu chữ - một màn hình của trẻ không đọc nổi hơn thế (§13.2). */
export const MAX_CHU_THE = 220;

// ---------------------------------------------------------------------------
// Báo cáo tuần cho cha mẹ (Epic 6 · spec §18.2)
// ---------------------------------------------------------------------------

/** Số ngày một "tuần" của báo cáo. Cửa sổ trượt, không phải tuần theo lịch. */
export const SO_NGAY_BAO_CAO = 7;

export type TuanCuaBe = {
  /** Bài bé làm xong trong 7 ngày qua. */
  soXong: number;
  /** Nhiệm vụ cả nhà cùng làm ngoài đời, đã đánh dấu xong. */
  soNhiemVu: number;
  /** Bài đang chờ bé mở. */
  dangCho: number;
};

/**
 * Chữ **không được** xuất hiện trong báo cáo tuần (§18.2 của spec).
 *
 * Vì sao có danh sách này: một bản tóm tắt hằng tuần về một đứa trẻ là đúng thứ trượt thành
 * bảng điểm nhanh nhất - chỉ cần một dòng "tuần này bé đạt 8/10" là sản phẩm đã đổi nghĩa.
 * Cha mẹ đọc báo cáo để **biết con đang tìm hiểu gì**, không phải để chấm con.
 *
 * Cấm cả **so sánh giữa các bé** trong cùng một nhà: hai anh em đọc chung màn hình đó.
 */
export const TU_CAM_BAO_CAO: readonly string[] = [
  "điểm số", "chấm điểm", "xếp hạng", "thứ hạng", "bảng xếp hạng", "huy chương",
  "chuỗi ngày", "streak", "giỏi hơn", "kém hơn", "so với bé", "tụt lại", "đạt chuẩn",
];

/**
 * Một câu tóm tắt tuần của một bé.
 *
 * ⚠️ **Mô tả, không chấm.** Con số ở đây là "bé đã tìm hiểu mấy điều", không phải điểm -
 * và cố ý **không có mục tiêu nào để so**: không "3/5", không phần trăm, không tuần trước
 * so tuần này. Tuần bé bận, tuần chuồng im ắng, tuần ốm - đều là tuần bình thường.
 */
export function cauTuanNay(t: TuanCuaBe): string {
  const nv = t.soNhiemVu > 0 ? ` Cả nhà cùng làm ${t.soNhiemVu} việc ngoài đời 💚.` : "";
  if (t.soXong > 0) {
    return `Tuần này bé đã tìm hiểu ${t.soXong} điều ở chuồng gà.${nv}`;
  }
  if (t.dangCho > 0) {
    return `Tuần này bé chưa mở điều nào - còn ${t.dangCho} điều đang chờ bé.${nv}`;
  }
  return `Tuần này chuồng chưa có gì mới cho bé. Khi cô chú làm xong một việc, mình sẽ có thêm.${nv}`;
}

/**
 * Một câu cho **cái chuông** - gộp cả nhà vào MỘT dòng (điều kiện nghiệm thu của Epic 6:
 * "nhiều moment gộp một thông báo, không dội chuông").
 *
 * Trả `null` khi **không có gì để nói**. Đây là phần quan trọng nhất của hàm: một thông báo
 * hằng tuần nói "tuần này không có gì" là một cái chuông dạy người ta thôi nhìn vào chuông.
 */
export function cauChuongTuan(input: { soXong: number; dangCho: number; mongMuon: number }): string | null {
  const y: string[] = [];
  if (input.soXong > 0) y.push(`${input.soXong} điều bé đã tìm hiểu`);
  if (input.dangCho > 0) y.push(`${input.dangCho} điều đang chờ bé`);
  if (input.mongMuon > 0) y.push(`${input.mongMuon} mong muốn bé gửi bạn`);
  if (y.length === 0) return null;
  return `Tuần này ở ChicChic Gia đình: ${y.join(" · ")}.`;
}

// ---------------------------------------------------------------------------
// Lựa chọn của bé (Epic 5)
// ---------------------------------------------------------------------------

/** Trần số lựa chọn lưu lại cho một bài - nhiều hơn số thẻ thì chắc chắn là rác gửi vào. */
export const MAX_LUA_CHON = 12;

export type LuaChonCuaBe = { the: number; chon: string };

/**
 * Lọc lựa chọn của bé theo **BẢN CHỤP của chính bài đó**, không theo catalog hiện tại.
 *
 * Vì sao theo bản chụp: bài của bé giữ nội dung lúc nó được sinh ra (§13.3). Kiểm theo catalog
 * hiện tại nghĩa là sau một lần sửa nội dung, lựa chọn hợp lệ của một đứa trẻ bỗng thành "khoá
 * lạ" và bị vứt đi.
 *
 * **Loại bỏ, không ném lỗi** - cùng luật với `locPayload` và `locDuKien`. Cả `the` lẫn `chon`
 * đều là thứ gửi từ ngoài vào (§9.6), và đây là màn hình của một đứa trẻ: chỗ này không được
 * có đường nào dẫn tới một câu báo lỗi đỏ.
 */
export function locLuaChon(chup: unknown, tho: unknown): LuaChonCuaBe[] {
  const cards = (chup as { cards?: unknown[] } | null)?.cards;
  if (!Array.isArray(cards) || !Array.isArray(tho)) return [];
  const ra: LuaChonCuaBe[] = [];
  const daCo = new Set<number>();
  for (const item of tho) {
    if (ra.length >= MAX_LUA_CHON) break;
    const the = (item as { the?: unknown })?.the;
    const chon = (item as { chon?: unknown })?.chon;
    if (typeof the !== "number" || !Number.isInteger(the) || the < 0 || the >= cards.length) continue;
    if (typeof chon !== "string" || chon.length === 0 || chon.length > 60) continue;
    // Một thẻ một lựa chọn: gửi mười dòng cho cùng một thẻ không làm phình cột được.
    if (daCo.has(the)) continue;
    const c = cards[the] as { kind?: string; options?: { key?: string }[]; items?: { key?: string }[] };
    const khoa = (c?.options ?? c?.items ?? []).map((o) => o?.key);
    if (!khoa.includes(chon)) continue;
    daCo.add(the);
    ra.push({ the, chon });
  }
  return ra;
}
