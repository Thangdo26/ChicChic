// Xác thực nhẹ, không phụ thuộc thư viện ngoài:
// - Mật khẩu: scrypt (crypto chuẩn của Node) + salt ngẫu nhiên
// - Phiên: token ngẫu nhiên trong cookie httpOnly, lưu bảng Session
// - OTP: 6 số, lưu sha256, hết hạn 10 phút, tối đa 5 lần thử
// Chỉ chạy phía server - next/headers bên dưới đã tự chặn nếu lỡ import vào client component.
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { moDuocTrangChuong, nongDanVaoDuoc, quyenXemChuong } from "@/lib/gates";

export const SESSION_COOKIE = "chic_session";
const SESSION_DAYS = 30;
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;

// ---------------- Mật khẩu ----------------

/**
 * scrypt BẤT ĐỒNG BỘ - cố ý không dùng `scryptSync`.
 *
 * scrypt được thiết kế để chậm (đó là điểm mạnh của nó trước tấn công dò mật khẩu),
 * mất ~100ms mỗi lần. Bản `Sync` chạy thẳng trên luồng chính của Node, nên trong
 * 100ms đó **mọi request khác của cả server đều đứng im** - một người đăng nhập làm
 * chậm lây tất cả người đang xem chuồng. Bản bất đồng bộ đẩy việc sang threadpool.
 */
const scryptAsync = promisify(scrypt) as (
  password: string, salt: string, keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scryptAsync(password, salt, 64)).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Chuẩn mật khẩu tối thiểu - trả về thông báo lỗi hoặc null nếu đạt. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Mật khẩu cần ít nhất 8 ký tự.";
  if (password.length > 72) return "Mật khẩu dài quá (tối đa 72 ký tự).";
  return null;
}

// ---------------- OTP ----------------

export const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

// ---------------- Phiên ----------------

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  cookies().delete(SESSION_COOKIE);
}

export type SessionUser = { id: string; email: string; name: string | null; role: "USER" | "WORKER" | "ADMIN" };

/**
 * Người dùng của phiên hiện tại, hoặc null. Dùng được trong server component / action / route.
 * Bọc cache(): layout, page và canViewBarn cùng hỏi phiên trong một lần render,
 * nhưng chỉ đúng MỘT truy vấn xuống DB (pool Supabase chỉ có 1 kết nối).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!s) return null;
  if (s.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  return s.user;
});

/** Hồ sơ nông dân của một tài khoản - cũng chỉ tra một lần mỗi request. */
const myWorker = cache((userId: string) =>
  prisma.farmWorker.findUnique({
    where: { userId },
    select: { id: true, name: true, maxBarns: true, active: true },
  }),
);

const myWorkerId = async (userId: string) => (await myWorker(userId))?.id ?? null;

export const normEmail = (raw: string) => raw.trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Bắt buộc đăng nhập. Chưa có phiên → đá về /dang-nhap và quay lại đúng trang cũ sau khi vào.
 * Dùng ở ĐẦU mọi server component cần tài khoản (xem chuồng, nhận chuồng…).
 */
export async function requireUser(nextPath: string): Promise<SessionUser> {
  const me = await getSessionUser();
  if (!me) redirect(`/dang-nhap?next=${encodeURIComponent(nextPath)}`);
  return me;
}

/**
 * Cửa vào một trang chuồng: BẮT BUỘC đăng nhập trước, rồi mới xét quyền xem.
 * - Chưa đăng nhập → chuyển sang /dang-nhap (không ai xem chuồng khi chưa có tài khoản).
 * - Chuồng trưng bày (`isPublic`) → mọi tài khoản xem được.
 * - Chuồng có chủ → chủ chuồng, nông dân đang phụ trách, hoặc admin.
 *
 * Dùng cho các trang chuồng **có thao tác**: trang trí, đàn gà, sổ thu hoạch, hộp thư,
 * nghỉ hưu, kết chu kỳ. Ba trang chỉ-để-xem đi qua `barnViewer()` bên dưới.
 *
 * ⚠️ **"Chưa có chủ" KHÔNG còn là lý do để mở** - xem chú thích ở `barnViewer`.
 *
 * Luật nằm ở `lib/gates.quyenXemChuong`, **dùng chung với `barnViewer`**. Trước bản này
 * hai hàm là hai bản chép tay của cùng một luật, và lỗ rò §11.37 nằm ở **cả hai** - việc
 * người vá nhớ vá cả hai là may, không phải thiết kế.
 */
export async function canViewBarn(
  barn: { ownerId: string | null; workerId: string | null; isPublic: boolean },
  nextPath: string,
): Promise<boolean> {
  const me = await requireUser(nextPath);
  // Chỉ đi hỏi hồ sơ nông dân khi câu trả lời còn phụ thuộc vào nó - mỗi lượt đi–về DB
  // ở đây là chờ thật (§10).
  const workerId = me.role === "WORKER" ? await myWorkerId(me.id) : null;
  return moDuocTrangChuong(quyenXemChuong({ me, myWorkerId: workerId, barn }));
}

/** Ai đang đứng trước một trang chuồng. `xem-thu` = khách vãng lai xem chuồng trưng bày. */
export type BarnViewer =
  | { quyen: "chu"; me: SessionUser }
  | { quyen: "nong-dan"; me: SessionUser }
  | { quyen: "quan-tri"; me: SessionUser }
  | { quyen: "xem-thu"; me: SessionUser | null }
  | { quyen: "khong"; me: SessionUser | null };

/**
 * Cửa vào **ba trang chuồng chỉ-để-xem**: trang chuồng, nhật ký ảnh, truy xuất.
 *
 * ⚠️ Đây là chỗ nới **§9.5** (*"đăng nhập trước mọi trang chuồng, không có xem thử ẩn
 * danh"*), nên đọc kỹ ranh giới trước khi đụng vào.
 *
 * Vì sao nới: cả sản phẩm bán câu *"chuồng này có thật, ảnh chụp thật, người chăm có
 * mặt mũi"* - và người cần được thuyết phục nhất là **người chưa có tài khoản**. Bắt họ
 * đăng ký trước rồi mới cho nhìn là đòi lòng tin trước khi đưa ra bằng chứng. Cùng một
 * lập luận đã mở nửa công khai của `/nong-dan/[id]` (§9.15) và trang truy xuất `/tx`
 * (§9.31); đây là mảnh thứ ba của cùng một luật.
 *
 * Cái được nới **chỉ là `isPublic`** - cột đó hiện chỉ do `prisma/seed.ts` đặt, không có
 * một action nào trong `src/` ghi vào nó. Chuồng của người dùng thật mặc định `false` và
 * không có đường nào bật lên. Ai định làm nút "chia sẻ chuồng của tôi" thì phải quay lại
 * đọc §9.5 trước: lúc đó cột này thôi là dữ liệu trưng bày và thành dữ liệu người dùng.
 *
 * Và `xem-thu` **không phải** là quyền xem mọi thứ trên trang: nó chỉ được thấy phần
 * *hiện trạng đàn* (hình chuồng, ảnh, giai đoạn, nhật ký). Mọi thứ thuộc về **người chủ**
 * - hộp thư, hoá đơn, banner cọc, bảng việc, nút giao việc - vẫn đóng theo `quyen==="chu"`.
 *
 * ⚠️ **CHỈ `isPublic`, tuyệt đối không `!ownerId`.** Hai hàm trong file này từng viết
 * `isPublic || !ownerId`, và mệnh đề thứ hai là một lỗ rò thật, đã đo trên bản chạy thật:
 * `auth-actions.returnBarn` đặt `ownerId = null` khi ai đó **hoàn trả chuồng**, nên mọi
 * chuồng bị trả lại lập tức mở toang cho khách vãng lai - tên chuồng, cả cuốn nhật ký
 * ảnh, lời nông dân viết dưới từng tấm. Lúc phát hiện đã có **3 chuồng thật** nằm trong
 * tình trạng đó. Người ta trả chuồng vì thôi muốn dính dáng, và phần thưởng là ảnh của
 * họ thành công khai - đúng cách phản bội lòng tin tệ nhất mà repo này có thể làm.
 *
 * Mệnh đề đó vốn định phục vụ chuồng seed chưa có chủ, nhưng chuồng seed **đã** mang
 * `isPublic = true` từ đầu, nên nó chưa bao giờ cần thiết. Trưng bày là một QUYẾT ĐỊNH
 * được ghi vào cột riêng; "chưa có chủ" chỉ là một khoảng trống dữ liệu, và không bao
 * giờ được tự dịch thành quyền xem.
 */
export async function barnViewer(
  barn: { ownerId: string | null; workerId: string | null; isPublic: boolean },
): Promise<BarnViewer> {
  const me = await getSessionUser();
  const workerId = me?.role === "WORKER" ? await myWorkerId(me.id) : null;
  const quyen = quyenXemChuong({ me, myWorkerId: workerId, barn });
  // `me` chắc chắn khác null ở ba nhánh đầu - chỉ người đã đăng nhập mới ra được chúng.
  return { quyen, me } as BarnViewer;
}

// ---------------- Nông dân ----------------

export type WorkerSession = {
  user: SessionUser; workerId: string; name: string; maxBarns: number;
  /** false = nông trại đã tạm dừng tài khoản này - không vào cổng nông dân được */
  active: boolean;
};

/**
 * Hồ sơ nông dân gắn với phiên hiện tại, hoặc null nếu tài khoản không phải nông dân.
 * Trả về CẢ hồ sơ đang tạm dừng - nơi gọi tự quyết định (trang /tai-khoan cần biết
 * để hiện màn "tạm dừng" thay vì đá vòng vòng).
 */
export async function getWorkerSession(): Promise<WorkerSession | null> {
  const me = await getSessionUser();
  if (!me) return null;
  const w = await myWorker(me.id);
  return w ? { user: me, workerId: w.id, name: w.name, maxBarns: w.maxBarns, active: w.active } : null;
}

/**
 * Như `getWorkerSession` nhưng CHỈ trả về nông dân **đang hoạt động**.
 * Dùng cho server action của cổng nông dân: action không redirect được như page,
 * nên nó cần một cổng trả về null để hiện toast từ chối.
 * Đây là lớp thứ hai của luật "tạm dừng = khoá tài khoản" (CODEMAP §9.10) - lớp
 * chính vẫn là xoá sạch Session ngay lúc admin tạm dừng.
 */
export async function activeWorkerSession(): Promise<WorkerSession | null> {
  const w = await getWorkerSession();
  return nongDanVaoDuoc(w) ? w : null;
}

/**
 * Bắt buộc là nông dân **đang hoạt động** - dùng cho mọi trang/hành động trong cổng /nong-trai.
 * Tạm dừng thì đá về /tai-khoan (trang đó hiện lý do + nút đăng xuất).
 * Đây là lớp chặn phòng khi phiên cũ còn sót; lớp chính là huỷ phiên ngay lúc admin tạm dừng.
 */
export async function requireWorker(nextPath = "/nong-trai"): Promise<WorkerSession> {
  const me = await requireUser(nextPath);
  const w = await myWorker(me.id);
  if (!nongDanVaoDuoc(w)) redirect("/tai-khoan");
  return { user: me, workerId: w!.id, name: w!.name, maxBarns: w!.maxBarns, active: w!.active };
}
