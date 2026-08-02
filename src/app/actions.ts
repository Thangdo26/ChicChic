"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RETIRE_CARE_VND, type EndOfLayChoice } from "@/data/catalog";
import { clampPlacement, normalizeMediaUrl, transferCode } from "@/lib/decor";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { track } from "@/lib/track";
import { upsertTask } from "@/lib/task-store";
import { TASK_META } from "@/lib/tasks";

const UPDATE_KINDS = ["NOTE", "PHOTO", "VIDEO", "CARE", "HEALTH", "DECOR", "MILESTONE", "RANGE"] as const;
type UpdateKind = (typeof UPDATE_KINDS)[number];

/** Kết quả trả về cho client để hiện toast. */
export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

type OwnedBarn = {
  id: string; slug: string; label: string;
  workerId: string | null; ownerId: string | null; outside: boolean;
  /** Tài khoản đăng nhập của nông dân phụ trách — để đẩy thông báo lên chuông của họ. */
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
  if (row.ownerId !== me.id && me.role !== "ADMIN") {
    return { deny: nope("Chuồng này không thuộc tài khoản của bạn.") };
  }
  const { worker, ...barn } = row;
  return { barn: { ...barn, workerUserId: worker?.userId ?? null }, userId: me.id };
}

/**
 * Cổng cho các thao tác của nông trại (/admin).
 * middleware.ts chỉ khoá việc RENDER trang /admin — mỗi "use server" là một endpoint
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
}

/** Đóng dấu tên nông dân lên nhật ký. Bỏ qua nếu vừa đăng đúng nội dung đó (chống double-submit). */
async function stamp(barnId: string, workerId: string | null, kind: UpdateKind, text: string) {
  if (!workerId) return;
  const dup = await prisma.farmUpdate.findFirst({
    where: { barnId, text, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (dup) return;
  await prisma.farmUpdate.create({ data: { barnId, workerId, kind, text } });
}

// ---------------- Cọc & kích hoạt chuồng ----------------
// Thanh toán vẫn NGOÀI app (chuyển khoản/MoMo, đối soát tay) — app chỉ theo dõi trạng thái.

/** Người dùng bấm "Tôi đã chuyển khoản" → chuyển sang chờ đối soát. Bấm lại là no-op. */
export async function reportTransfer(barnSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;

  const r = await prisma.reservation.findUnique({ where: { barnId: gate.barn.id } });
  if (!r) return nope("Chuồng này không có đơn giữ chỗ.");
  if (r.paymentStatus === "CONFIRMED") return nope("Cọc của chuồng này đã được xác nhận rồi.");
  if (r.paymentStatus === "REPORTED") return nope("Bạn đã báo chuyển khoản rồi — nông trại đang đối soát.");

  await prisma.reservation.update({
    where: { id: r.id },
    data: { paymentStatus: "REPORTED", reportedAt: new Date() },
  });
  await track("deposit_reported", {
    userId: gate.userId, barnSlug,
    props: { depositVnd: r.depositVnd, priceEstimateVnd: r.priceEstimateVnd },
  });
  revalidateBarn(barnSlug);
  return ok("Đã ghi nhận! Nông trại sẽ đối soát và kích hoạt chuồng — thường trong vài giờ làm việc.");
}

/** Admin xác nhận đã nhận tiền → kích hoạt chuồng. Idempotent. */
export async function confirmPayment(reservationId: string): Promise<ActionResult> {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;

  const r = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { barn: true } });
  if (!r) return nope("Không tìm thấy đơn này.");
  if (r.paymentStatus === "CONFIRMED") return nope("Đơn này đã được xác nhận trước đó.");

  await prisma.reservation.update({
    where: { id: r.id },
    data: { paymentStatus: "CONFIRMED", paidAt: new Date(), status: "CONFIRMED" },
  });
  // Tử số của "conversion xem → trả tiền thật" (playbook §7.3 chỉ số 1).
  await track("deposit_confirmed", {
    userId: r.userId, barnSlug: r.barn?.slug,
    props: {
      depositVnd: r.depositVnd,
      priceEstimateVnd: r.priceEstimateVnd,
      productLine: r.productLine,
      healthPlanOptIn: r.healthPlanOptIn,
      // Bao lâu từ lúc giữ chỗ tới lúc tiền về — đo được ma sát của khâu chuyển khoản tay.
      hoursToPay: Math.round((Date.now() - r.createdAt.getTime()) / 3_600_000),
    },
  });
  if (r.barn) {
    await stamp(r.barn.id, r.barn.workerId, "MILESTONE",
      "Đã nhận được cọc của bạn — chuồng chính thức kích hoạt! Mình bắt tay vào chuẩn bị đàn nhé 🎉");
    await notify({
      userId: r.barn.ownerId,
      kind: "PAYMENT",
      title: "💰 Nông trại đã nhận cọc — chuồng kích hoạt!",
      body: `${r.barn.label} · trang trí đã mở khoá, bắt đầu xếp đặt được rồi.`,
      href: `/chuong/${r.barn.slug}`,
    });
    revalidateBarn(r.barn.slug);
  }
  revalidatePath("/admin");
  return ok(`Đã xác nhận cọc ${transferCode(r.id)} — chuồng kích hoạt.`);
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
    return nope("Đàn đã khép lại chu kỳ — không đổi được nữa.");
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
      href: `/nong-trai/chuong/${barnSlug}`,
    });
  }

  revalidateBarn(barnSlug);
  revalidatePath("/nong-trai");
  if (!created) return nope(`Yêu cầu "${meta.label}" đang chờ nông dân làm rồi.`);
  return ok(
    barn.outside
      ? "Đã nhắn nông dân gọi đàn về chuồng 🏡 — xong sẽ có ảnh gửi về."
      : "Đã nhắn nông dân thả đàn ra vườn 🌿 — xong sẽ có ảnh gửi về.",
  );
}

// ---------------- Trang trí ----------------

/** Lắp một món decor. Gọi lại nhiều lần cũng chỉ lắp một lần, không spam nhật ký. */
export async function installDecor(barnSlug: string, itemSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  const item = await prisma.decorItem.findUniqueOrThrow({ where: { slug: itemSlug } });

  // Decor là món trả phí — chỉ mở khi cọc chuồng đã được đối soát
  if (!(await barnActivated(barn.id))) {
    return nope("Chuồng chưa kích hoạt — hoàn tất cọc giữ chỗ trước rồi trang trí nhé.");
  }

  const existing = await prisma.barnDecor.findUnique({
    where: { barnId_itemId: { barnId: barn.id, itemId: item.id } },
    select: { id: true },
  });
  if (existing) return nope(`"${item.name}" đã có trong chuồng rồi.`); // no-op

  const top = await prisma.barnDecor.aggregate({ where: { barnId: barn.id }, _max: { z: true } });
  const pos = clampPlacement({ x: item.defaultX, y: item.defaultY, scale: 1 });

  await prisma.barnDecor.create({
    data: { barnId: barn.id, itemId: item.id, ...pos, z: (top._max.z ?? 0) + 1 },
  });
  await requestDecorWork(barn, gate.userId);
  // Chỉ số 4 của playbook §7.3: tỉ lệ mua decor và ảnh hưởng lên giữ chân.
  await track("decor_installed", {
    userId: gate.userId, barnSlug,
    props: { itemSlug: item.slug, itemName: item.name, priceVnd: item.priceVnd },
  });
  revalidateBarn(barnSlug);
  return ok(`Đã thêm "${item.name}" — kéo tới chỗ bạn muốn rồi bấm lưu, nông dân sẽ lắp thật theo đó.`);
}

export async function removeDecor(barnSlug: string, itemSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  const item = await prisma.decorItem.findUniqueOrThrow({ where: { slug: itemSlug } });

  const { count } = await prisma.barnDecor.deleteMany({ where: { barnId: barn.id, itemId: item.id } });
  if (count === 0) return nope("Món này không còn trong chuồng.");

  await requestDecorWork(barn, gate.userId, `Gỡ "${item.name}" khỏi chuồng.`);
  revalidateBarn(barnSlug);
  return ok(`Đã gỡ "${item.name}" — nông dân sẽ tháo ở chuồng thật.`);
}

/**
 * Mọi thay đổi trang trí đều phải có người ra chuồng lắp thật.
 * Gộp về MỘT việc "Lắp trang trí" đang chờ, thay vì mỗi món một việc.
 */
async function requestDecorWork(barn: OwnedBarn, userId: string, note?: string) {
  if (!barn.workerId) return;
  const count = await prisma.barnDecor.count({ where: { barnId: barn.id } });
  const body = note ?? `Bố cục mới có ${count} món — lắp đúng vị trí trong bản vẽ của chủ chuồng.`;
  const { created } = await upsertTask({
    barnId: barn.id, workerId: barn.workerId, requestedById: userId,
    kind: "DECOR", title: TASK_META.DECOR.label, note: body,
  });
  // Gộp vào việc DECOR đang chờ thì không báo lại lần nữa — tránh dội chuông.
  if (created) {
    await notify({
      userId: barn.workerUserId,
      kind: "TASK_NEW",
      title: `${TASK_META.DECOR.emoji} Việc mới: ${TASK_META.DECOR.label}`,
      body: `${barn.label} · ${body}`,
      href: `/nong-trai/chuong/${barn.slug}`,
    });
  }
  revalidatePath("/nong-trai");
}

export type DecorPlacement = { itemSlug: string; x: number; y: number; scale: number; z: number; flipped: boolean };

/** Lưu bố cục người dùng tự sắp. Idempotent: lưu lại cùng bố cục không đổi gì thêm. */
export async function saveDecorLayout(barnSlug: string, layout: DecorPlacement[]): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  const installed = await prisma.barnDecor.findMany({
    where: { barnId: barn.id }, include: { item: { select: { slug: true } } },
  });
  const bySlug = new Map(installed.map((d) => [d.item.slug, d]));

  const writes = layout.flatMap((p) => {
    const row = bySlug.get(p.itemSlug);
    if (!row) return []; // client gửi món chưa lắp → bỏ qua, không tin client
    const pos = clampPlacement(p);
    const z = Math.max(0, Math.min(999, Math.round(Number(p.z) || 0)));
    const flipped = !!p.flipped;
    if (row.x === pos.x && row.y === pos.y && row.scale === pos.scale && row.z === z && row.flipped === flipped) {
      return []; // không đổi → khỏi ghi
    }
    return [prisma.barnDecor.update({ where: { id: row.id }, data: { ...pos, z, flipped } })];
  });

  if (writes.length === 0) {
    revalidateBarn(barnSlug);
    return ok("Bố cục không có gì thay đổi.");
  }

  await prisma.$transaction(writes);
  await requestDecorWork(barn, gate.userId, `Xếp lại ${writes.length} món theo bản vẽ mới của chủ chuồng.`);
  revalidateBarn(barnSlug);
  return ok(`Đã lưu bố cục — ${writes.length} món được xếp lại. Nông dân sẽ lắp đúng như vậy rồi gửi ảnh.`);
}

/** Trả bố cục về vị trí gợi ý ban đầu của từng món. */
export async function resetDecorLayout(barnSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  const rows = await prisma.barnDecor.findMany({ where: { barnId: barn.id }, include: { item: true } });
  if (rows.length === 0) return nope("Chuồng chưa có món nào để xếp lại.");

  await prisma.$transaction(
    rows.map((r, i) =>
      prisma.barnDecor.update({
        where: { id: r.id },
        data: { ...clampPlacement({ x: r.item.defaultX, y: r.item.defaultY, scale: 1 }), z: i + 1, flipped: false },
      }),
    ),
  );
  await requestDecorWork(barn, gate.userId, "Đưa mọi món về vị trí mặc định.");
  revalidateBarn(barnSlug);
  return ok("Đã đưa mọi món về vị trí mặc định.");
}

// ---------------- Nhật ký & media ----------------

export async function postUpdate(barnSlug: string, text: string, kind: string): Promise<ActionResult> {
  // Ghi chép này ĐÓNG DẤU TÊN NÔNG DÂN — để hở là ai cũng giả mạo được nhật ký.
  const deny = await denyIfNotAdmin();
  if (deny) return deny;

  const barn = await prisma.barn.findUnique({ where: { slug: barnSlug } });
  const body = text.trim().slice(0, 1000);
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (!barn.workerId) return nope("Chuồng chưa có nông dân phụ trách.");
  if (!body) return nope("Nội dung cập nhật đang trống.");

  const k = (UPDATE_KINDS as readonly string[]).includes(kind) ? (kind as UpdateKind) : "NOTE";
  await stamp(barn.id, barn.workerId, k, body);
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
  if (!url) return nope("URL không hợp lệ — cần bắt đầu bằng https:// hoặc /");

  // Cùng chuồng + cùng URL trong 1 phút → coi như double-submit
  const dup = await prisma.barnMedia.findFirst({
    where: { barnId: barn.id, url, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (dup) return nope("Vừa gửi đúng đường dẫn này rồi — không thêm trùng.");

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

// (dev/admin) đánh dấu đàn layer đã hết chu kỳ đẻ — để test màn kết chu kỳ
export async function setEndOfLay(barnSlug: string): Promise<ActionResult> {
  const deny = await denyIfNotAdmin();
  if (deny) return deny;

  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug }, include: { flock: true } });
  if (!barn.flock || barn.flock.productLine !== "LAYER") return nope("Chỉ áp dụng cho chuồng gà đẻ.");
  if (barn.flock.stage === "END_OF_LAY") return nope("Đàn này đã ở cuối chu kỳ rồi.");

  await prisma.flock.update({ where: { id: barn.flock.id }, data: { stage: "END_OF_LAY" } });
  await stamp(barn.id, barn.workerId, "MILESTONE", "Đàn đã hoàn thành một chu kỳ đẻ trọn vẹn 🌾");
  revalidateBarn(barnSlug);
  return ok(`${barn.label} đã chuyển sang cuối chu kỳ đẻ.`);
}

// Quyết định cuối chu kỳ đẻ: thịt / nghỉ hưu / nuôi lứa mới (form-based)
export async function decideEndOfLay(formData: FormData) {
  const barnSlug = String(formData.get("barn"));
  const choice = String(formData.get("choice")) as EndOfLayChoice;
  if (!["MEAT", "RETIRE", "RENEW"].includes(choice)) return;

  // Đây là quyết định mổ thịt / cho nghỉ hưu đàn gà — CHỈ chủ chuồng được chọn.
  // Form không hiện toast được, nên từ chối bằng cách đưa về trang chuồng.
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) redirect(`/chuong/${barnSlug}`);

  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug }, include: { flock: true } });
  // Guard: chỉ quyết định được khi đàn đang thực sự ở cuối chu kỳ.
  // Bấm 2 lần / F5 lại form cũ → lần sau rơi vào đây và không làm gì thêm.
  if (!barn.flock || barn.flock.stage !== "END_OF_LAY") redirect(`/chuong/${barnSlug}`);

  const flockId = barn.flock.id;
  await prisma.lifecycleDecision.create({
    data: { barnId: barn.id, flockId, choice, retireFeeVnd: choice === "RETIRE" ? RETIRE_CARE_VND : 0 },
  });

  if (choice === "MEAT") {
    await prisma.bird.updateMany({ where: { flockId }, data: { status: "HARVESTED" } });
    await prisma.flock.update({ where: { id: flockId }, data: { stage: "HARVESTED" } });
    await stamp(barn.id, barn.workerId, "MILESTONE",
      "Đàn được sơ chế theo đúng quy định giết mổ & kiểm dịch, chuẩn bị gửi về bạn. Cảm ơn một mùa đẻ 🍲");
  } else if (choice === "RETIRE") {
    await prisma.bird.updateMany({ where: { flockId }, data: { status: "RETIRED" } });
    await prisma.flock.update({ where: { id: flockId }, data: { stage: "RETIRED" } });
    await stamp(barn.id, barn.workerId, "MILESTONE", "Các bạn gà được ở lại vườn nhà cô Lan, sống tiếp an nhàn 🌾");
  } else {
    // giữ 1 flock/chuồng: reset flock hiện tại thành lứa layer mới
    await prisma.bird.deleteMany({ where: { flockId } });
    await prisma.product.deleteMany({ where: { flockId } });
    await prisma.flock.update({
      where: { id: flockId },
      data: {
        stage: "LAYING", startDate: new Date(),
        birds: { create: Array.from({ length: 5 }, (_, i) => ({ tagCode: `NEW-${String(i + 1).padStart(2, "0")}`, status: "ALIVE" as const })) },
        products: { create: [{ type: "EGG", qty: 0 }] },
      },
    });
    await stamp(barn.id, barn.workerId, "MILESTONE", "Bắt đầu một lứa mới trong chuồng của bạn — hãy đặt tên cho các bạn gà nhé 🐣");
  }

  // Khẩu vị thật của người dùng ở điểm cảm xúc căng nhất sản phẩm (playbook §2.3.5) —
  // đo bằng lựa chọn thật, không phải bằng câu trả lời phỏng vấn.
  await track("end_of_lay_decided", {
    userId: gate.userId, barnSlug,
    props: { choice, retireFeeVnd: choice === "RETIRE" ? RETIRE_CARE_VND : 0 },
  });

  // Nông dân phải biết để chuẩn bị ngoài đời (mổ / giữ lại / vào lứa mới).
  const CHOICE_VI: Record<EndOfLayChoice, string> = {
    MEAT: "nhận thịt", RETIRE: "cho đàn nghỉ hưu ở nông trại", RENEW: "nuôi một lứa mới",
  };
  await notify({
    userId: await workerUserIdOfBarn(barn.id),
    kind: "MILESTONE",
    title: `Chủ ${barn.label} đã chọn: ${CHOICE_VI[choice]}`,
    body: "Kết chu kỳ đẻ — cô/chú chuẩn bị giúp phần việc ngoài đời nhé.",
    href: `/nong-trai/chuong/${barnSlug}`,
  });

  revalidateBarn(barnSlug);
  redirect(`/chuong/${barnSlug}`);
}
