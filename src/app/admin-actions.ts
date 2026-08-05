"use server";
// Admin cấp tài khoản đăng nhập cho các cô chú nông dân.
// Nông dân KHÔNG tự đăng ký được: admin đặt tên đăng nhập + mật khẩu rồi đưa tận tay,
// các cô chú dùng đúng thông tin đó vào /dang-nhap.
import { prisma } from "@/lib/db";
import { revalidatePath, revalidateTag } from "next/cache";
import { hashPassword, passwordProblem } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { normalizeMediaUrl } from "@/lib/decor";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Trần một lần nhập kho — gõ nhầm thêm một số 0 thì sửa được, thêm bốn thì khó tin. */
const MAX_STOCK = 9999;

/**
 * Nông trại nhập thêm / điều chỉnh số hàng còn trong kho.
 *
 * Đây là con số VẬT LÝ: bao nhiêu cái đang nằm trên kệ nông trại. Người mua đặt hoá
 * đơn là trừ ngay (giữ hàng), huỷ hoá đơn là cộng lại — xem `decor-actions`.
 *
 * `delta` thay vì đặt thẳng số tuyệt đối cho luồng "nhập thêm": hai người trực cùng
 * nhập hàng thì cộng dồn đúng, còn đặt tuyệt đối thì người sau ghi đè người trước.
 * Vẫn giữ đường đặt tuyệt đối (`set`) cho lúc kiểm kê lại kệ.
 */
export async function setDecorStock(
  slug: string,
  change: { delta: number } | { set: number },
): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const item = await prisma.decorItem.findUnique({
    where: { slug: String(slug) },
    select: { id: true, name: true, stockQty: true },
  });
  if (!item) return nope("Không tìm thấy món này.");

  let after: number;
  if ("set" in change) {
    const n = Math.floor(Number(change.set));
    if (!Number.isFinite(n) || n < 0 || n > MAX_STOCK) {
      return nope(`Số lượng phải trong khoảng 0–${MAX_STOCK}.`);
    }
    await prisma.decorItem.update({ where: { id: item.id }, data: { stockQty: n } });
    after = n;
  } else {
    const d = Math.floor(Number(change.delta));
    if (!Number.isFinite(d) || d === 0 || Math.abs(d) > MAX_STOCK) {
      return nope("Số nhập vào chưa hợp lệ.");
    }
    // Cộng dồn trong MỘT câu lệnh, và chặn không cho âm ngay trong WHERE: kho âm
    // nghĩa là sổ sách nói dối, và mọi phép tính phía sau đều sai theo.
    const { count } = await prisma.decorItem.updateMany({
      where: { id: item.id, ...(d < 0 ? { stockQty: { gte: -d } } : {}) },
      data: { stockQty: { increment: d } },
    });
    if (count === 0) return nope(`Kho chỉ còn ${item.stockQty} cái "${item.name}" — không bớt được nhiều hơn thế.`);
    after = item.stockQty + d;
  }

  revalidatePath("/admin");
  // Cửa hàng đọc danh mục qua `cachedDecorItems` (TTL 1 giờ) — không đá cache thì
  // hàng vừa nhập về vẫn hiện "hết hàng" suốt một tiếng.
  revalidateTag("catalog");
  return ok(`Kho "${item.name}": ${item.stockQty} → ${after} cái.`);
}

// ---------------- Chợ: giá niêm yết & chi trả ----------------

/**
 * Nông trại đổi giá niêm yết.
 *
 * THÊM DÒNG MỚI, không sửa dòng cũ: tin đăng đã ra chợ phải tra lại được đúng giá lúc
 * bán (cùng luật với `DecorOrderItem.priceVnd`). Vì `MarketListing` chốt sẵn ba con số
 * lúc đăng nên đổi giá hôm nay **không** đụng tin đăng hôm qua — dòng mới chỉ áp cho
 * tin đăng sau đó.
 *
 * ⚠️ Đổi giá ở đây mà quên `BASE_PRICES` là mở lại đúng lỗ chênh lệch mà cả tính năng
 * này được thiết kế để né — xem chú thích ở `data/catalog.ts`.
 */
export async function setMarketPrice(input: {
  type: "EGG" | "MEAT";
  /** Rỗng = áp cho mọi giống. Trứng dùng dòng này. */
  breedSlug?: string;
  unitVnd: number;
  note?: string;
}): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const type = input?.type === "MEAT" ? "MEAT" : "EGG";
  const breedSlug = String(input?.breedSlug ?? "").trim() || null;
  const unitVnd = Math.round(Number(input?.unitVnd));
  if (!Number.isFinite(unitVnd) || unitVnd <= 0 || unitVnd > 5_000_000) {
    return nope("Giá chưa hợp lệ.");
  }
  if (breedSlug) {
    const b = await prisma.breed.findUnique({ where: { slug: breedSlug }, select: { id: true } });
    if (!b) return nope("Không có giống nào mang mã này.");
  }

  await prisma.marketPrice.create({
    data: { type, breedSlug, unitVnd, note: String(input?.note ?? "").trim().slice(0, 200) || null },
  });

  // Đo được "đổi giá xong doanh số đi đâu" — nếu không ghi lại thì sau này nhìn số
  // liệu sẽ không hiểu vì sao có một bậc thang trong biểu đồ.
  await track("price_changed", { props: { type, breedSlug, unitVnd } });

  revalidatePath("/admin");
  revalidatePath("/cho");
  return ok(
    `Đã niêm yết ${type === "EGG" ? "trứng" : "gà thịt"}${breedSlug ? ` (${breedSlug})` : ""}: ` +
      `${unitVnd.toLocaleString("vi-VN")}đ/${type === "EGG" ? "quả" : "kg"}.`,
  );
}

/**
 * Nông trại đã chuyển tiền cho người bán → đóng khoản chi.
 *
 * Chi trả LUÔN làm tay ở PoC: tự động đẩy tiền ra là chỗ mà sai một lần là mất tiền
 * thật. Bắt buộc dán ảnh biên lai — không có bằng chứng thì khoản chi này chỉ là lời nói.
 */
export async function markPayoutPaid(payoutId: string, proofUrl: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");

  const url = normalizeMediaUrl(String(proofUrl ?? ""));
  if (!url) return nope("Dán ảnh biên lai chuyển khoản trước đã nhé.");

  const p = await prisma.payout.findUnique({
    where: { id: String(payoutId) },
    select: { id: true, userId: true, amountVnd: true, status: true },
  });
  if (!p) return nope("Không tìm thấy khoản chi này.");

  // So-sánh-rồi-đặt: hai người trực cùng bấm thì chỉ một bên ghi được.
  const { count } = await prisma.payout.updateMany({
    where: { id: p.id, status: "PENDING" },
    data: { status: "PAID", paidAt: new Date(), proofUrl: url },
  });
  if (count === 0) return nope("Khoản này đã được xử lý trước đó rồi.");

  await track("payout_paid", { userId: p.userId, props: { payoutId: p.id, amountVnd: p.amountVnd } });
  await notify({
    userId: p.userId,
    kind: "PAYMENT",
    title: `💸 Nông trại đã chuyển ${p.amountVnd.toLocaleString("vi-VN")}đ cho bạn`,
    body: "Kiểm tra tài khoản ngân hàng giúp mình nhé — có ảnh biên lai trong đơn.",
    href: "/cho/cua-toi",
  });

  revalidatePath("/admin");
  revalidatePath("/cho/cua-toi");
  return ok(`Đã ghi nhận chuyển ${p.amountVnd.toLocaleString("vi-VN")}đ.`);
}

/** Tên đăng nhập: chữ thường, số, dấu chấm/gạch — gõ được trên bàn phím điện thoại. */
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/**
 * Email nội bộ sinh từ tên đăng nhập. Cột User.email là unique NOT NULL nên vẫn
 * phải có giá trị, nhưng địa chỉ này KHÔNG dùng để gửi thư — nông dân đăng nhập
 * bằng username, quên mật khẩu thì admin đặt lại.
 */
const internalEmail = (username: string) => `${username}@nong-dan.chicchic.vn`;

/** Dữ liệu form cấp tài khoản. Dùng tham số thường thay cho FormData để test được. */
export type NewWorkerInput = {
  /** Có → gắn login vào hồ sơ nông dân đã tồn tại; rỗng → tạo hồ sơ mới. */
  workerId?: string;
  name?: string;
  area?: string;
  username: string;
  password: string;
  yearsExp?: number;
  maxBarns?: number;
};

function readWorkerInput(input: NewWorkerInput) {
  return {
    workerId: String(input.workerId ?? "").trim(),
    name: String(input.name ?? "").trim().slice(0, 80),
    username: String(input.username ?? "").trim().toLowerCase(),
    password: String(input.password ?? ""),
    area: String(input.area ?? "").trim().slice(0, 120),
    yearsExp: Math.max(0, Math.min(60, Number(input.yearsExp ?? 5) || 5)),
    maxBarns: Math.max(1, Math.min(50, Number(input.maxBarns ?? 15) || 15)),
  };
}

/**
 * Tạo tài khoản đăng nhập cho nông dân.
 * - Có `workerId` → gắn tài khoản vào hồ sơ nông dân đã có (vd người được seed sẵn).
 * - Không có     → tạo luôn hồ sơ nông dân mới rồi gắn tài khoản.
 */
export async function createWorkerAccount(input: NewWorkerInput): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới cấp được tài khoản.");

  const f = readWorkerInput(input);
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
        role: "WORKER", passwordHash: await hashPassword(f.password), emailVerifiedAt: new Date(),
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

  // Băm mật khẩu TRƯỚC transaction: scrypt mất ~100ms, giữ transaction mở trong lúc
  // đó là giữ luôn một kết nối của pool Supabase (chỉ có 5) mà không làm gì cả.
  const workerHash = await hashPassword(f.password);
  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: internalEmail(f.username), username: f.username, name: f.name,
        role: "WORKER", passwordHash: workerHash, emailVerifiedAt: new Date(),
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

/**
 * Đặt lại mật khẩu khi cô/chú quên. Ghi thẳng vào DB và **huỷ mọi phiên cũ**
 * (ai đang đăng nhập bằng mật khẩu cũ sẽ bị đăng xuất ngay).
 */
export async function resetWorkerPassword(workerId: string, password: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới đổi được mật khẩu.");

  const pw = passwordProblem(password);
  if (pw) return nope(pw);

  const worker = await prisma.farmWorker.findUnique({
    where: { id: workerId },
    select: { name: true, userId: true, user: { select: { username: true } } },
  });
  if (!worker?.userId) return nope("Nông dân này chưa có tài khoản để đổi mật khẩu.");

  const newHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.update({ where: { id: worker.userId }, data: { passwordHash: newHash } }),
    prisma.session.deleteMany({ where: { userId: worker.userId } }),
  ]);
  await notify({
    userId: worker.userId, kind: "ACCOUNT",
    title: "🔑 Mật khẩu của bạn vừa được nông trại đặt lại",
    body: "Đăng nhập lại bằng mật khẩu mới nông trại đưa cho cô/chú nhé.",
    href: "/nong-trai",
  });

  revalidatePath("/admin");
  return ok(`Đã đổi mật khẩu cho ${worker.name}${worker.user?.username ? ` (${worker.user.username})` : ""} — cô/chú cần đăng nhập lại.`);
}

/**
 * Tạm dừng / mở lại tài khoản một nông dân.
 *
 * Tạm dừng có HAI tác dụng, đừng nhầm là một:
 * 1. Ẩn khỏi danh sách chọn ở /nhan-chuong (không nhận chuồng mới).
 * 2. **Khoá đăng nhập** — và huỷ luôn mọi phiên đang mở, nếu không thì người đang
 *    đăng nhập sẵn vẫn dùng tiếp được tới khi cookie hết hạn (30 ngày).
 *
 * Chuồng đang chăm KHÔNG bị gỡ khỏi cô/chú — nhưng cô/chú cũng không gửi tin được
 * cho những chuồng đó nữa. Chỗ gọi phải cảnh báo admin điều này.
 */
export async function toggleWorkerActive(workerId: string): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Chỉ quản trị nông trại mới làm được việc này.");

  const worker = await prisma.farmWorker.findUnique({
    where: { id: workerId },
    select: { name: true, active: true, userId: true, _count: { select: { barns: true } } },
  });
  if (!worker) return nope("Không tìm thấy nông dân này.");

  const suspending = worker.active;
  await prisma.farmWorker.update({ where: { id: workerId }, data: { active: !worker.active } });

  if (suspending && worker.userId) {
    // Đá ra khỏi mọi thiết bị đang đăng nhập
    await prisma.session.deleteMany({ where: { userId: worker.userId } });
  }
  await notify({
    userId: worker.userId,
    kind: "ACCOUNT",
    title: suspending ? "⏸️ Nông trại đã tạm dừng tài khoản của bạn" : "✅ Tài khoản của bạn đã mở lại",
    body: suspending
      ? "Trong lúc này cô/chú chưa đăng nhập được. Liên hệ nông trại khi cần mở lại."
      : "Cô/chú đăng nhập lại bình thường và nhận chuồng mới được rồi.",
    href: "/nong-trai",
  });

  revalidatePath("/admin");
  revalidatePath("/nhan-chuong");
  revalidatePath("/nong-trai");

  if (!suspending) return ok(`${worker.name} đăng nhập và nhận chuồng mới trở lại được rồi.`);
  return ok(
    worker._count.barns > 0
      ? `Đã tạm dừng ${worker.name}: không đăng nhập được nữa, đã đăng xuất khỏi mọi thiết bị. ${worker._count.barns} chuồng vẫn gắn tên cô/chú nhưng sẽ KHÔNG có tin mới.`
      : `Đã tạm dừng ${worker.name}: không đăng nhập được nữa, đã đăng xuất khỏi mọi thiết bị.`,
  );
}
