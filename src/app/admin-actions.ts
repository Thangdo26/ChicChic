"use server";
// Admin cấp tài khoản đăng nhập cho các cô chú nông dân.
// Nông dân KHÔNG tự đăng ký được: admin đặt tên đăng nhập + mật khẩu rồi đưa tận tay,
// các cô chú dùng đúng thông tin đó vào /dang-nhap.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { hashPassword, passwordProblem } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { notify } from "@/lib/notify";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Tên đăng nhập: chữ thường, số, dấu chấm/gạch — gõ được trên bàn phím điện thoại. */
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/**
 * Email nội bộ sinh từ tên đăng nhập. Cột User.email là unique NOT NULL nên vẫn
 * phải có giá trị, nhưng địa chỉ này KHÔNG dùng để gửi thư — nông dân đăng nhập
 * bằng username, quên mật khẩu thì admin đặt lại.
 */
const internalEmail = (username: string) => `${username}@nong-dan.chicchic.vn`;

function readWorkerForm(formData: FormData) {
  return {
    workerId: String(formData.get("workerId") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim().slice(0, 80),
    username: String(formData.get("username") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
    area: String(formData.get("area") ?? "").trim().slice(0, 120),
    yearsExp: Math.max(0, Math.min(60, Number(formData.get("yearsExp") ?? 5) || 5)),
    maxBarns: Math.max(1, Math.min(50, Number(formData.get("maxBarns") ?? 15) || 15)),
  };
}

/**
 * Tạo tài khoản đăng nhập cho nông dân.
 * - Có `workerId` → gắn tài khoản vào hồ sơ nông dân đã có (vd người được seed sẵn).
 * - Không có     → tạo luôn hồ sơ nông dân mới rồi gắn tài khoản.
 */
export async function createWorkerAccount(formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới cấp được tài khoản.");

  const f = readWorkerForm(formData);
  if (!USERNAME_RE.test(f.username)) {
    return nope("Tên đăng nhập cần 3–32 ký tự, chỉ chữ thường không dấu, số, dấu . _ -");
  }
  const pw = passwordProblem(f.password);
  if (pw) return nope(pw);

  const taken = await prisma.user.findFirst({
    where: { OR: [{ username: f.username }, { email: internalEmail(f.username) }] },
    select: { id: true },
  });
  if (taken) return nope(`Tên đăng nhập "${f.username}" đã có người dùng — chọn tên khác nhé.`);

  // Gắn vào hồ sơ nông dân có sẵn
  if (f.workerId) {
    const worker = await prisma.farmWorker.findUnique({
      where: { id: f.workerId },
      select: { id: true, name: true, userId: true },
    });
    if (!worker) return nope("Không tìm thấy hồ sơ nông dân này.");
    if (worker.userId) return nope(`${worker.name} đã có tài khoản đăng nhập rồi.`);

    const user = await prisma.user.create({
      data: {
        email: internalEmail(f.username), username: f.username, name: worker.name,
        role: "WORKER", passwordHash: hashPassword(f.password), emailVerifiedAt: new Date(),
      },
    });
    await prisma.farmWorker.update({ where: { id: worker.id }, data: { userId: user.id } });
    await notify({
      userId: user.id, kind: "ACCOUNT",
      title: "🔑 Tài khoản của bạn đã sẵn sàng",
      body: `Đăng nhập bằng tên "${f.username}". Việc được giao sẽ hiện ở đây.`,
      href: "/nong-trai",
    });

    revalidatePath("/admin");
    return ok(`Đã cấp tài khoản "${f.username}" cho ${worker.name}.`);
  }

  // Tạo hồ sơ nông dân mới
  if (f.name.length < 2) return nope("Nhập tên cô/chú nông dân giúp mình.");
  if (f.area.length < 2) return nope("Nhập khu vực (vd: Ba Vì, Hà Nội).");

  const farm = await prisma.farm.findFirst({ select: { id: true } });
  if (!farm) return nope("Chưa có nông trại nào trong hệ thống — chạy `npm run db:seed` trước.");

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: internalEmail(f.username), username: f.username, name: f.name,
        role: "WORKER", passwordHash: hashPassword(f.password), emailVerifiedAt: new Date(),
      },
    });
    const worker = await tx.farmWorker.create({
      data: {
        name: f.name, area: f.area, farmId: farm.id, userId: user.id,
        yearsExp: f.yearsExp, maxBarns: f.maxBarns, consentMedia: true, active: true,
      },
    });
    return { user, worker };
  });

  await notify({
    userId: created.user.id, kind: "ACCOUNT",
    title: "🔑 Chào mừng cô/chú tới ChicChic",
    body: `Đăng nhập bằng tên "${f.username}". Chuồng và việc được giao sẽ hiện ở đây.`,
    href: "/nong-trai",
  });

  revalidatePath("/admin");
  revalidatePath("/nhan-chuong");
  return ok(`Đã tạo nông dân ${f.name} với tên đăng nhập "${f.username}".`);
}

/** Đặt lại mật khẩu khi cô/chú quên — mọi phiên cũ bị huỷ. */
export async function resetWorkerPassword(workerId: string, formData: FormData): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới đổi được mật khẩu.");

  const password = String(formData.get("password") ?? "");
  const pw = passwordProblem(password);
  if (pw) return nope(pw);

  const worker = await prisma.farmWorker.findUnique({
    where: { id: workerId },
    select: { name: true, userId: true },
  });
  if (!worker?.userId) return nope("Nông dân này chưa có tài khoản để đổi mật khẩu.");

  await prisma.user.update({ where: { id: worker.userId }, data: { passwordHash: hashPassword(password) } });
  await prisma.session.deleteMany({ where: { userId: worker.userId } });

  revalidatePath("/admin");
  return ok(`Đã đặt mật khẩu mới cho ${worker.name} — cô/chú cần đăng nhập lại.`);
}

/** Tạm dừng / mở lại việc nhận chuồng mới của một nông dân. */
export async function toggleWorkerActive(workerId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới làm được việc này.");

  const worker = await prisma.farmWorker.findUnique({
    where: { id: workerId },
    select: { name: true, active: true },
  });
  if (!worker) return nope("Không tìm thấy nông dân này.");

  await prisma.farmWorker.update({ where: { id: workerId }, data: { active: !worker.active } });
  revalidatePath("/admin");
  revalidatePath("/nhan-chuong");
  return ok(worker.active
    ? `${worker.name} tạm dừng nhận chuồng mới (chuồng đang chăm giữ nguyên).`
    : `${worker.name} nhận chuồng mới trở lại.`);
}
