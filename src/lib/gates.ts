// CỔNG QUYỀN - phần QUYẾT ĐỊNH, tách khỏi phần tra DB.
//
// Không Prisma, không `next/headers`, không `node:*` (§1.2). Mọi hàm ở đây là **thuần**:
// đưa vào ai-đang-đứng-trước-cái-gì, trả về được-hay-không. Phần đi hỏi DB nằm ở
// `lib/auth.ts`, `lib/messages.ts`, `lib/admin.ts`, `app/actions.ts`.
//
// ⚠️ VÌ SAO FILE NÀY TỒN TẠI - đọc trước khi định gộp ngược lại:
//
//  1. **Bộ kiểm không nối DB và không dựng máy chủ** (§13), nên trước bản này cổng quyền
//     là vùng **hoàn toàn không được phủ**. Hai lần trong lịch sử repo, một thứ hỏng
//     toàn phần trong khi `tsc` + `lint` + `npm test` + `build` **đều xanh**: lần đầu là
//     kho ảnh thiếu header `apikey` (§10), lần hai là lỗ rò `!ownerId` nằm **ngay trong
//     `canViewBarn`/`barnViewer`** (§11.37). Cả hai đều là quyết định sai, không phải
//     truy vấn sai - và quyết định thì kiểm được bằng một hàm thuần trong một mili-giây.
//
//  2. **Một luật, một chỗ.** `canViewBarn` và `barnViewer` từng là hai bản chép tay của
//     cùng một luật. Lỗ rò §11.37 nằm ở **cả hai**, và không có gì bảo đảm người vá sẽ
//     nhớ vá cả hai - đó là may, không phải thiết kế. Nay cả hai gọi vào
//     `quyenXemChuong`, nên chúng không thể lệch nhau nữa.
//
// Cái file này **không** thay được việc chạy thử thật: nó phủ *quyết định*, không phủ
// *đường dây* (trang quên gọi cổng, `select` quên lấy `isPublic`, hai lời gọi chạy đua).
// Phần đường dây được `tests/cong-quyen.test.ts` quét bằng mã nguồn; phần còn lại vẫn
// phải kiểm tay theo công thức §13.

/** Vừa đủ để quyết định - cố ý KHÔNG nhận cả `SessionUser` để không ai tiện tay đọc thêm. */
export type NguoiXem = { id: string; role: "USER" | "WORKER" | "ADMIN" } | null;

// ---------------- Xem một chuồng ----------------

export type QuyenXem = "chu" | "nong-dan" | "quan-tri" | "xem-thu" | "khong";

/**
 * Ai đang đứng trước một chuồng.
 *
 * **Thứ tự các nhánh là một phần của luật, đừng đảo:** chủ chuồng mở chính chuồng trưng
 * bày của mình phải ra `"chu"` chứ không phải `"xem-thu"` - đảo lên trên là cắt mất hộp
 * thư, hoá đơn và bảng giao việc của chính họ.
 *
 * ⚠️ **`isPublic` là điều kiện DUY NHẤT mở chuồng cho người ngoài.** Tuyệt đối không thêm
 * `|| !barn.ownerId`: `auth-actions.returnBarn` đặt `ownerId = null` khi ai đó hoàn trả
 * chuồng, nên mệnh đề ấy mở toang cả cuốn nhật ký ảnh của người vừa rời đi (§11.37, đã
 * đo trên bản chạy thật). "Trưng bày" là một QUYẾT ĐỊNH ghi vào cột riêng; "chưa có chủ"
 * chỉ là một KHOẢNG TRỐNG dữ liệu, và khoảng trống không bao giờ được dịch thành quyền.
 */
export function quyenXemChuong({
  me, myWorkerId, barn,
}: {
  me: NguoiXem;
  /** Hồ sơ nông dân của `me`, hoặc null. Chỉ có nghĩa khi `me.role === "WORKER"`. */
  myWorkerId: string | null;
  barn: { ownerId: string | null; workerId: string | null; isPublic: boolean };
}): QuyenXem {
  if (me) {
    // Chủ chuồng trước tiên. `ownerId` null thì không ai là chủ - so sánh với `me.id`
    // vẫn sai, nhưng viết rõ ra để không ai đọc nhầm thành "null khớp với mọi người".
    if (barn.ownerId !== null && me.id === barn.ownerId) return "chu";
    if (me.role === "ADMIN") return "quan-tri";
    if (me.role === "WORKER" && myWorkerId !== null && barn.workerId === myWorkerId) {
      return "nong-dan";
    }
  }
  if (barn.isPublic) return "xem-thu";
  return "khong";
}

/**
 * Đủ quyền mở một trang chuồng **có thao tác** không (trang trí, đàn gà, sổ thu hoạch…).
 *
 * Chỗ gọi đã bắt đăng nhập trước, nên `"xem-thu"` ở đây chỉ xảy ra với chuồng trưng bày -
 * và chuồng trưng bày thì cho xem. Đây là toàn bộ phần quyết định của `auth.canViewBarn`.
 */
export const moDuocTrangChuong = (q: QuyenXem) => q !== "khong";

// ---------------- Thao tác lên chuồng của mình ----------------

export type QuyenThaoTac = "cho-qua" | "chua-dang-nhap" | "khong-phai-cua-ban";

/** Phần quyết định của `actions.ownedBarn`, chưa xét khoá nợ. */
export function quyenThaoTacChuong({
  me, ownerId,
}: { me: NguoiXem; ownerId: string | null }): QuyenThaoTac {
  if (!me) return "chua-dang-nhap";
  if (me.role === "ADMIN") return "cho-qua";
  if (ownerId === null || ownerId !== me.id) return "khong-phai-cua-ban";
  return "cho-qua";
}

/**
 * Ai KHÔNG bị chặn bởi khoá nợ tiền nuôi (§9.33).
 *
 * Chỉ quản trị. Nông dân không đi qua cổng này bao giờ - và đó là chủ ý được nhắc lại ở
 * mọi chỗ đụng tới khoá: đàn gà vẫn phải được cho ăn và chụp ảnh, dù tiền chưa về.
 *
 * Tách thành hàm riêng để chỗ gọi còn **hỏi DB một cách lười**: kiểm sở hữu trước, chỉ
 * khi cần mới đi đếm hoá đơn quá hạn. Mỗi lượt đi–về DB ở đây là chờ thật (§10).
 */
export const boQuaKhoaNo = (role: NonNullable<NguoiXem>["role"]) => role === "ADMIN";

// ---------------- Hộp thư của chuồng ----------------

export type VaiHopThu = "OWNER" | "WORKER" | null;

/**
 * Phần quyết định của `messages.threadAccess`.
 *
 * ⚠️ **Chuồng chưa có chủ thì KHÔNG có hộp thư nào cả** - kể cả chuồng trưng bày. Không
 * có luật này thì mọi tài khoản đều nhắn được vào `/chuong/demo`, và người đọc là cô chú
 * nông dân thật.
 *
 * ⚠️ Nông dân phải **đang hoạt động** (§9.10). `myActiveWorkerId` cố ý mang chữ *active*
 * trong tên: truyền vào id của một hồ sơ đang tạm dừng là mở lại đúng cánh cửa mà lệnh
 * tạm dừng vừa đóng.
 *
 * ⚠️ Quản trị **không** đi lối này (§9.17) - `messages.adminThread` là cửa riêng, và nó
 * chỉ mở khi hộp thư có cờ. Đừng thêm nhánh `role === "ADMIN"` vào đây.
 */
export function quyenHopThu({
  me, barn, myActiveWorkerId,
}: {
  me: NguoiXem;
  barn: { ownerId: string | null; workerId: string | null };
  myActiveWorkerId: string | null;
}): VaiHopThu {
  if (!me) return null;
  if (barn.ownerId === null) return null;
  if (barn.ownerId === me.id) return "OWNER";
  if (myActiveWorkerId !== null && barn.workerId === myActiveWorkerId) return "WORKER";
  return null;
}

// ---------------- Quản trị ----------------

/**
 * Bóc mật khẩu ra khỏi header `Authorization: Basic …`.
 *
 * Dùng `atob` chứ không `Buffer` để file này không kéo theo thứ gì của Node - nó phải
 * import được từ bộ kiểm, và không được làm hỏng gói client nếu lỡ ai đó import nhầm.
 *
 * Trả `null` khi không đọc nổi. Header hỏng là **không có quyền**, không phải "chuỗi rỗng
 * so với mật khẩu rỗng".
 */
export function bocMatKhauBasic(header: string | null | undefined): string | null {
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    const raw = atob(header.slice(6));
    // Tên đăng nhập có thể chứa dấu hai chấm; mật khẩu là TẤT CẢ phần còn lại sau dấu
    // hai chấm ĐẦU TIÊN - cắt bằng `split(":")[1]` là cắt cụt mật khẩu có dấu hai chấm.
    const i = raw.indexOf(":");
    if (i < 0) return null;
    const pw = raw.slice(i + 1);
    return pw.length > 0 ? pw : null;
  } catch {
    return null;
  }
}

/**
 * Phần quyết định của `admin.isAdmin`.
 *
 * ⚠️ **Chưa đặt `ADMIN_PASSWORD` thì production TỪ CHỐI.** Thiếu biến môi trường là lỗi
 * cấu hình, không phải "chế độ mở": quên đặt trên Vercel mà mở toang `/admin` nghĩa là ai
 * cũng tự xác nhận cọc cho chính mình được. Dev cục bộ thì cho qua để còn thao tác được.
 */
export function laQuanTri({
  role, matKhauGui, matKhauThat, laProduction,
}: {
  role: NonNullable<NguoiXem>["role"] | null;
  matKhauGui: string | null;
  matKhauThat: string | undefined;
  laProduction: boolean;
}): boolean {
  if (role === "ADMIN") return true;
  if (!matKhauThat) return !laProduction;
  return !!matKhauGui && matKhauGui === matKhauThat;
}

// ---------------- Nông dân ----------------

/**
 * Hồ sơ nông dân này còn vào được cổng `/nong-trai` không (§9.10).
 *
 * Một dòng, nhưng là **lớp thứ ba** của luật tạm dừng và là lớp duy nhất còn tác dụng khi
 * một phiên cũ sót lại sau lệnh xoá `Session`. Không có hồ sơ ⟹ không phải nông dân ⟹
 * cũng không vào được.
 */
export const nongDanVaoDuoc = (w: { active: boolean } | null | undefined) => !!w?.active;

/**
 * Header middleware gắn vào để lớp bọc ngoài biết "lượt này thuộc KHU CỦA BÉ" (§9.40).
 *
 * Vì sao phải đi vòng qua middleware: `app/layout.tsx` là lớp bọc chung của **mọi** trang và
 * nó không có cách nào biết đường dẫn hiện tại - Server Component không có `usePathname`. Mà
 * nó thì bắt buộc phải biết: thanh điều hướng người lớn (chuồng · chợ · tài khoản) nằm ở lớp
 * bọc đó, và để nguyên nghĩa là **một đứa trẻ đang ngồi trước bốn cánh cửa mở sẵn** sang phần
 * có tiền - đúng thứ §15.3 của spec cấm.
 *
 * Cách khác là tách `/be` thành một cây layout riêng bằng route group, nhưng làm thế phải dời
 * toàn bộ ~40 thư mục route hiện có sang một group khác. Một header đọc được ở một chỗ rẻ hơn
 * nhiều và không đụng gì tới phần đang chạy.
 */
export const HEADER_KHU_BE = "x-chic-khu-be";
