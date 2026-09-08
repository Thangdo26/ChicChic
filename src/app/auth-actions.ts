"use server";
// Đăng ký bằng OTP email, đăng nhập, quên mật khẩu, hoàn trả chuồng.
import { prisma } from "@/lib/db";
import {
  EMAIL_RE, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS,
  createSession, destroySession, getSessionUser, hashCode, hashPassword,
  newOtp, normEmail, passwordProblem, verifyPassword,
} from "@/lib/auth";
import { sendCodeEmail } from "@/lib/mailer";
import { chanNhip, ipHienTai, xoaNhip } from "@/lib/nhip";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { track } from "@/lib/track";
import { RETURN_PHRASE } from "@/lib/decor";
import { fmtVnd } from "@/lib/pricing";
import { duKienHoanChuong, tongKhoan } from "@/lib/refunds";
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

/**
 * Hàng rào tần suất cho hai cửa phát mã (§11.50).
 *
 * ⚠️ **Gọi TRƯỚC phép tra "email này đã có tài khoản chưa", không phải sau.** Hai cửa dưới
 * đây đều trả lời thẳng rằng một email đã có tài khoản hay chưa - tiện cho người dùng thật,
 * nhưng cũng là một máy tra cứu: bắn cả danh sách email vào rồi đọc câu trả lời là biết ai
 * có tài khoản ở đây. Đặt bộ đếm sau phép tra đó thì mọi lượt bị chặn sớm **không được
 * đếm**, và máy tra cứu chạy không giới hạn dù hàng rào có mặt.
 *
 * Ngăn theo IP là ngăn chính: `email` là thứ người gọi tự bịa vô hạn, nên
 * `OTP_RESEND_COOLDOWN_MS` (khoá theo email) không cản được ai đổi email mỗi lượt - và mỗi
 * lượt đi lọt là **một email thật rời khỏi hạn mức Resend của nông trại**, gửi tới một hộp
 * thư không hề yêu cầu. Cạn hạn mức thì người dùng thật không đăng ký được nữa; bị Resend
 * đánh dấu gửi rác thì mất cả uy tín tên miền, và cái đó không thêm hàng rào nào lấy lại được.
 */
async function chanGuiMa(email: string): Promise<string | null> {
  return chanNhip([["gui-ma-ip", await ipHienTai()], ["gui-ma-email", email]]);
}

/** Phát mã OTP cho email - chống spam bằng cooldown 60s trên mã hiện hành. */
async function issueCode(email: string, purpose: Purpose): Promise<AuthResult> {
  const existing = await prisma.emailCode.findUnique({ where: { email_purpose: { email, purpose } } });
  if (existing && !existing.usedAt && Date.now() - existing.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return nope("Mã vừa được gửi - chờ 1 phút rồi hãy yêu cầu lại nhé.");
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
    if (sent.sent) return ok(`Đã gửi mã 6 số tới ${email} - kiểm tra cả mục Spam nhé.`);
    return ok("Bản demo chưa cấu hình gửi email - dùng mã hiển thị bên dưới.", { devCode: sent.devCode });
  } catch {
    return nope("Không gửi được email lúc này. Thử lại sau ít phút nhé.");
  }
}

/** Kiểm tra mã OTP; đúng thì đánh dấu đã dùng. */
async function consumeCode(email: string, purpose: Purpose, code: string): Promise<AuthResult> {
  const row = await prisma.emailCode.findUnique({ where: { email_purpose: { email, purpose } } });
  if (!row || row.usedAt) return nope("Chưa có mã hợp lệ - bấm gửi mã trước nhé.");
  if (row.expiresAt < new Date()) return nope("Mã đã hết hạn (10 phút). Bấm gửi lại mã mới.");
  if (row.attempts >= OTP_MAX_ATTEMPTS) return nope("Nhập sai quá 5 lần - bấm gửi lại mã mới.");

  if (row.codeHash !== hashCode(code.trim())) {
    await prisma.emailCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const left = OTP_MAX_ATTEMPTS - row.attempts - 1;
    return nope(left > 0 ? `Mã chưa đúng - còn ${left} lần thử.` : "Nhập sai quá 5 lần - bấm gửi lại mã mới.");
  }

  await prisma.emailCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return ok("Mã hợp lệ.");
}

// ---------------- Đăng ký ----------------

export async function sendRegisterCode(rawEmail: string): Promise<AuthResult> {
  const email = normEmail(rawEmail);
  if (!EMAIL_RE.test(email)) return nope("Email chưa hợp lệ.");
  const chan = await chanGuiMa(email);
  if (chan) return nope(chan);

  const existed = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
  if (existed?.passwordHash) return nope("Email này đã có tài khoản - dùng Đăng nhập hoặc Quên mật khẩu.");
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

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, emailVerifiedAt: new Date(), name: name.trim().slice(0, 80) || undefined },
    create: { email, passwordHash, emailVerifiedAt: new Date(), name: name.trim().slice(0, 80) || null },
  });
  await createSession(user.id);
  return ok("Tạo tài khoản thành công - chào mừng bạn tới ChicChic! 🐣");
}

// ---------------- Đăng nhập / đăng xuất ----------------

/**
 * Đăng nhập bằng **email** (khách) hoặc **tên đăng nhập** (nông dân do admin cấp).
 * Có "@" thì tra theo email, không thì tra theo username.
 */
export async function login(identifier: string, password: string): Promise<AuthResult> {
  const id = normEmail(identifier); // trim + lowercase, dùng chung cho cả hai kiểu

  // Hàng rào tần suất (§11.50). Cửa này không tiêu tiền của nông trại, nhưng để trần thì
  // mật khẩu của mọi người là thứ dò được không giới hạn - và tài khoản nông dân do nông
  // trại cấp, mật khẩu đưa tận tay, nên không ai trong số đó tự đổi thành thứ khó đoán.
  //
  // Đếm MỌI lượt, không chỉ lượt sai - vì biết đúng hay sai thì phải so mật khẩu xong đã,
  // mà "đọc bộ đếm rồi mới ghi" là chỗ 200 lượt song song cùng đi lọt. Đếm trước rồi **xoá
  // khi đăng nhập đúng** cho ra cùng một kết quả mà không có khe tương tranh nào.
  const ip = await ipHienTai();
  const chan = await chanNhip([["dang-nhap-ip", ip], ["dang-nhap-ten", id]]);
  if (chan) return nope(chan);

  const where = id.includes("@") ? { email: id } : { username: id };
  const user = await prisma.user.findUnique({
    where,
    include: { workerProfile: { select: { active: true } } },
  });

  // Thông báo chung cho cả hai trường hợp - không lộ tài khoản nào đã tồn tại
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return nope("Tên đăng nhập/email hoặc mật khẩu chưa đúng.");
  }
  // Nông trại tạm dừng tài khoản nông dân → không cho vào, dù mật khẩu đúng.
  // Nói rõ lý do (khác với sai mật khẩu) vì đây là người của nông trại, không phải người lạ.
  if (user.workerProfile && !user.workerProfile.active) {
    return nope("Tài khoản của bạn đang được nông trại tạm dừng - liên hệ nông trại để mở lại nhé.");
  }

  // Gõ đúng mật khẩu thì bộ đếm của CHÍNH tên đăng nhập đó được xoá - nhờ vậy không ai tự
  // khoá mình bằng những lần đăng nhập thành công của mình.
  //
  // ⚠️ **Cố ý KHÔNG xoá ngăn theo IP.** Xoá nó nghĩa là kẻ đang dò mật khẩu tài khoản
  // người khác chỉ cần thỉnh thoảng đăng nhập vào tài khoản của chính mình là đặt lại bộ
  // đếm chung. Ngưỡng theo IP đã nới rộng (30 lượt / 15 phút) nên cả nhà hay cả văn phòng
  // đi chung một địa chỉ vẫn thoải mái.
  await xoaNhip([["dang-nhap-ten", id]]);
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
  const chan = await chanGuiMa(email);
  if (chan) return nope(chan);

  const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
  if (!user?.passwordHash) return nope("Email này chưa có tài khoản - bạn có thể Đăng ký mới.");
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
    data: { passwordHash: await hashPassword(newPassword), emailVerifiedAt: new Date() },
  });
  // Đổi mật khẩu xong: huỷ mọi phiên cũ (kể cả kẻ lạ đang giữ), đăng nhập phiên mới
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await createSession(user.id);
  return ok("Đã đặt mật khẩu mới và đăng nhập lại cho bạn.");
}

// ---------------- Hoàn trả chuồng ----------------

/**
 * Hoàn trả chuồng: gỡ quyền sở hữu, huỷ đơn, đàn ở lại nông trại - và **ghi nợ phần tiền
 * nuôi của những ngày chưa nuôi**.
 *
 * Bảo vệ 2 lớp: phải là CHỦ chuồng đang đăng nhập + gõ đúng nguyên câu xác nhận (kiểm
 * tra lại ở server - không tin client).
 *
 * ⚠️ **Phần hoàn tiền phải nằm TRONG cùng transaction với phép gỡ quyền sở hữu.** Tách
 * ra hai bước là mở đúng cái khe tệ nhất: chuồng đã rời tay người ta mà khoản nợ chưa
 * được ghi, và người duy nhất còn nhớ mình đã trả tiền là người vừa mất quyền xem trang
 * đó. Chuỗi này chỉ được phép đi trọn hoặc không đi.
 *
 * Trước bản này thì không có phần đó: ô xác nhận hứa *"cọc đối soát hoàn lại"*, câu trả
 * về hứa *"hoàn lại theo chính sách"*, và cả hai đều rỗng - không có chính sách, không
 * có đường, không có một dòng nào trong DB nói rằng nông trại đang nợ ai (§9.11).
 */
export async function returnBarn(barnSlug: string, typedPhrase: string): Promise<AuthResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để hoàn trả chuồng.");
  if (typedPhrase.trim() !== RETURN_PHRASE) {
    return nope("Câu xác nhận chưa đúng - gõ đúng nguyên văn giúp mình nhé.");
  }

  const barn = await prisma.barn.findUnique({
    where: { slug: barnSlug },
    include: { reservation: true, flock: true },
  });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (barn.ownerId !== me.id) return nope("Chuồng này không thuộc tài khoản của bạn.");

  // Tính TRƯỚC khi gỡ quyền sở hữu - sau đó `moc` dùng lại đúng con số này để số tiền
  // ghi vào sổ khớp với số vừa hiện cho họ xem.
  const moc = new Date();
  const khoan = await duKienHoanChuong(barn.id, moc);
  const tong = tongKhoan(khoan);

  await prisma.$transaction(async (tx) => {
    await tx.barn.update({ where: { id: barn.id }, data: { ownerId: null } });
    if (barn.reservation) {
      await tx.reservation.update({ where: { id: barn.reservation.id }, data: { status: "CANCELLED" } });
    }
    if (khoan.length > 0) {
      // `skipDuplicates` dựa vào @@unique([kind, sourceId]): bấm hai lần / hai tab thì
      // kẻ thua đơn giản không ghi được gì, thay vì ghi nợ hai lần cho một kỳ.
      await tx.refund.createMany({
        data: khoan.map((k) => ({
          userId: me.id,
          barnId: barn.id,
          barnLabel: barn.label,
          kind: k.kind,
          sourceId: k.sourceId,
          amountVnd: k.amountVnd,
          reason: `Hoàn trả chuồng · ${k.nhan}`,
        })),
        skipDuplicates: true,
      });
    }
    if (barn.workerId) {
      await tx.farmUpdate.create({
        data: {
          barnId: barn.id, workerId: barn.workerId, kind: "MILESTONE",
          text: "Chuồng đã được hoàn trả cho nông trại. Đàn vẫn được chăm sóc bình thường - cảm ơn bạn đã đồng hành 🌾",
        },
      });
    }
  }, { timeout: 20_000, maxWait: 10_000 });

  // Churn - số này đứng cạnh deposit_confirmed là ra tỉ lệ giữ chân theo cohort.
  await track("barn_returned", {
    userId: me.id, barnSlug,
    props: {
      productLine: barn.flock?.productLine ?? null,
      paymentStatus: barn.reservation?.paymentStatus ?? null,
      daysOwned: Math.round((Date.now() - barn.createdAt.getTime()) / 86_400_000),
      hoanVnd: tong,
      hoanSoKhoan: khoan.length,
    },
  });
  if (tong > 0) {
    await track("refund_requested", {
      userId: me.id, barnSlug,
      props: { kind: "RETURN_BARN", amountVnd: tong, soKhoan: khoan.length },
    });
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    for (const a of admins) {
      await notify({
        userId: a.id,
        kind: "PAYMENT",
        title: `↩️ Hoàn trả chuồng - cần trả lại ${fmtVnd(tong)}`,
        body: `${barn.label} · ${khoan.length} khoản tiền nuôi chưa dùng hết.`,
        href: "/admin#hoan-tien",
      });
    }
  }

  await notify({
    userId: await workerUserIdOfBarn(barn.id),
    kind: "BARN_RETURNED",
    title: `${barn.label} đã được hoàn trả về nông trại`,
    // `href` về danh sách, KHÔNG về trang chuồng: từ §11.41 trang đó đá ngược lại đây,
    // và một cái chuông bấm vào rồi nhảy đi chỗ khác là cái chuông làm người ta mất tin.
    href: "/nong-trai",
    body:
      "Chuồng không còn chủ nên đã ẩn khỏi danh sách của cô/chú - không phải gửi tin hằng " +
      "ngày nữa. Đàn gà vẫn ở nông trại; nông trại sẽ báo lại nếu cần cô/chú chăm tiếp.",
  });

  revalidatePath("/tai-khoan");
  revalidatePath("/nong-trai");
  revalidatePath("/admin");
  revalidatePath(`/chuong/${barnSlug}`);
  // Nói ĐÚNG con số, không nói "theo chính sách". Người vừa rời đi cần biết chính xác
  // nông trại nợ họ bao nhiêu - đó là thứ duy nhất còn lại của quan hệ này.
  return ok(
    tong > 0
      ? `Đã hoàn trả ${barn.label}. Nông trại còn nợ bạn ${fmtVnd(tong)} tiền nuôi những ngày chưa nuôi - xem ở trang Tài khoản.`
      : `Đã hoàn trả ${barn.label} cho nông trại. Không có khoản nào phải hoàn - các kỳ đã trả đều đã nuôi trọn.`,
  );
}
