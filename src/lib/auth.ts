// Xác thực nhẹ, không phụ thuộc thư viện ngoài:
// - Mật khẩu: scrypt (crypto chuẩn của Node) + salt ngẫu nhiên
// - Phiên: token ngẫu nhiên trong cookie httpOnly, lưu bảng Session
// - OTP: 6 số, lưu sha256, hết hạn 10 phút, tối đa 5 lần thử
// Chỉ chạy phía server — next/headers bên dưới đã tự chặn nếu lỡ import vào client component.
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "chic_session";
const SESSION_DAYS = 30;
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60_000;

// ---------------- Mật khẩu ----------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Chuẩn mật khẩu tối thiểu — trả về thông báo lỗi hoặc null nếu đạt. */
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

/** Hồ sơ nông dân của một tài khoản — cũng chỉ tra một lần mỗi request. */
const myWorker = cache((userId: string) =>
  prisma.farmWorker.findUnique({ where: { userId }, select: { id: true, name: true, maxBarns: true } }),
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
 * - Chuồng trưng bày (isPublic) hoặc chưa có chủ → mọi tài khoản xem được.
 * - Chuồng có chủ → chủ chuồng, nông dân đang phụ trách, hoặc admin.
 */
export async function canViewBarn(
  barn: { ownerId: string | null; workerId: string | null; isPublic: boolean },
  nextPath: string,
): Promise<boolean> {
  const me = await requireUser(nextPath);
  if (barn.isPublic || !barn.ownerId) return true;
  if (me.role === "ADMIN" || me.id === barn.ownerId) return true;
  if (me.role !== "WORKER") return false;
  return barn.workerId === (await myWorkerId(me.id));
}

// ---------------- Nông dân ----------------

export type WorkerSession = { user: SessionUser; workerId: string; name: string; maxBarns: number };

/** Hồ sơ nông dân gắn với phiên hiện tại, hoặc null nếu tài khoản không phải nông dân. */
export async function getWorkerSession(): Promise<WorkerSession | null> {
  const me = await getSessionUser();
  if (!me) return null;
  const w = await myWorker(me.id);
  return w ? { user: me, workerId: w.id, name: w.name, maxBarns: w.maxBarns } : null;
}

/** Bắt buộc là nông dân đã đăng nhập — dùng cho mọi trang/hành động trong cổng /nong-trai. */
export async function requireWorker(nextPath = "/nong-trai"): Promise<WorkerSession> {
  const me = await requireUser(nextPath);
  const w = await myWorker(me.id);
  if (!w) redirect("/tai-khoan");
  return { user: me, workerId: w.id, name: w.name, maxBarns: w.maxBarns };
}
