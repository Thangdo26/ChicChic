"use server";
// Đăng ký bằng OTP email, đăng nhập, quên mật khẩu, hoàn trả chuồng.
import { prisma } from "@/lib/db";
import {
  EMAIL_RE, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS,
  createSession, destroySession, getSessionUser, hashCode, hashPassword,
  newOtp, normEmail, passwordProblem, verifyPassword,
} from "@/lib/auth";
import { sendCodeEmail } from "@/lib/mailer";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { RETURN_PHRASE } from "@/lib/decor";
import { revalidatePath } from "next/cache";

export type AuthResult = {
  ok: boolean;
  message: string;
  /** Chế độ demo (chưa cấu hình email): mã hiện thẳng trên màn hình. */
  devCode?: string;
};

const ok = (message: string, extra?: Partial<AuthResult>): AuthResult => ({ ok: true, message, ...extra });
const nope = (message: string): AuthResult => ({ ok: false, message });

type Purpose = "REGISTER" | "RESET";

/** Phát mã OTP cho email — chống spam bằng cooldown 60s trên mã hiện hành. */
async function issueCode(email: string, purpose: Purpose): Promise<AuthResult> {
  const existing = await prisma.emailCode.findUnique({ where: { email_purpose: { email, purpose } } });
  if (existing && !existing.usedAt && Date.now() - existing.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return nope("Mã vừa được gửi — chờ 1 phút rồi hãy yêu cầu lại nhé.");
  }

  const code = newOtp();
  const data = {
    codeHash: hashCode(code), attempts: 0, usedAt: null,
    expiresAt: new Date(Date.now() + OTP_TTL_MS), createdAt: new Date(),
  };
  await prisma.emailCode.upsert({
    where: { email_purpose: { email, purpose } },
    update: data,
    create: { email, purpose, ...data },
  });

  try {
    const sent = await sendCodeEmail(email, code, purpose);
    if (sent.sent) return ok(`Đã gửi mã 6 số tới ${email} — kiểm tra cả mục Spam nhé.`);
    return ok("Bản demo chưa cấu hình gửi email — dùng mã hiển thị bên dưới.", { devCode: sent.devCode });
  } catch {
    return nope("Không gửi được email lúc này. Thử lại sau ít phút nhé.");
  }
}

/** Kiểm tra mã OTP; đúng thì đánh dấu đã dùng. */
async function consumeCode(email: string, purpose: Purpose, code: string): Promise<AuthResult> {
  const row = await prisma.emailCode.findUnique({ where: { email_purpose: { email, purpose } } });
  if (!row || row.usedAt) return nope("Chưa có mã hợp lệ — bấm gửi mã trước nhé.");
  if (row.expiresAt < new Date()) return nope("Mã đã hết hạn (10 phút). Bấm gửi lại mã mới.");
  if (row.attempts >= OTP_MAX_ATTEMPTS) return nope("Nhập sai quá 5 lần — bấm gửi lại mã mới.");

  if (row.codeHash !== hashCode(code.trim())) {
    await prisma.emailCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return nope(left > 0 ? `Mã chưa đúng — còn ${left} lần thử.` : "Nhập sai quá 5 lần — bấm gửi lại mã mới.");
  }

  await prisma.emailCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return ok("Mã hợp lệ.");
}

// ---------------- Đăng ký ----------------

export async function sendRegisterCode(rawEmail: string): Promise<AuthResult> {
  const email = normEmail(rawEmail);
  if (!EMAIL_RE.test(email)) return nope("Email chưa hợp lệ.");

  const existed = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
  if (existed?.passwordHash) return nope("Email này đã có tài khoản — dùng Đăng nhập hoặc Quên mật khẩu.");
  // User "mồ côi" từ luồng giữ chỗ cũ (chưa có mật khẩu) → cho đăng ký tiếp, giữ nguyên chuồng đã gắn.

  return issueCode(email, "REGISTER");
}

export async function verifyAndRegister(
  rawEmail: string, code: string, password: string, name: string,
): Promise<AuthResult> {
  const email = normEmail(rawEmail);
  if (!EMAIL_RE.test(email)) return nope("Email chưa hợp lệ.");
  const pwProblem = passwordProblem(password);
  if (pwProblem) return nope(pwProblem);

  const otp = await consumeCode(email, "REGISTER", code);
  if (!otp.ok) return otp;

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hashPassword(password), emailVerifiedAt: new Date(), name: name.trim().slice(0, 80) || undefined },
    create: { email, passwordHash: hashPassword(password), emailVerifiedAt: new Date(), name: name.trim().slice(0, 80) || null },
  });
  await createSession(user.id);
  return ok("Tạo tài khoản thành công — chào mừng bạn tới ChicChic! 🐣");
}

// ---------------- Đăng nhập / đăng xuất ----------------

/**
 * Đăng nhập bằng **email** (khách) hoặc **tên đăng nhập** (nông dân do admin cấp).
 * Có "@" thì tra theo email, không thì tra theo username.
 */
export async function login(identifier: string, password: string): Promise<AuthResult> {
  const id = normEmail(identifier); // trim + lowercase, dùng chung cho cả hai kiểu
  const where = id.includes("@") ? { email: id } : { username: id };
  const user = await prisma.user.findUnique({
    where,
    include: { workerProfile: { select: { active: true } } },
  });

  // Thông báo chung cho cả hai trường hợp — không lộ tài khoản nào đã tồn tại
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return nope("Tên đăng nhập/email hoặc mật khẩu chưa đúng.");
  }
  // Nông trại tạm dừng tài khoản nông dân → không cho vào, dù mật khẩu đúng.
  // Nói rõ lý do (khác với sai mật khẩu) vì đây là người của nông trại, không phải người lạ.
  if (user.workerProfile && !user.workerProfile.active) {
    return nope("Tài khoản của bạn đang được nông trại tạm dừng — liên hệ nông trại để mở lại nhé.");
  }

  await createSession(user.id);
  return ok(`Chào mừng trở lại${user.name ? `, ${user.name}` : ""}! 🐔`);
}

export async function logout(): Promise<AuthResult> {
  await destroySession();
  revalidatePath("/");
  return ok("Đã đăng xuất. Hẹn gặp lại!");
}

// ---------------- Quên mật khẩu ----------------

export async function sendResetCode(rawEmail: string): Promise<AuthResult> {
  const email = normEmail(rawEmail);
  if (!EMAIL_RE.test(email)) return nope("Email chưa hợp lệ.");
  const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
  if (!user?.passwordHash) return nope("Email này chưa có tài khoản — bạn có thể Đăng ký mới.");
  return issueCode(email, "RESET");
}

export async function resetPassword(rawEmail: string, code: string, newPassword: string): Promise<AuthResult> {
  const email = normEmail(rawEmail);
  const pwProblem = passwordProblem(newPassword);
  if (pwProblem) return nope(pwProblem);

  const otp = await consumeCode(email, "RESET", code);
  if (!otp.ok) return otp;

  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash: hashPassword(newPassword), emailVerifiedAt: new Date() },
  });
  // Đổi mật khẩu xong: huỷ mọi phiên cũ (kể cả kẻ lạ đang giữ), đăng nhập phiên mới
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  return ok("Đã đặt mật khẩu mới và đăng nhập lại cho bạn.");
}

// ---------------- Hoàn trả chuồng ----------------

/**
 * Hoàn trả chuồng: gỡ quyền sở hữu, huỷ đơn, đàn ở lại nông trại.
 * Bảo vệ 2 lớp: phải là CHỦ chuồng đang đăng nhập + gõ đúng nguyên câu xác nhận
 * (kiểm tra lại ở server — không tin client).
 */
export async function returnBarn(barnSlug: string, typedPhrase: string): Promise<AuthResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để hoàn trả chuồng.");
  if (typedPhrase.trim() !== RETURN_PHRASE) {
    return nope("Câu xác nhận chưa đúng — gõ đúng nguyên văn giúp mình nhé.");
  }

  const barn = await prisma.barn.findUnique({
    where: { slug: barnSlug },
    include: { reservation: true, flock: true },
  });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (barn.ownerId !== me.id) return nope("Chuồng này không thuộc tài khoản của bạn.");

  await prisma.$transaction(async (tx) => {
    await tx.barn.update({ where: { id: barn.id }, data: { ownerId: null } });
    if (barn.reservation) {
      await tx.reservation.update({ where: { id: barn.reservation.id }, data: { status: "CANCELLED" } });
    }
    if (barn.workerId) {
      await tx.farmUpdate.create({
        data: {
          barnId: barn.id, workerId: barn.workerId, kind: "MILESTONE",
          text: "Chuồng đã được hoàn trả cho nông trại. Đàn vẫn được chăm sóc bình thường — cảm ơn bạn đã đồng hành 🌾",
        },
      });
    }
  });

  await notify({
    userId: await workerUserIdOfBarn(barn.id),
    kind: "BARN_RETURNED",
    title: `${barn.label} đã được hoàn trả về nông trại`,
    body: "Chuồng không còn chủ — đàn vẫn chăm bình thường, cô/chú không phải gửi tin hằng ngày nữa.",
    href: `/nong-trai/chuong/${barn.slug}`,
  });

  revalidatePath("/tai-khoan");
  revalidatePath("/nong-trai");
  revalidatePath(`/chuong/${barnSlug}`);
  return ok(`Đã hoàn trả ${barn.label} cho nông trại. Cọc sẽ được đối soát và hoàn lại theo chính sách.`);
}
