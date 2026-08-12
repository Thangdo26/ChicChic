// FAMILY LEARNING - phần quyết định THUẦN (Epic 0 của `CHICCHIC-NEXT-PLAN-FAMILY-LEARNING.md`).
//
// KHÔNG import Prisma, KHÔNG import `next/headers`, KHÔNG đọc `process.env` ở đây.
// Cùng khuôn với `lib/gates.ts` ↔ `lib/admin.ts`: luật nằm ở file thuần để bộ kiểm phủ
// được, còn việc đi lấy ba thứ nó cần (header, biến môi trường, phiên) nằm ở file gọi.
// `lib/family.ts` mới là nơi đọc biến môi trường và đọc/ghi DB.
//
// Vì sao tách: cổng quyền của repo này đã một lần rò đúng vì luật bị **chép tay hai bản**
// (§11.37 - `canViewBarn` và `barnViewer`). Family Learning sẽ có nhiều cổng hơn thế
// (cha mẹ · trẻ · consent · enrollment · cờ tính năng), nên mỗi luật chỉ được có một bản.

/**
 * Family Learning đã được bật chưa.
 *
 * ⚠️ **HỎNG THÌ ĐÓNG, không phải mở** - ngược hẳn với `lib/nhip.ts` (§9.35), và ngược
 * có lý do: bộ đếm tần suất hỏng thì thiệt hại là vài lượt gọi thừa, còn tính năng này
 * mở nhầm là **màn hình dành cho trẻ em hiện ra khi chưa ai duyệt nội dung**. Danh sách
 * NO-GO ở §23 của spec tồn tại chính vì thế.
 *
 * Cố ý **không có ngoại lệ cho dev** (khác `laQuanTri`, nơi dev được đi qua cho tiện
 * thao tác): bật ở máy chỉ tốn một dòng trong `.env`, còn một nhánh "dev thì mở" là thứ
 * sớm muộn cũng theo code lên production dưới dạng một điều kiện ai đó đọc nhầm.
 *
 * Nhận đúng ba chữ để không ai phải đoán: `1`, `true`, `on`. Mọi thứ khác - kể cả chuỗi
 * rỗng, `"false"`, hay `"YES"` - đều là **tắt**.
 */
export function coBatFamily(raw: string | undefined | null): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/**
 * Phiên bản chương trình, chụp vào `FamilyEnrollment.programVersion` lúc cha mẹ nhận lời
 * mời (§12.4 của spec).
 *
 * Đây **không** phải số phiên bản của nội dung bài học (cái đó là `LearningUnit.version`,
 * chụp riêng vào từng `LearningMoment`). Cái này trả lời một câu khác: *"gia đình này
 * tham gia theo bản cam kết nào"* - đổi luật vòng đời hay phạm vi dữ liệu trẻ thì tăng
 * số ở đây, và những gia đình đã ký bản cũ vẫn đọc được đúng thứ họ đã đồng ý.
 */
export const FAMILY_PROGRAM_VERSION = "1.1";

// ---------------- Vòng đời đàn ----------------

export type LuaChon = "MEAT" | "RETIRE" | "RENEW";
export type ChinhSachVongDoi = "STANDARD" | "FAMILY_RETIRE_ONLY";

/**
 * Đàn này được chọn những gì ở màn kết chu kỳ.
 *
 * **Một luật, một chỗ** - đây là bài học §11.37: `canViewBarn` và `barnViewer` từng là hai
 * bản chép tay của cùng một luật, và cái rò nằm đúng ở chỗ hai bản lệch nhau. Ở đây có ba
 * nơi cần cùng một câu trả lời (giao diện vẽ mấy thẻ · `decideEndOfLay` nhận cái gì · bộ
 * kiểm), nên cả ba gọi vào hàm này.
 *
 * ⚠️ **Giao diện lọc thẻ chỉ là mỹ quan.** `decideEndOfLay` là một `"use server"`, tức là
 * một endpoint công khai (§1.2 luật 4) - ai cũng bắn thẳng `choice=MEAT` vào được. Luật
 * thật nằm ở lời gọi trong action, không nằm ở việc thẻ có được vẽ ra hay không.
 *
 * `productLine` nhận vào nhưng **hiện chưa tách nhánh**: ba lựa chọn giống nhau cho cả gà
 * đẻ lẫn gà thịt, chỉ khác *cách gọi* (`lib/flock.stageLabel`, `EndOfLayChoices.optionsFor`).
 * Giữ tham số vì spec §15.2 khai như vậy và vì nếu có ngày một dòng bị cắt bớt lựa chọn
 * thì đây là chỗ duy nhất phải sửa.
 */
export function allowedLifecycleChoices(input: {
  productLine: "LAYER" | "BROILER";
  lifecyclePolicy: ChinhSachVongDoi | null | undefined;
  stage: string | null | undefined;
}): LuaChon[] {
  // Chưa tới cuối chu kỳ thì không có lựa chọn nào - cùng chốt `decideEndOfLay` đang có.
  if (input.stage !== "END_OF_LAY") return [];

  // Đàn đang đồng hành cùng một gia đình: **chỉ nghỉ hưu**.
  //
  // Đây là chỗ duy nhất trong repo mà một cam kết đã hứa với một đứa trẻ được cưỡng chế
  // bằng code. `MEAT` bị chặn vì FL-D12; `RENEW` bị chặn vì FL-D13 - nhánh đó reset chính
  // đàn đó về `BROODING`, tức là với đứa trẻ đã đặt tên từng con thì "đàn của con" biến
  // mất và một đàn khác đứng vào chỗ cũ, không ai giải thích nổi.
  if (input.lifecyclePolicy === "FAMILY_RETIRE_ONLY") return ["RETIRE"];

  return ["MEAT", "RETIRE", "RENEW"];
}

// ---------------- Hồ sơ trẻ (Epic 2) ----------------

/**
 * Bản chính sách quyền riêng tư mà cha mẹ đọc trước khi đồng ý.
 *
 * Chụp vào `ChildProfile.consentVersion` và `ChildConsentEvent.policyVersion`. Khác
 * `FAMILY_PROGRAM_VERSION` (bản cam kết về **vòng đời đàn**): cái này nói về **dữ liệu của
 * trẻ**. Hai thứ đổi vì hai lý do khác nhau nên đếm riêng - đổi lời văn về dữ liệu thì
 * không có nghĩa là gia đình phải đồng ý lại về số phận đàn gà, và ngược lại.
 *
 * ⚠️ Tăng số ở đây thì phải có đường **hỏi lại** những gia đình đã ký bản cũ. Chưa có
 * đường đó thì đừng tăng.
 */
export const CONSENT_VERSION = "1.0";

/**
 * Mục đích dùng dữ liệu, chụp nguyên văn vào từng dấu mốc consent.
 *
 * Chụp lại chứ không tra ngược từ code vì cùng một lý do với `programVersion`: đây là thứ
 * cha mẹ đã đọc, và một năm sau nó phải dựng lại được y nguyên kể cả khi lời văn đã đổi.
 * Danh sách **đóng** - không có "và các mục đích khác", vì cái đuôi đó là chỗ mọi lời hứa
 * về dữ liệu đi ra ngoài.
 */
export const CONSENT_PURPOSES = [
  "hien-thi-ten-va-hinh-cua-be-trong-khu-danh-cho-be",
  "chon-noi-dung-hoc-theo-nhom-tuoi",
  "luu-tien-do-hoc-de-bo-me-xem-lai",
] as const;

/**
 * Danh sách hình đại diện **đóng**.
 *
 * Vì sao đóng: cột `avatarKey` là thứ duy nhất trong hồ sơ trẻ có hình dạng "tài nguyên", và
 * một cột nhận đường dẫn tự do là một cột nhận ảnh tự do - tức là đúng thứ FL-D11 cấm thu.
 * Ở đây nó chỉ nhận được một trong mấy khoá dưới này; muốn thêm hình thì sửa code, không
 * phải sửa dữ liệu.
 */
export const AVATAR_TRE = [
  { key: "ga-con", emoji: "🐤", ten: "Gà con" },
  { key: "ga-mai", emoji: "🐔", ten: "Gà mái" },
  { key: "trung", emoji: "🥚", ten: "Quả trứng" },
  { key: "hat-thoc", emoji: "🌾", ten: "Bông lúa" },
  { key: "mat-troi", emoji: "🌞", ten: "Mặt trời" },
  { key: "cay-non", emoji: "🌱", ten: "Cây non" },
] as const;

export type AvatarKey = (typeof AVATAR_TRE)[number]["key"];

export function hopLeAvatar(raw: unknown): raw is AvatarKey {
  return AVATAR_TRE.some((a) => a.key === raw);
}

/**
 * Hình để vẽ ra màn hình. Khoá lạ (dữ liệu cũ, hồ sơ đã xoá nên khoá rỗng) rơi về một hình
 * chung - **không** để trống, vì một ô trống giữa danh sách trông như lỗi hiển thị.
 */
export function avatarEmoji(key: string | null | undefined): string {
  return AVATAR_TRE.find((a) => a.key === key)?.emoji ?? "🐣";
}

export type NhomTuoi = "AGE_5_6" | "AGE_7_8";

export function hopLeNhomTuoi(raw: unknown): raw is NhomTuoi {
  return raw === "AGE_5_6" || raw === "AGE_7_8";
}

/** Trần độ dài biệt danh. Ngắn - nó là tên gọi ở nhà, không phải một dòng giới thiệu. */
export const MAX_BIET_DANH = 20;

/**
 * Bé nhóm này có phải tự nói đồng ý không.
 *
 * 7–8 tuổi thì có (spec §17.1). Đây là **chuẩn sản phẩm tự đặt**, không phải đòi hỏi pháp
 * lý: cha mẹ đã đồng ý rồi, nhưng người sắp dùng cái màn hình đó là đứa trẻ, và hỏi nó một
 * câu là việc tối thiểu. Nhóm 5–6 chưa đọc trôi nên hỏi bằng chữ là hỏi vào không khí -
 * chỗ đó dựa vào cha mẹ.
 */
export function canAssent(ageBand: NhomTuoi): boolean {
  return ageBand === "AGE_7_8";
}

/**
 * Xác minh lại còn hiệu lực bao lâu.
 *
 * 10 phút - đủ để đọc xong trang chính sách rồi bấm, không đủ để một cái máy mở sẵn cả buổi
 * chiều trở thành cửa mở. Cùng con số với `OTP_TTL_MS`, cố ý: người dùng đã quen nhịp đó.
 */
export const RECENT_AUTH_MS = 10 * 60_000;

/**
 * Phiên này vừa xác minh lại chưa.
 *
 * ⚠️ **Không đặt gì ⟹ CHƯA.** `null` là phiên chưa bao giờ gõ lại mật khẩu, và một cột
 * `null` không bao giờ được tự dịch thành "chắc là được" - cùng luật với `barnViewer`
 * (§11.37), nơi "chưa có chủ" từng bị dịch thành "ai xem cũng được".
 */
export function conHieuLucXacMinh(
  reauthAt: Date | null | undefined,
  now = Date.now(),
): boolean {
  if (!(reauthAt instanceof Date) || Number.isNaN(reauthAt.getTime())) return false;
  const troi = now - reauthAt.getTime();
  // Mốc ở tương lai (đồng hồ máy chủ nhảy, dữ liệu sửa tay) cũng là KHÔNG hợp lệ.
  return troi >= 0 && troi <= RECENT_AUTH_MS;
}

export type TrangThaiTre = "DRAFT" | "ACTIVE" | "CONSENT_WITHDRAWN" | "DELETION_PENDING" | "DELETED";

/**
 * Người đang đăng nhập có được đọc/sửa hồ sơ trẻ này không (spec §15.2).
 *
 * ⚠️ **Cha mẹ A không bao giờ chạm được hồ sơ con của cha mẹ B** - đó là điều kiện nghiệm
 * thu đầu tiên của Epic 2, và nó nằm ở đúng một phép so ở đây. Mọi action đọc/ghi dữ liệu
 * trẻ phải gọi hàm này chứ không tự viết lại phép so đó (§11.37).
 *
 * Hồ sơ đã xoá thì **không ai** quản lý được nữa, kể cả chính cha mẹ: dòng còn lại là bia
 * mộ, không còn gì để sửa.
 */
export function canParentManageChild(input: {
  sessionUserId: string | null | undefined;
  parentId: string | null | undefined;
  childStatus: TrangThaiTre | null | undefined;
}): boolean {
  if (!input.sessionUserId || !input.parentId) return false;
  if (input.sessionUserId !== input.parentId) return false;
  return input.childStatus !== "DELETED" && input.childStatus !== "DELETION_PENDING";
}

/**
 * Bé vào được khu dành cho bé chưa (spec §15.2).
 *
 * Khu của bé là Epic 5 - chưa có route nào gọi hàm này. Nó có mặt từ bây giờ vì **rút
 * consent phải khoá khu của bé NGAY** (spec §17.3) là một điều kiện nghiệm thu của Epic 2,
 * và cách trung thực để chốt nó khi cửa chưa dựng là chốt cái khoá trước: hàm này trả
 * `false` ngay khi trạng thái rời khỏi `ACTIVE`, và bộ kiểm phủ đủ bảng. Ai dựng Epic 5 chỉ
 * việc gọi vào đây - đừng viết lại phép so.
 *
 * **Mọi điều kiện phải cùng đúng.** Viết kiểu "thiếu cái này thì thôi bỏ qua" ở một cổng
 * dành cho trẻ em là cách hỏng tệ nhất mà repo này có thể hỏng.
 */
export function canEnterChildSpace(input: {
  featureEnabled: boolean;
  ownsChild: boolean;
  childStatus: TrangThaiTre | null | undefined;
  consentActive: boolean;
  enrollmentActive: boolean;
}): boolean {
  return (
    input.featureEnabled === true &&
    input.ownsChild === true &&
    input.childStatus === "ACTIVE" &&
    input.consentActive === true &&
    input.enrollmentActive === true
  );
}
