"use server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type EndOfLayChoice } from "@/data/catalog";
import { chuongBiKhoa } from "@/lib/invoices";
import {
  clampPlacement, normalizeMediaUrl, cleanLine,
  DECOR_TEXT, MAX_BARN_NAME, MAX_BIRD_NAME, MAX_DECOR_PER_BARN,
  DECOR_VARIANTS, acceptsColor, acceptsVariant, isValidColor, isValidVariant,
} from "@/lib/decor";
import { getSessionUser } from "@/lib/auth";
import { boQuaKhoaNo, quyenThaoTacChuong } from "@/lib/gates";
import { allowedLifecycleChoices } from "@/lib/family-gates";
import { LifecycleError } from "@/lib/lifecycle";
import { createLifecycleRequest, lockLifecycleTask, closeLifecycle } from "@/lib/lifecycle-store";
import { isAdmin } from "@/lib/admin";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { track } from "@/lib/track";
import { upsertTask } from "@/lib/task-store";
import { decorStock } from "@/lib/decor-store";
import { confirmReservationPaid } from "@/lib/payments";
import { asUpdateKind, stamp } from "@/lib/farm-log";
import { TASK_META } from "@/lib/tasks";

/** Kết quả trả về cho client để hiện toast. */
export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

type OwnedBarn = {
  id: string; slug: string; label: string;
  workerId: string | null; ownerId: string | null; outside: boolean;
  /** Tài khoản đăng nhập của nông dân phụ trách - để đẩy thông báo lên chuông của họ. */
  workerUserId: string | null;
};

/**
 * Cổng chung cho mọi thao tác lên một chuồng: phải đăng nhập VÀ là chủ chuồng
 * (admin đi qua được). Trả về chuồng, hoặc thông báo từ chối để hiện toast.
 */
async function ownedBarn(slug: string): Promise<{ barn: OwnedBarn; userId: string } | { deny: ActionResult }> {
  const me = await getSessionUser();
  if (!me) return { deny: nope("Bạn cần đăng nhập để làm việc này.") };

  const row = await prisma.barn.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, label: true, workerId: true, ownerId: true, outside: true,
      worker: { select: { userId: true } },
    },
  });
  if (!row) return { deny: nope("Không tìm thấy chuồng này.") };
  // Luật ở `lib/gates.quyenThaoTacChuong`; câu chữ ở lại đây.
  if (quyenThaoTacChuong({ me, ownerId: row.ownerId }) !== "cho-qua") {
    return { deny: nope("Chuồng này không thuộc tài khoản của bạn.") };
  }
  // §9.33 - chuồng có hoá đơn tiền nuôi QUÁ HẠN thì khoá các thao tác của chủ chuồng.
  // CHỈ chủ chuồng: admin phải làm việc được, và nông dân thì tuyệt đối không bị chặn -
  // đàn gà vẫn phải được cho ăn, được chụp ảnh, dù tiền chưa về. Hỏi DB **sau** khi đã
  // qua cổng sở hữu, để lời gọi bị từ chối không tốn thêm một lượt đi–về (§10).
  if (!boQuaKhoaNo(me.role) && (await chuongBiKhoa(row.id))) {
    return { deny: nope("Chuồng đang tạm khoá vì kỳ tiền nuôi chưa thanh toán. Mở trang chuồng để thanh toán là dùng lại được ngay - các bạn gà vẫn được chăm bình thường nhé.") };
  }

  const { worker, ...barn } = row;
  return { barn: { ...barn, workerUserId: worker?.userId ?? null }, userId: me.id };
}

/**
 * Cổng cho các thao tác của nông trại (/admin).
 * middleware.ts chỉ khoá việc RENDER trang /admin - mỗi "use server" là một endpoint
 * công khai riêng, nên action nào ghi dữ liệu ở /admin đều phải tự gọi hàm này.
 */
async function denyIfNotAdmin(): Promise<ActionResult | null> {
  return (await isAdmin()) ? null : nope("Thao tác này chỉ dành cho quản trị nông trại.");
}

function revalidateBarn(slug: string) {
  revalidatePath(`/chuong/${slug}`);
  revalidatePath(`/chuong/${slug}/trang-tri`);
  revalidatePath(`/chuong/${slug}/nhat-ky`);
  revalidatePath(`/chuong/${slug}/tin-nhan`);
  revalidatePath(`/chuong/${slug}/dan-ga`);
  revalidatePath(`/chuong/${slug}/ket-chu-ky`);
  revalidatePath(`/chuong/${slug}/nghi-huu`);
}

/** Khóa chung với farmer complete để kho cá nhân không bị dùng hai lần. */
async function lockOwnedBarn(tx: Prisma.TransactionClient, barn: OwnedBarn) {
  const lock = await tx.barn.updateMany({ where: { id: barn.id, ownerId: barn.ownerId, workerId: barn.workerId }, data: { id: barn.id } });
  return lock.count === 1;
}
async function notifyEquipment(barn: OwnedBarn, created: boolean, kind: "GEAR" | "DECOR") {
  if (created) await notify({ userId: barn.workerUserId, kind: "TASK_NEW", title: TASK_META[kind].label,
    body: barn.label + " có yêu cầu mới; xem danh sách trong chuồng.", href: `/nong-trai/chuong/${barn.slug}#viec` });
  revalidateBarn(barn.slug); revalidatePath("/nong-trai");
}

// ---------------- Cọc & kích hoạt chuồng ----------------
// Tiền vẫn đi ngoài app (chuyển khoản ngân hàng). Chuồng chỉ kích hoạt khi có xác nhận
// đã nhận tiền - hoặc admin bấm tay ở /admin, hoặc webhook SePay tự khớp mã.
// Cả hai đường đều đi qua `confirmReservationPaid` trong lib/payments.ts.

/** Người dùng bấm "Tôi đã chuyển khoản" → chuyển sang chờ đối soát. Bấm lại là no-op. */
export async function reportTransfer(barnSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;

  const r = await prisma.reservation.findUnique({ where: { barnId: gate.barn.id } });
  if (!r) return nope("Chuồng này không có đơn giữ chỗ.");
  if (r.paymentStatus === "CONFIRMED") return nope("Cọc của chuồng này đã được xác nhận rồi.");
  if (r.paymentStatus === "REPORTED") return nope("Bạn đã báo chuyển khoản rồi - nông trại đang đối soát.");

  const changed = await prisma.reservation.updateMany({
    where: { id: r.id, paymentStatus: "UNPAID" },
    data: { paymentStatus: "REPORTED", reportedAt: new Date() },
  });
  if (changed.count === 0) return ok("Cọc vừa được cập nhật. Tải lại để xem trạng thái mới nhất.");
  await track("deposit_reported", {
    userId: gate.userId, barnSlug,
    props: { depositVnd: r.depositVnd, priceEstimateVnd: r.priceEstimateVnd },
  });
  revalidateBarn(barnSlug);
  return ok("Đã ghi nhận! Nông trại sẽ đối soát và kích hoạt chuồng - thường trong vài giờ làm việc.");
}

/** Admin bấm "đã nhận tiền" ở /admin. Cổng quyền ở đây, nghiệp vụ ở lib/payments.ts. */
export async function confirmPayment(reservationId: string): Promise<ActionResult> {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;
  return confirmReservationPaid(reservationId, "ADMIN");
}

/** Chuồng đã sẵn sàng dùng các tính năng trả phí (decor…) chưa? */
async function barnActivated(barnId: string): Promise<boolean> {
  const r = await prisma.reservation.findUnique({ where: { barnId }, select: { paymentStatus: true } });
  // Chuồng không gắn đơn nào (demo/seed) coi như đã kích hoạt.
  return !r || r.paymentStatus === "CONFIRMED";
}

// ---------------- Thả vườn / về chuồng ----------------

/**
 * Yêu cầu thả đàn ra vườn / gọi về chuồng.
 * Đây là việc phải làm NGOÀI ĐỜI: app không tự mở cửa chuồng được, nên thao tác này
 * tạo một nhiệm vụ cho nông dân. Trạng thái đàn chỉ đổi khi nông dân làm xong và gửi ảnh.
 */
export async function toggleRange(barnSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  const flock = await prisma.flock.findUnique({ where: { barnId: barn.id }, select: { stage: true } });
  if (flock?.stage === "HARVESTED" || flock?.stage === "RETIRED") {
    return nope("Đàn đã khép lại chu kỳ - không đổi được nữa.");
  }
  if (!barn.workerId) return nope("Chuồng chưa có nông dân phụ trách.");

  const kind = barn.outside ? "RANGE_IN" : "RANGE_OUT";
  const meta = TASK_META[kind];
  const { created } = await upsertTask({
    barnId: barn.id, workerId: barn.workerId, requestedById: gate.userId,
    kind, title: meta.label, note: "Chủ chuồng yêu cầu qua app.",
  });

  if (created) {
    await notify({
      userId: barn.workerUserId,
      kind: "TASK_NEW",
      title: `${meta.emoji} Việc mới: ${meta.label}`,
      body: `${barn.label} · chủ chuồng vừa yêu cầu qua app`,
      href: `/nong-trai/chuong/${barnSlug}#viec`,
    });
  }

  revalidateBarn(barnSlug);
  revalidatePath("/nong-trai");
  if (!created) return nope(`Yêu cầu "${meta.label}" đang chờ nông dân làm rồi.`);
  return ok(
    barn.outside
      ? "Đã nhắn nông dân gọi đàn về chuồng 🏡 - xong sẽ có ảnh gửi về."
      : "Đã nhắn nông dân thả đàn ra vườn 🌿 - xong sẽ có ảnh gửi về.",
  );
}

// ---------------- Tên chuồng ----------------

/**
 * Chủ chuồng đổi tên chuồng của mình.
 *
 * Tên là thứ hiện ở khắp nơi - thẻ chuồng, tiêu đề thông báo, biển tên trong hình vẽ,
 * hộp việc của nông dân - nên làm sạch ở ĐÂY một lần thay vì mỗi chỗ hiển thị tự lo:
 * bỏ ký tự vô hình, gộp khoảng trắng, cắt còn {@link MAX_BARN_NAME} ký tự
 * (cắt theo ký tự thật, emoji không bị vỡ đôi).
 *
 * Đổi tên KHÔNG tạo việc cho nông dân - chữ trên biển thật chỉ đổi khi chủ chuồng
 * chủ động sửa qua `setDecorText` (§9.2: app không tự đổi hiện thực).
 */
export async function renameBarn(barnSlug: string, raw: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  const label = cleanLine(raw, MAX_BARN_NAME);
  if (!label) return nope("Tên chuồng đang trống - đặt cho chuồng một cái tên nhé.");
  if (label === barn.label) return ok("Tên chuồng không có gì thay đổi.");

  const changed = await prisma.barn.updateMany({ where: { id: barn.id, ownerId: barn.ownerId, label: barn.label }, data: { label } });
  if (changed.count !== 1) return nope("Chuồng vừa thay đổi. Tải lại trước khi đặt tên nhé.");
  revalidateBarn(barnSlug);
  revalidatePath("/tai-khoan");
  revalidatePath("/chuong");
  return ok(`Đã đổi tên thành "${label}".`);
}

/**
 * Đặt / đổi tên MỘT con gà trong đàn.
 *
 * Vì sao cần: tên từng con hiện chỉ đặt được đúng một lần, ở màn nhận chuồng
 * (`Reservation.henNames`), giữa lúc người ta đang chọn giống, chọn người chăm và
 * chuẩn bị chuyển tiền. Bỏ qua bước đó - hoặc gõ vội một cái tên rồi tiếc - thì **không
 * có đường nào sửa nữa**: `Bird.name` không có một lệnh `update` nào trong `src/`.
 *
 * Mà cái tên đó không phải chi tiết trang trí: nó là **toàn bộ lý do tính năng yếm tồn
 * tại** (§9.26 - mặc mỗi con một màu để nhìn ảnh nhận ra con nào), và là thứ biến một
 * đàn gia cầm thành mấy con vật cụ thể mà người ta nhớ tên. Khoá nó sau một màn hình
 * duy nhất là vứt đi phần lớn giá trị của chính nó.
 *
 * Ba chốt:
 *  · `ownedBarn` - chỉ chủ chuồng, và chuồng đang bị khoá vì nợ tiền nuôi thì không (§9.33);
 *  · lọc kèm `flock.barnId` - cùng luật §9.23/§9.26: đoán trúng id gà của chuồng người
 *    khác cũng không đụng được;
 *  · `cleanLine` - §9.25, cắt bằng `Array.from` để không xẻ đôi emoji.
 *
 * Xoá trắng tên là hợp lệ (`null`): con gà quay về gọi theo vòng chân. Có người đặt tên
 * rồi thấy không hợp, và bắt họ mang một cái tên mình không thích thì vô lý.
 */
export async function renameBird(
  barnSlug: string, birdId: string, raw: string,
): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  const name = cleanLine(raw, MAX_BIRD_NAME) || null;

  // Một câu lệnh, có kèm `flock.barnId` - không tra trước rồi ghi sau.
  const r = await prisma.bird.updateMany({
    where: { id: String(birdId), status: "ALIVE", flock: { barnId: barn.id, productLine: "LAYER", barn: { ownerId: barn.ownerId } } },
    data: { name },
  });
  if (r.count === 0) return nope("Chỉ đặt tên cho gà đẻ còn trong đàn của chuồng bạn.");

  revalidateBarn(barnSlug);
  return ok(name ? `Từ giờ gọi là "${name}" nhé.` : "Đã bỏ tên - con này gọi theo vòng chân.");
}

// ---------------- Trang trí ----------------

/**
 * Lắp MỘT cái từ kho vào chuồng.
 *
 * "Kho" = số cái đã trả tiền trừ đi số cái đang nằm trong chuồng
 * ([lib/decor-store.decorStock](src/lib/decor-store.ts)). Gỡ ra thì về kho, lắp lại
 * không thu tiền lần hai; mua thêm thì kho tăng.
 *
 * Món chưa mua (hoặc đã lắp hết số đã mua) không đi lối này - phải qua
 * `decor-actions.createDecorOrder` rồi chờ tiền được xác nhận.
 */
export async function installDecor(barnSlug: string, itemSlug: string, requestId?: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  if (!requestId || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) return nope("Tải lại trang trước khi lắp món nhé.");
  const installId = "decor_" + createHash("sha256").update(`${barn.id}:${gate.userId}:${requestId}`).digest("hex");
  if (!(await barnActivated(barn.id))) return nope("Hoàn tất cọc trước khi trang trí nhé.");
  if (!barn.workerId) return nope("Chuồng cần có nông dân phụ trách trước khi lắp món.");
  let created = false;
  const result = await prisma.$transaction(async (tx) => {
    if (!(await lockOwnedBarn(tx, barn))) return nope("Chuồng vừa được bàn giao. Tải lại giúp mình nhé.");
    // Biên nhận giữ trong Event kể cả khi món đã gỡ: retry không tự lắp trở lại.
    const receipt = await tx.event.findUnique({ where: { id: `idem_${installId}` } });
    if (receipt) return (receipt.props as { itemSlug?: string } | null)?.itemSlug === itemSlug
      ? ok("Yêu cầu lắp này đã được xử lý. Muốn lắp lại, chọn một lượt mới trong kho.")
      : nope("Khóa yêu cầu đã được dùng cho món khác. Tải lại trang nhé.");
    const previous = await tx.barnDecor.findUnique({ where: { id: installId }, select: { item: { select: { slug: true } } } });
    if (previous) return previous.item.slug === itemSlug ? ok("Món này đã được thêm từ yêu cầu đó rồi.") : nope("Khóa yêu cầu đã được dùng cho món khác. Tải lại trang nhé.");
    const item = await tx.decorItem.findUnique({ where: { slug: String(itemSlug) } });
    if (!item || item.wearable) return nope("Chọn món trang trí cho chuồng; yếm được mặc ở trang Đàn gà.");
    const stock = await decorStock(barn.id, tx);
    const available = stock.get(item.id);
    if (!available || available.free < 1) return nope("Bạn đã dùng hết món đã mua. Kho không còn món này để lắp.");
    if ([...stock.values()].reduce((n,x) => n + x.installed, 0) >= MAX_DECOR_PER_BARN) return nope("Chuồng đã đủ số món trang trí. Gỡ bớt trước nhé.");
    const top = await tx.barnDecor.aggregate({ where: { barnId: barn.id }, _max: { z: true } });
    await tx.barnDecor.create({ data: { id: installId, barnId: barn.id, itemId: item.id, ...clampPlacement({ x: item.defaultX, y: item.defaultY, scale: 1 }), z: (top._max.z ?? 0) + 1 } });
    const task = await upsertTask({ barnId: barn.id, workerId: barn.workerId!, requestedById: gate.userId,
      kind: "DECOR", title: TASK_META.DECOR.label, note: "Lắp theo bản vẽ mới nhất của chủ chuồng." }, tx);
    await tx.event.create({ data: { id: `idem_${installId}`, name: "decor_installed", userId: gate.userId,
      barnSlug: barn.slug, props: { itemSlug, decorId: installId } } });
    created = task.created;
    return ok("Đã thêm món vào bản vẽ. Cô chú lắp xong sẽ gửi ảnh về.");
  }, { timeout: 20_000, maxWait: 10_000 });
  await notifyEquipment(barn, created, "DECOR");
  return result;
}

/**
 * Gỡ MỘT cái ra khỏi chuồng. Nhận `decorId` chứ không phải slug: một chuồng có thể
 * có nhiều bản cùng loại, slug không nói được đang gỡ cái nào.
 *
 * Gỡ ra là món **về kho**, không mất tiền - lắp lại bất cứ lúc nào.
 */
export async function removeDecor(barnSlug: string, decorId: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  return mutateDecor(barn, gate.userId, async (tx, queue) => {

    // Lọc kèm barnId: không cho gỡ món của chuồng người khác dù đoán đúng id.
    const row = await tx.barnDecor.findFirst({
      where: { id: decorId, barnId: barn.id },
      select: { id: true, item: { select: { name: true } } },
    });
    if (!row) return ok("Món này đã được gỡ khỏi bản vẽ rồi.");

    await tx.barnDecor.delete({ where: { id: row.id } });
    await queue(`Gỡ "${row.item.name}" khỏi chuồng.`);

    return ok(`Đã gỡ "${row.item.name}" - món về lại kho của bạn, lắp lại lúc nào cũng được.`);
  });
}

/**
 * Đổi chữ trên một món có mặt chữ (biển tên, bảng phấn).
 *
 * Độ dài tối đa tra theo `svgKey` trong `DECOR_TEXT` - mỗi hình vẽ có chỗ chứa chữ
 * khác nhau, gõ dài hơn thì tràn ra ngoài khung. Để trống = quay về chữ mặc định
 * (tên chuồng), chứ không phải xoá món.
 */
export async function setDecorText(
  barnSlug: string,
  decorId: string,
  raw: string,
): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  return mutateDecor(barn, gate.userId, async (tx, queue) => {

    const row = await tx.barnDecor.findFirst({
      where: { id: decorId, barnId: barn.id },
      select: { id: true, text: true, item: { select: { name: true, svgKey: true } } },
    });
    if (!row) return nope("Không tìm thấy món này trong chuồng.");

    const max = DECOR_TEXT[row.item.svgKey];
    if (!max) return nope(`"${row.item.name}" không có mặt chữ để khắc.`);

    const text = cleanLine(raw, max) || null;
    if (text === row.text) return ok("Chữ không có gì thay đổi.");

    await tx.barnDecor.update({ where: { id: row.id }, data: { text, photoUrl: null } });
    await queue(text
        ? `Khắc lại "${row.item.name}" thành: ${text}`
        : `Trả "${row.item.name}" về chữ mặc định (tên chuồng).`,
    );

    return text
      ? ok(`Đã đổi chữ thành "${text}" - nông dân sẽ khắc đúng như vậy rồi gửi ảnh.`)
      : ok("Đã trả về chữ mặc định là tên chuồng.");
  });
}

/**
 * Đổi MÀU và/hoặc KIỂU DÁNG của một cái đã lắp (hàng rào, chong chóng).
 *
 * Nhận `BarnDecor.id` chứ không phải slug - mua 5 đoạn hàng rào thì mỗi đoạn sơn một
 * màu, chọn một kiểu; slug chỉ nói được "loại món", không nói được "đoạn nào" (§9.23).
 * Truy vấn LUÔN lọc kèm `barnId` nên đoán trúng id của chuồng khác cũng vô ích.
 *
 * Màu và kiểu phải nằm trong danh sách đóng của `lib/decor` - KHÔNG nhận mã màu tự do:
 * nông trại phải sơn thật, mà một ô chọn màu vô hạn là lời hứa không giữ được (§9.11).
 */
export async function setDecorStyle(
  barnSlug: string,
  decorId: string,
  style: { colorHex?: string | null; variant?: string | null },
): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  return mutateDecor(barn, gate.userId, async (tx, queue) => {
    if (!style || typeof style !== "object") return nope("Chọn màu hoặc kiểu từ danh sách nhé.");

    const row = await tx.barnDecor.findFirst({
      where: { id: decorId, barnId: barn.id },
      select: { id: true, colorHex: true, variant: true, item: { select: { name: true, svgKey: true } } },
    });
    if (!row) return nope("Không tìm thấy món này trong chuồng.");

    const key = row.item.svgKey;
    const data: { colorHex?: string | null; variant?: string | null } = {};
    const doi: string[] = [];

    // `undefined` = KHÔNG đụng tới trường đó; `null`/`""` = trả về mặc định. Phân biệt
    // hai thứ này để đổi màu không vô tình xoá mất kiểu dáng, và ngược lại.
    if (style.colorHex !== undefined) {
      const c = style.colorHex;
      if (c === null || c === "") {
        data.colorHex = null;
        if (row.colorHex !== null) doi.push("về màu mặc định");
      } else {
        if (!acceptsColor(key)) return nope(`"${row.item.name}" không sơn màu được.`);
        if (!isValidColor(key, c)) return nope("Màu này không có trong bảng màu của nông trại.");
        data.colorHex = c;
        if (row.colorHex !== c) doi.push(`đổi màu sang ${c}`);
      }
    }

    if (style.variant !== undefined) {
      const v = style.variant;
      if (v === null || v === "") {
        data.variant = null;
        if (row.variant !== null) doi.push("về kiểu mặc định");
      } else {
        if (!acceptsVariant(key)) return nope(`"${row.item.name}" chỉ có một kiểu.`);
        if (!isValidVariant(key, v)) return nope("Kiểu dáng này không có trong danh mục.");
        data.variant = v;
        if (row.variant !== v) {
          const nhan = DECOR_VARIANTS[key]?.find((x) => x.id === v)?.label ?? v;
          doi.push(`đổi kiểu sang "${nhan}"`);
        }
      }
    }

    // Không đổi gì thì đừng ghi DB và đừng làm phiền nông dân - cùng nguyên tắc với
    // `saveDecorLayout` (so từng món, không đổi thì không ghi).
    if (doi.length === 0) return ok("Không có gì thay đổi.");

    await tx.barnDecor.update({ where: { id: row.id }, data: { ...data, photoUrl: null } });
    await queue(`"${row.item.name}": ${doi.join(", ")}.`);

    return ok(`Đã ${doi.join(", ")} - nông dân sẽ làm đúng như vậy rồi gửi ảnh.`);
  });
}

/**
 * Mọi thay đổi trang trí đều phải có người ra chuồng lắp thật.
 * Gộp về MỘT việc "Lắp trang trí" đang chờ, thay vì mỗi món một việc.
 */
async function mutateDecor(barn: OwnedBarn, userId: string,
  mutate: (tx: Prisma.TransactionClient, queue: (note: string) => Promise<void>) => Promise<ActionResult>,
): Promise<ActionResult> {
  if (!barn.workerId) return nope("Chuồng cần nông dân phụ trách trước khi đổi bản vẽ.");
  let created = false;
  const result = await prisma.$transaction(async (tx) => {
    if (!(await lockOwnedBarn(tx, barn))) return nope("Chuồng vừa thay đổi. Tải lại trước khi sửa nhé.");
    return mutate(tx, async (note) => {
      const task = await upsertTask({ barnId: barn.id, workerId: barn.workerId!, requestedById: userId,
        kind: "DECOR", title: TASK_META.DECOR.label, note }, tx);
      created = created || task.created;
    });
  }, { timeout: 20_000, maxWait: 10_000 });
  await notifyEquipment(barn, created, "DECOR");
  return result;
}

/** Một món trong bản vẽ. `id` là `BarnDecor.id` - KHÔNG phải slug: một chuồng có thể
 *  có nhiều bản cùng loại, slug không nói được đang xếp cái nào. */
export type DecorPlacement = { id: string; x: number; y: number; scale: number; z: number; flipped: boolean };

/** Lưu bố cục người dùng tự sắp. Idempotent: lưu lại cùng bố cục không đổi gì thêm. */
export async function saveDecorLayout(barnSlug: string, layout: DecorPlacement[]): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  return mutateDecor(barn, gate.userId, async (tx, queue) => {
    if (!Array.isArray(layout) || layout.length > MAX_DECOR_PER_BARN || layout.some((p) => !p || typeof p.id !== "string") || new Set(layout.map((p) => p.id)).size !== layout.length) return nope("Bản vẽ không hợp lệ. Tải lại trang nhé.");

    const installed = await tx.barnDecor.findMany({ where: { barnId: barn.id } });
    const byId = new Map(installed.map((d) => [d.id, d]));

    const writes = layout.flatMap((p) => {
      const row = byId.get(String(p.id));
      if (!row) return []; // client gửi món không thuộc chuồng này → bỏ qua, không tin client
      const pos = clampPlacement(p);
      const z = Math.max(0, Math.min(999, Math.round(Number(p.z) || 0)));
      const flipped = !!p.flipped;
      if (row.x === pos.x && row.y === pos.y && row.scale === pos.scale && row.z === z && row.flipped === flipped) {
        return []; // không đổi → khỏi ghi
      }
      return [tx.barnDecor.update({ where: { id: row.id }, data: { ...pos, z, flipped, photoUrl: null } })];
    });

    if (writes.length === 0) {

      return ok("Bố cục không có gì thay đổi.");
    }

    await Promise.all(writes);
    await queue(`Xếp lại ${writes.length} món theo bản vẽ mới của chủ chuồng.`);

    return ok(`Đã lưu bố cục - ${writes.length} món được xếp lại. Nông dân sẽ lắp đúng như vậy rồi gửi ảnh.`);
  });
}

/** Trả bố cục về vị trí gợi ý ban đầu của từng món. */
export async function resetDecorLayout(barnSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  return mutateDecor(barn, gate.userId, async (tx, queue) => {

    const rows = await tx.barnDecor.findMany({ where: { barnId: barn.id }, include: { item: true } });
    if (rows.length === 0) return nope("Chuồng chưa có món nào để xếp lại.");

    const writes = rows.flatMap((r, i) => {
        const pos = clampPlacement({ x: r.item.defaultX, y: r.item.defaultY, scale: 1 });
        if (r.x === pos.x && r.y === pos.y && r.scale === pos.scale && r.z === i + 1 && !r.flipped) return [];
        return [
        tx.barnDecor.update({
          where: { id: r.id },
          data: { ...clampPlacement({ x: r.item.defaultX, y: r.item.defaultY, scale: 1 }), z: i + 1, flipped: false, photoUrl: null },
        })];
      });
    if (!writes.length) return ok("Bố cục đã ở vị trí mặc định.");
    await Promise.all(writes);
    await queue("Đưa mọi món về vị trí mặc định.");

    return ok("Đã đưa mọi món về vị trí mặc định.");
  });
}

// ---------------- Yếm cho gà ----------------
//
// Yếm gắn vào TỪNG CON (`BirdGear`), không gắn vào chuồng. Lý do ở model BirdGear:
// app cho đặt tên từng con mái nhưng trong ảnh không ai phân biệt được con nào -
// yếm màu là thứ biến cái tên thành dấu hiệu nhìn thấy được.
//
// §9.2 nguyên vẹn: hai action dưới đây CHỈ đổi ý định (PENDING_ON / PENDING_OFF) và
// tạo việc. Trạng thái thật (WORN / OFF) chỉ đặt trong `worker-actions.completeTask`,
// sau khi nông dân mặc/tháo ngoài đời rồi chụp ảnh - y hệt `Barn.outside`.

/** Gộp một việc GEAR cho cả đàn, kèm ghi chú liệt kê từng con. Không dội chuông. */


/**
 * Chọn một con gà để mặc yếm màu `itemSlug`.
 *
 * Nhận `birdId` chứ không nhận tên gà: tên có thể trùng nhau trong cùng một đàn.
 * Truy vấn LUÔN lọc kèm `flock.barnId` nên đoán trúng id gà của chuồng khác cũng
 * không đụng được (§9.23).
 */
export async function wearGear(barnSlug: string, birdId: string, itemSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  if (!(await barnActivated(barn.id))) return nope("Hoàn tất cọc trước khi chọn yếm nhé.");
  if (!barn.workerId) return nope("Chuồng cần có nông dân phụ trách trước khi mặc yếm.");
  let created = false;
  const result = await prisma.$transaction(async (tx) => {
    if (!(await lockOwnedBarn(tx, barn))) return nope("Chuồng vừa được bàn giao. Tải lại giúp mình nhé.");
    const bird = await tx.bird.findFirst({ where: { id: String(birdId), status: "ALIVE", flock: { barnId: barn.id, productLine: "LAYER" } }, select: { id: true, name: true, tagCode: true } });
    if (!bird) return nope("Yếm chỉ dành cho gà đẻ còn trong đàn của chuồng bạn.");
    const item = await tx.decorItem.findUnique({ where: { slug: String(itemSlug) } });
    if (!item?.wearable) return nope("Chọn một chiếc yếm trong kho của bạn.");
    const busy = await tx.birdGear.findFirst({ where: { birdId: bird.id, status: { not: "OFF" } } });
    if (busy) return busy.itemId === item.id ? ok("Bạn gà đã có yêu cầu yếm này rồi. Cô chú sẽ gửi ảnh khi xong.") : nope("Bạn gà đang có yếm khác. Nhờ tháo trước khi thay nhé.");
    const stock = await decorStock(barn.id, tx);
    if ((stock.get(item.id)?.free ?? 0) < 1) return nope("Bạn đã dùng hết yếm đã mua. Kho không còn chiếc này.");
    await tx.birdGear.create({ data: { birdId: bird.id, itemId: item.id } });
    const task = await upsertTask({ barnId: barn.id, workerId: barn.workerId!, requestedById: gate.userId,
      kind: "GEAR", title: TASK_META.GEAR.label, note: "Mặc yếm cho " + (bird.name || bird.tagCode) + ". Xem danh sách từng con trước khi làm." }, tx);
    created = task.created;
    return ok("Đã nhờ cô chú mặc yếm. Hình sẽ đổi khi có ảnh minh chứng.");
  }, { timeout: 20_000, maxWait: 10_000 });
  await notifyEquipment(barn, created, "GEAR");
  return result;
}

/**
 * Tháo yếm khỏi một con. Nhận `gearId` (`BirdGear.id`) và vẫn lọc kèm chuồng.
 *
 * Yếm về kho khi nông dân tháo THẬT, không phải lúc bấm nút - nên trạng thái ở đây
 * chỉ là `PENDING_OFF` và `decorStock` vẫn tính nó là đang chiếm chỗ.
 */
export async function removeGear(barnSlug: string, gearId: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  let created = false;
  const result = await prisma.$transaction(async (tx) => {
    if (!(await lockOwnedBarn(tx, barn))) return nope("Chuồng vừa được bàn giao. Tải lại giúp mình nhé.");
    const row = await tx.birdGear.findFirst({ where: { id: String(gearId), bird: { flock: { barnId: barn.id } } } });
    if (!row) return nope("Không tìm thấy yếm này trong chuồng của bạn.");
    if (row.status === "OFF" || row.status === "PENDING_OFF") return ok("Yêu cầu tháo yếm đã được ghi nhận rồi.");
    if (row.status === "PENDING_ON") {
      // Rút ý định chưa thực hiện; giữ dòng lịch sử, chưa có yếm thật bị tháo.
      await tx.birdGear.updateMany({ where: { id: row.id, status: "PENDING_ON" }, data: { status: "OFF", removedAt: new Date() } });
      const pending = await tx.birdGear.count({ where: { bird: { flock: { barnId: barn.id } }, status: { in: ["PENDING_ON", "PENDING_OFF"] } } });
      if (pending === 0) await tx.barnTask.updateMany({ where: { barnId: barn.id, kind: "GEAR", status: "OPEN" },
        data: { status: "DECLINED", doneAt: new Date(), doneNote: "Chủ chuồng đã rút mọi yêu cầu yếm chưa thực hiện." } });
      return ok("Đã rút yêu cầu chưa thực hiện. Yếm về lại kho của bạn.");
    }
    if (!barn.workerId) return nope("Chuồng cần có nông dân phụ trách để tháo yếm.");
    const changed = await tx.birdGear.updateMany({ where: { id: row.id, status: "WORN" }, data: { status: "PENDING_OFF" } });
    if (changed.count !== 1) return nope("Yếm vừa đổi trạng thái. Tải lại giúp mình nhé.");
    const task = await upsertTask({ barnId: barn.id, workerId: barn.workerId, requestedById: gate.userId, kind: "GEAR",
      title: TASK_META.GEAR.label, note: "Tháo yếm theo danh sách trong chuồng." }, tx);
    created = task.created;
    return ok("Đã nhờ cô chú tháo. Hình vẫn giữ yếm tới khi có minh chứng.");
  }, { timeout: 20_000, maxWait: 10_000 });
  await notifyEquipment(barn, created, "GEAR");
  return result;
}

// ---------------- Nhật ký & media ----------------

export async function postUpdate(barnSlug: string, text: string, kind: string): Promise<ActionResult> {
  // Ghi chép này ĐÓNG DẤU TÊN NÔNG DÂN - để hở là ai cũng giả mạo được nhật ký.
  const deny = await denyIfNotAdmin();
  if (deny) return deny;

  const barn = await prisma.barn.findUnique({ where: { slug: barnSlug } });
  const body = text.trim().slice(0, 1000);
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (!barn.workerId) return nope("Chuồng chưa có nông dân phụ trách.");
  if (!body) return nope("Nội dung cập nhật đang trống.");

  await stamp(barn.id, barn.workerId, asUpdateKind(kind), body);
  await notify({
    userId: barn.ownerId,
    kind: "BARN_UPDATE",
    title: `Tin mới từ ${barn.label}`,
    body,
    href: `/chuong/${barn.slug}/nhat-ky`,
  });
  revalidateBarn(barnSlug);
  return ok(`Đã đăng cập nhật lên ${barn.label}.`);
}

/** Admin: gắn ảnh/video cho một chuồng bằng URL (Supabase Storage, YouTube…). */
export async function addMedia(formData: FormData): Promise<ActionResult> {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;

  const barnSlug = String(formData.get("barn") ?? "");
  const rawUrl = String(formData.get("url") ?? "").trim();
  const type = String(formData.get("type") ?? "PHOTO") === "VIDEO" ? "VIDEO" : "PHOTO";
  const caption = String(formData.get("caption") ?? "").trim().slice(0, 200) || null;
  const posterUrl = normalizeMediaUrl(String(formData.get("poster") ?? ""));

  const url = normalizeMediaUrl(rawUrl);
  const barn = await prisma.barn.findUnique({ where: { slug: barnSlug } });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (!url) return nope("URL không hợp lệ - cần bắt đầu bằng https:// hoặc /");

  // Cùng chuồng + cùng URL trong 1 phút → coi như double-submit
  const dup = await prisma.barnMedia.findFirst({
    where: { barnId: barn.id, url, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (dup) return nope("Vừa gửi đúng đường dẫn này rồi - không thêm trùng.");

  const media = await prisma.barnMedia.create({
    data: { barnId: barn.id, workerId: barn.workerId, type, url, posterUrl, caption },
  });

  if (barn.workerId && caption) {
    const u = await prisma.farmUpdate.create({
      data: { barnId: barn.id, workerId: barn.workerId, kind: type, text: caption },
    });
    await prisma.barnMedia.update({ where: { id: media.id }, data: { updateId: u.id } });
  }
  await notify({
    userId: barn.ownerId,
    kind: "BARN_UPDATE",
    title: `📷 ${type === "VIDEO" ? "Video" : "Ảnh"} mới ở ${barn.label}`,
    body: caption ?? "Nông trại vừa gửi hiện trạng chuồng.",
    href: `/chuong/${barn.slug}/nhat-ky`,
  });
  revalidateBarn(barnSlug);
  return ok(`Đã gửi ${type === "VIDEO" ? "video" : "ảnh"} lên ${barn.label}.`);
}

export async function deleteMedia(id: string, barnSlug: string): Promise<ActionResult> {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;

  const { count } = await prisma.barnMedia.deleteMany({ where: { id } });
  revalidateBarn(barnSlug);
  return count > 0 ? ok("Đã xoá khỏi chuồng.") : nope("Mục này đã bị xoá trước đó.");
}

// ---------------- Vòng đời đàn ----------------

// (dev/admin) đánh dấu đàn đã hết chu kỳ - để test màn kết chu kỳ mà không phải chờ
// đủ `cycleDays`. Áp dụng cho CẢ HAI dòng, y như việc nền (`lib/jobs.advanceFlocks`):
// trước đây hàm này chặn gà thịt, nên nhánh gà thịt không có cách nào thử.
export async function setEndOfLay(barnSlug: string): Promise<ActionResult> {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;

  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug }, include: { flock: true } });
  if (!barn.flock) return nope("Chuồng này chưa có đàn.");
  if (["END_OF_LAY", "HARVESTED", "RETIRED"].includes(barn.flock.stage)) return nope("Đàn này đã ở cuối chu kỳ hoặc đã có kết quả; không đặt lại giai đoạn.");

  const layer = barn.flock.productLine === "LAYER";
  const changed = await prisma.flock.updateMany({
    where: { id: barn.flock.id, stage: barn.flock.stage, version: barn.flock.version },
    data: { stage: "END_OF_LAY", version: { increment: 1 } },
  });
  if (changed.count !== 1) return nope("Đàn vừa đổi trạng thái. Tải lại trang nhé.");
  await stamp(barn.id, barn.workerId, "MILESTONE",
    layer ? "Đàn đã hoàn thành một chu kỳ đẻ trọn vẹn 🌾" : "Đàn đã tới ngày xuất chuồng 🌾");
  revalidateBarn(barnSlug);
  return ok(`${barn.label} đã chuyển sang ${layer ? "cuối chu kỳ đẻ" : "cuối lứa"}.`);
}

// CC-B01: gửi ý định; chỉ completeTask kèm proof được ghi outcome.
export async function decideEndOfLay(formData: FormData): Promise<ActionResult & { requestId?: string; taskId?: string }> {
  const barnSlug = String(formData.get("barn") ?? "");
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const choice = String(formData.get("choice") ?? "") as EndOfLayChoice;
  if (!["MEAT", "RETIRE", "RENEW"].includes(choice)) return nope("Lựa chọn không hợp lệ.");
  if (!gate.barn.ownerId) return nope("Chuồng này chưa có chủ.");
  const flockId = String(formData.get("flockId") ?? "");
  const flock = await prisma.flock.findUnique({ where: { id: flockId } });
  if (!flock || flock.barnId !== gate.barn.id) return nope("Không tìm thấy đàn của chuồng này.");
  // Cổng Family ở action và được đọc lại dưới khoá trong transaction.
  const duocChon = allowedLifecycleChoices(flock);
  // Cho retry đã hoàn tất trả kết quả cũ; service chỉ chấp nhận đúng actor/key/intent.
  if (!duocChon.includes(choice) && flock.stage === "END_OF_LAY") {
    return nope("Lựa chọn này không phù hợp với cam kết của đàn.");
  }
  let result;
  try {
    result = await prisma.$transaction((tx) => createLifecycleRequest(tx, {
      barnId: gate.barn.id, ownerId: gate.barn.ownerId!, requestedById: gate.userId,
      flockId, choice, expectedVersion: Number(formData.get("expectedVersion") ?? NaN),
      idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
      retireTermsAccepted: formData.get("retireTermsAccepted") === "true",
    }), { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof LifecycleError) return nope(error.message);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return nope("Mã yêu cầu đã được dùng cho một lựa chọn khác. Tải lại trang để xem yêu cầu hiện có.");
    }
    throw error;
  }
  if (result.created) {
    await track("end_of_lay_decided", {
      userId: gate.userId, barnSlug, props: { choice, phase: "REQUESTED" },
    });
    await notify({
      userId: gate.barn.workerUserId, kind: "TASK_NEW",
      title: `Chủ ${gate.barn.label} gửi yêu cầu ${choice === "MEAT" ? "nhận thịt" : "nghỉ hưu"}`,
      body: "Có việc mới chờ cô chú nhận, đối soát đàn và gửi minh chứng khi hoàn tất.",
      href: `/nong-trai/chuong/${barnSlug}#viec`,
    });
  }
  revalidateBarn(barnSlug);
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${barnSlug}`);
  return { ...ok(result.created ? "Đã gửi yêu cầu; đàn đang chờ cô chú xử lý." : "Yêu cầu này đã được ghi nhận."), ...result };
}

/** Chủ chỉ rút được ý định khi cô chú chưa nhận việc. */
export async function cancelLifecycleRequest(barnSlug: string, requestId: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const request = await prisma.lifecycleRequest.findUnique({
    where: { id: requestId }, include: { task: true },
  });
  if (!request || request.barnId !== gate.barn.id || request.ownerId !== gate.barn.ownerId || !request.task) {
    return nope("Không tìm thấy yêu cầu của chuồng này.");
  }
  let changed;
  try {
    changed = await prisma.$transaction(async (tx) => {
      const locked = await lockLifecycleTask(tx, request.task!.id, request.task!.workerId);
      const closed = await closeLifecycle(tx, locked, "CANCELLED", "Chủ chuồng rút yêu cầu trước khi nông dân nhận việc.");
      if (!closed) return false;
      const cas = await tx.barnTask.updateMany({
        where: { id: request.task!.id, status: "OPEN", workerId: request.task!.workerId },
        data: { status: "DECLINED", doneAt: new Date(), doneNote: "Chủ chuồng đã rút yêu cầu." },
      });
      if (cas.count !== 1) throw new LifecycleError("Việc vừa đổi trạng thái. Tải lại trang nhé.");
      await tx.farmUpdate.create({ data: {
        barnId: request.barnId, workerId: request.task!.workerId, kind: "NOTE",
        text: "Chủ chuồng đã rút yêu cầu kết chu kỳ; đàn vẫn được chăm bình thường.",
      } });
      return true;
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof LifecycleError) return nope(error.message);
    throw error;
  }
  if (changed) await notify({
    userId: gate.barn.workerUserId, kind: "MILESTONE", title: "Chủ chuồng đã rút yêu cầu kết chu kỳ",
    body: gate.barn.label, href: `/nong-trai/chuong/${barnSlug}`,
  });
  revalidateBarn(barnSlug);
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${barnSlug}`);
  return ok("Yêu cầu đã được rút; đàn vẫn được chăm bình thường.");
}
