// Xác thực nhẹ, không phụ thuộc thư viện ngoài:
// - Mật khẩu: scrypt (crypto chuẩn của Node) + salt ngẫu nhiên
// - Phiên: token ngẫu nhiên trong cookie httpOnly, lưu bảng Session
// - OTP: 6 số, lưu sha256, hết hạn 10 phút, tối đa 5 lần thử
// Chỉ chạy phía server — next/headers bên dưới đã tự chặn nếu lỡ import vào client component.
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
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

export type SessionUser = { id: string; email: string; name: string | null; role: "USER" | "ADMIN" };

/** Người dùng của phiên hiện tại, hoặc null. Dùng được trong server component / action / route. */
export async function getSessionUser(): Promise<SessionUser | null> {
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
}

export const normEmail = (raw: string) => raw.trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Chuồng này có cho người đang xem không?
 * - Chuồng trưng bày (isPublic) hoặc chưa có chủ → ai xem cũng được.
 * - Chuồng có chủ → chỉ chủ hoặc admin.
 */
export async function canViewBarn(barn: { ownerId: string | null; isPublic: boolean }): Promise<boolean> {
  if (barn.isPublic || !barn.ownerId) return true;
  const me = await getSessionUser();
  return !!me && (me.id === barn.ownerId || me.role === "ADMIN");
}
