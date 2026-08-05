"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RETIRE_CARE_VND, type EndOfLayChoice } from "@/data/catalog";
import {
  clampPlacement, normalizeMediaUrl, cleanLine,
  DECOR_TEXT, MAX_BARN_NAME, MAX_DECOR_PER_BARN,
  DECOR_VARIANTS, acceptsColor, acceptsVariant, isValidColor, isValidVariant,
} from "@/lib/decor";
import { getSessionUser } from "@/lib/auth";
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
  revalidatePath(`/chuong/${slug}/dan-ga`);
}

// ---------------- Cọc & kích hoạt chuồng ----------------
// Tiền vẫn đi ngoài app (chuyển khoản ngân hàng). Chuồng chỉ kích hoạt khi có xác nhận
// đã nhận tiền — hoặc admin bấm tay ở /admin, hoặc webhook SePay tự khớp mã.
// Cả hai đường đều đi qua `confirmReservationPaid` trong lib/payments.ts.

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
      href: `/nong-trai/chuong/${barnSlug}#viec`,
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

// ---------------- Tên chuồng ----------------

/**
 * Chủ chuồng đổi tên chuồng của mình.
 *
 * Tên là thứ hiện ở khắp nơi — thẻ chuồng, tiêu đề thông báo, biển tên trong hình vẽ,
 * hộp việc của nông dân — nên làm sạch ở ĐÂY một lần thay vì mỗi chỗ hiển thị tự lo:
 * bỏ ký tự vô hình, gộp khoảng trắng, cắt còn {@link MAX_BARN_NAME} ký tự
 * (cắt theo ký tự thật, emoji không bị vỡ đôi).
 *
 * Đổi tên KHÔNG tạo việc cho nông dân — chữ trên biển thật chỉ đổi khi chủ chuồng
 * chủ động sửa qua `setDecorText` (§9.2: app không tự đổi hiện thực).
 */
export async function renameBarn(barnSlug: string, raw: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  const label = cleanLine(raw, MAX_BARN_NAME);
  if (!label) return nope("Tên chuồng đang trống — đặt cho chuồng một cái tên nhé.");
  if (label === barn.label) return ok("Tên chuồng không có gì thay đổi.");

  await prisma.barn.update({ where: { id: barn.id }, data: { label } });
  revalidateBarn(barnSlug);
  revalidatePath("/tai-khoan");
  revalidatePath("/chuong");
  return ok(`Đã đổi tên thành "${label}".`);
}

// ---------------- Trang trí ----------------

/**
 * Lắp MỘT cái từ kho vào chuồng.
 *
 * "Kho" = số cái đã trả tiền trừ đi số cái đang nằm trong chuồng
 * ([lib/decor-store.decorStock](src/lib/decor-store.ts)). Gỡ ra thì về kho, lắp lại
 * không thu tiền lần hai; mua thêm thì kho tăng.
 *
 * Món chưa mua (hoặc đã lắp hết số đã mua) không đi lối này — phải qua
 * `decor-actions.createDecorOrder` rồi chờ tiền được xác nhận.
 */
export async function installDecor(barnSlug: string, itemSlug: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;
  const item = await prisma.decorItem.findUniqueOrThrow({ where: { slug: itemSlug } });

  // Yếm mặc lên GÀ, không lắp vào chuồng. Chặn ở đây chứ không chỉ ẩn nút: mỗi
  // "use server" là một endpoint công khai, ẩn nút chỉ là mỹ quan (§1.4).
  if (item.wearable) {
    return nope(`"${item.name}" là món mặc cho gà — mở trang "Đàn gà" để chọn con nhé.`);
  }

  // Decor là món trả phí — chỉ mở khi cọc chuồng đã được đối soát
  if (!(await barnActivated(barn.id))) {
    return nope("Chuồng chưa kích hoạt — hoàn tất cọc giữ chỗ trước rồi trang trí nhé.");
  }

  // Cổng THẬT của luật "trả tiền rồi mới decor được" — chặn ở giao diện chỉ là mỹ quan.
  const stock = await decorStock(barn.id);
  const s = stock.get(item.id);
  if (!s || s.owned === 0) {
    return nope(`"${item.name}" chưa được thanh toán — đặt mua rồi nông trại xác nhận là lắp được ngay.`);
  }
  if (s.free === 0) {
    return nope(`Bạn đã lắp hết ${s.owned} cái "${item.name}" đã mua. Mua thêm là lắp tiếp được.`);
  }

  const total = [...stock.values()].reduce((n, x) => n + x.installed, 0);
  if (total >= MAX_DECOR_PER_BARN) {
    return nope(`Một chuồng lắp tối đa ${MAX_DECOR_PER_BARN} món — gỡ bớt một món rồi thêm nhé.`);
  }

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

/**
 * Gỡ MỘT cái ra khỏi chuồng. Nhận `decorId` chứ không phải slug: một chuồng có thể
 * có nhiều bản cùng loại, slug không nói được đang gỡ cái nào.
 *
 * Gỡ ra là món **về kho**, không mất tiền — lắp lại bất cứ lúc nào.
 */
export async function removeDecor(barnSlug: string, decorId: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  // Lọc kèm barnId: không cho gỡ món của chuồng người khác dù đoán đúng id.
  const row = await prisma.barnDecor.findFirst({
    where: { id: decorId, barnId: barn.id },
    select: { id: true, item: { select: { name: true } } },
  });
  if (!row) return nope("Món này không còn trong chuồng.");

  await prisma.barnDecor.delete({ where: { id: row.id } });
  await requestDecorWork(barn, gate.userId, `Gỡ "${row.item.name}" khỏi chuồng.`);
  revalidateBarn(barnSlug);
  return ok(`Đã gỡ "${row.item.name}" — món về lại kho của bạn, lắp lại lúc nào cũng được.`);
}

/**
 * Đổi chữ trên một món có mặt chữ (biển tên, bảng phấn).
 *
 * Độ dài tối đa tra theo `svgKey` trong `DECOR_TEXT` — mỗi hình vẽ có chỗ chứa chữ
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

  const row = await prisma.barnDecor.findFirst({
    where: { id: decorId, barnId: barn.id },
    select: { id: true, text: true, item: { select: { name: true, svgKey: true } } },
  });
  if (!row) return nope("Không tìm thấy món này trong chuồng.");

  const max = DECOR_TEXT[row.item.svgKey];
  if (!max) return nope(`"${row.item.name}" không có mặt chữ để khắc.`);

  const text = cleanLine(raw, max) || null;
  if (text === row.text) return ok("Chữ không có gì thay đổi.");

  await prisma.barnDecor.update({ where: { id: row.id }, data: { text } });
  await requestDecorWork(
    barn, gate.userId,
    text
      ? `Khắc lại "${row.item.name}" thành: ${text}`
      : `Trả "${row.item.name}" về chữ mặc định (tên chuồng).`,
  );
  revalidateBarn(barnSlug);
  return text
    ? ok(`Đã đổi chữ thành "${text}" — nông dân sẽ khắc đúng như vậy rồi gửi ảnh.`)
    : ok("Đã trả về chữ mặc định là tên chuồng.");
}

/**
 * Đổi MÀU và/hoặc KIỂU DÁNG của một cái đã lắp (hàng rào, chong chóng).
 *
 * Nhận `BarnDecor.id` chứ không phải slug — mua 5 đoạn hàng rào thì mỗi đoạn sơn một
 * màu, chọn một kiểu; slug chỉ nói được "loại món", không nói được "đoạn nào" (§9.23).
 * Truy vấn LUÔN lọc kèm `barnId` nên đoán trúng id của chuồng khác cũng vô ích.
 *
 * Màu và kiểu phải nằm trong danh sách đóng của `lib/decor` — KHÔNG nhận mã màu tự do:
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

  const row = await prisma.barnDecor.findFirst({
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

  // Không đổi gì thì đừng ghi DB và đừng làm phiền nông dân — cùng nguyên tắc với
  // `saveDecorLayout` (so từng món, không đổi thì không ghi).
  if (doi.length === 0) return ok("Không có gì thay đổi.");

  await prisma.barnDecor.update({ where: { id: row.id }, data });
  await requestDecorWork(barn, gate.userId, `"${row.item.name}": ${doi.join(", ")}.`);
  revalidateBarn(barnSlug);
  return ok(`Đã ${doi.join(", ")} — nông dân sẽ làm đúng như vậy rồi gửi ảnh.`);
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
      href: `/nong-trai/chuong/${barn.slug}#viec`,
    });
  }
  revalidatePath("/nong-trai");
}

/** Một món trong bản vẽ. `id` là `BarnDecor.id` — KHÔNG phải slug: một chuồng có thể
 *  có nhiều bản cùng loại, slug không nói được đang xếp cái nào. */
export type DecorPlacement = { id: string; x: number; y: number; scale: number; z: number; flipped: boolean };

/** Lưu bố cục người dùng tự sắp. Idempotent: lưu lại cùng bố cục không đổi gì thêm. */
export async function saveDecorLayout(barnSlug: string, layout: DecorPlacement[]): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  const installed = await prisma.barnDecor.findMany({ where: { barnId: barn.id } });
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

// ---------------- Yếm cho gà ----------------
//
// Yếm gắn vào TỪNG CON (`BirdGear`), không gắn vào chuồng. Lý do ở model BirdGear:
// app cho đặt tên từng con mái nhưng trong ảnh không ai phân biệt được con nào —
// yếm màu là thứ biến cái tên thành dấu hiệu nhìn thấy được.
//
// §9.2 nguyên vẹn: hai action dưới đây CHỈ đổi ý định (PENDING_ON / PENDING_OFF) và
// tạo việc. Trạng thái thật (WORN / OFF) chỉ đặt trong `worker-actions.completeTask`,
// sau khi nông dân mặc/tháo ngoài đời rồi chụp ảnh — y hệt `Barn.outside`.

/** Gộp một việc GEAR cho cả đàn, kèm ghi chú liệt kê từng con. Không dội chuông. */
async function requestGearWork(barn: OwnedBarn, userId: string, note: string) {
  if (!barn.workerId) return;
  const { created } = await upsertTask({
    barnId: barn.id, workerId: barn.workerId, requestedById: userId,
    kind: "GEAR", title: TASK_META.GEAR.label, note,
  });
  if (created) {
    await notify({
      userId: barn.workerUserId,
      kind: "TASK_NEW",
      title: `${TASK_META.GEAR.emoji} Việc mới: ${TASK_META.GEAR.label}`,
      body: `${barn.label} · ${note}`,
      href: `/nong-trai/chuong/${barn.slug}#viec`,
    });
  }
  revalidatePath("/nong-trai");
}

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

  if (!(await barnActivated(barn.id))) {
    return nope("Chuồng chưa kích hoạt — hoàn tất cọc giữ chỗ trước nhé.");
  }

  const item = await prisma.decorItem.findUnique({ where: { slug: itemSlug } });
  if (!item) return nope("Không tìm thấy món này — tải lại trang giúp mình nhé.");
  if (!item.wearable) return nope(`"${item.name}" không phải món mặc cho gà.`);

  // Con gà phải thuộc đúng chuồng này, và đàn phải là gà ĐẺ: broiler không đặt tên
  // từng con, mặc yếm cho gà thịt là vô nghĩa.
  const bird = await prisma.bird.findFirst({
    where: { id: birdId, flock: { barnId: barn.id } },
    select: {
      id: true, name: true, tagCode: true, status: true,
      flock: { select: { productLine: true } },
    },
  });
  if (!bird) return nope("Con này không thuộc đàn của chuồng bạn.");
  if (bird.flock.productLine !== "LAYER") {
    return nope("Yếm chỉ dành cho đàn gà đẻ — đàn gà thịt không đặt tên từng con.");
  }
  if (bird.status !== "ALIVE") return nope("Con này không còn trong đàn.");

  // Một con một yếm. Đang chờ mặc / đang đeo / đang chờ tháo đều tính là đã có.
  const busy = await prisma.birdGear.findFirst({
    where: { birdId: bird.id, status: { not: "OFF" } },
    select: { id: true, item: { select: { name: true } } },
  });
  if (busy) {
    return nope(`Con này đang có "${busy.item.name}" — tháo cái cũ ra rồi mặc cái mới nhé.`);
  }

  // Cổng THẬT của luật trả tiền trước: kho = đã mua − đang lắp − đang đeo (§9.18).
  const stock = await decorStock(barn.id);
  const s = stock.get(item.id);
  if (!s || s.owned === 0) {
    return nope(`"${item.name}" chưa được thanh toán — đặt mua ở trang Trang trí, nông trại xác nhận là mặc được ngay.`);
  }
  if (s.free === 0) {
    return nope(`Bạn đã dùng hết ${s.owned} cái "${item.name}". Mua thêm là mặc tiếp được.`);
  }

  const who = bird.name?.trim() || `con ${bird.tagCode}`;
  await prisma.birdGear.create({ data: { birdId: bird.id, itemId: item.id } });
  await requestGearWork(barn, gate.userId, `Mặc "${item.name}" cho ${who}.`);
  await track("gear_worn", {
    userId: gate.userId, barnSlug,
    props: { itemSlug: item.slug, itemName: item.name, birdId: bird.id },
  });

  revalidateBarn(barnSlug);
  return ok(`Đã nhắn nông dân mặc "${item.name}" cho ${who} — xong sẽ có ảnh gửi về.`);
}

/**
 * Tháo yếm khỏi một con. Nhận `gearId` (`BirdGear.id`) và vẫn lọc kèm chuồng.
 *
 * Yếm về kho khi nông dân tháo THẬT, không phải lúc bấm nút — nên trạng thái ở đây
 * chỉ là `PENDING_OFF` và `decorStock` vẫn tính nó là đang chiếm chỗ.
 */
export async function removeGear(barnSlug: string, gearId: string): Promise<ActionResult> {
  const gate = await ownedBarn(barnSlug);
  if ("deny" in gate) return gate.deny;
  const { barn } = gate;

  const row = await prisma.birdGear.findFirst({
    where: { id: gearId, bird: { flock: { barnId: barn.id } }, status: { not: "OFF" } },
    select: {
      id: true, status: true,
      item: { select: { name: true } },
      bird: { select: { name: true, tagCode: true } },
    },
  });
  if (!row) return nope("Yếm này không còn trên đàn của bạn.");
  if (row.status === "PENDING_OFF") return nope("Bạn đã nhờ tháo cái này rồi — nông dân đang xử lý.");

  const who = row.bird.name?.trim() || `con ${row.bird.tagCode}`;

  // Chưa mặc thật (PENDING_ON) thì rút yêu cầu là xong — xoá hẳn, yếm về kho ngay,
  // không phiền nông dân đi tháo một cái chưa bao giờ được mặc.
  if (row.status === "PENDING_ON") {
    await prisma.birdGear.delete({ where: { id: row.id } });
    revalidateBarn(barnSlug);
    return ok(`Đã rút yêu cầu mặc "${row.item.name}" cho ${who} — yếm về lại kho.`);
  }

  await prisma.birdGear.update({ where: { id: row.id }, data: { status: "PENDING_OFF" } });
  await requestGearWork(barn, gate.userId, `Tháo "${row.item.name}" khỏi ${who}.`);
  revalidateBarn(barnSlug);
  return ok(`Đã nhắn nông dân tháo "${row.item.name}" khỏi ${who}.`);
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
    href: `/nong-trai/chuong/${barnSlug}#viec`,
  });

  revalidateBarn(barnSlug);
  redirect(`/chuong/${barnSlug}`);
}
