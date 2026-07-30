"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RETIRE_CARE_VND, type EndOfLayChoice } from "@/data/catalog";
import { clampPlacement, normalizeMediaUrl } from "@/lib/decor";

const UPDATE_KINDS = ["NOTE", "PHOTO", "VIDEO", "CARE", "HEALTH", "DECOR", "MILESTONE", "RANGE"] as const;
type UpdateKind = (typeof UPDATE_KINDS)[number];

/** Kết quả trả về cho client để hiện toast. */
export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

function revalidateBarn(slug: string) {
  revalidatePath(`/chuong/${slug}`);
  revalidatePath(`/chuong/${slug}/trang-tri`);
  revalidatePath(`/chuong/${slug}/nhat-ky`);
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

// ---------------- Thả vườn / về chuồng ----------------

export async function toggleRange(barnSlug: string): Promise<ActionResult> {
  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug }, include: { flock: true } });
  if (barn.flock?.stage === "HARVESTED" || barn.flock?.stage === "RETIRED") {
    return nope("Đàn đã khép lại chu kỳ — không đổi được nữa.");
  }

  const outside = !barn.outside;
  await prisma.barn.update({ where: { id: barn.id }, data: { outside } });
  await stamp(barn.id, barn.workerId, "RANGE",
    outside ? "Đã lùa đàn ra vườn cho gà chạy nhặt sâu, ăn cỏ 🌿" : "Đã gọi đàn về chuồng an toàn, đếm đủ 🏡");
  revalidateBarn(barnSlug);
  return ok(outside ? "Đã cho đàn ra vườn 🌿" : "Đã gọi đàn về chuồng 🏡");
}

// ---------------- Trang trí ----------------

/** Lắp một món decor. Gọi lại nhiều lần cũng chỉ lắp một lần, không spam nhật ký. */
export async function installDecor(barnSlug: string, itemSlug: string): Promise<ActionResult> {
  const [barn, item] = await Promise.all([
    prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug } }),
    prisma.decorItem.findUniqueOrThrow({ where: { slug: itemSlug } }),
  ]);

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
  await stamp(barn.id, barn.workerId, "DECOR",
    `Đã lắp "${item.name}" vào chuồng bạn xong rồi nhé! Gửi bạn tấm ảnh 📸`);
  revalidateBarn(barnSlug);
  return ok(`Đã thêm "${item.name}" — kéo tới chỗ bạn muốn rồi lưu nhé.`);
}

export async function removeDecor(barnSlug: string, itemSlug: string): Promise<ActionResult> {
  const [barn, item] = await Promise.all([
    prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug } }),
    prisma.decorItem.findUniqueOrThrow({ where: { slug: itemSlug } }),
  ]);
  const { count } = await prisma.barnDecor.deleteMany({ where: { barnId: barn.id, itemId: item.id } });
  if (count === 0) return nope("Món này không còn trong chuồng.");

  await stamp(barn.id, barn.workerId, "DECOR", `Đã tháo "${item.name}" khỏi chuồng theo yêu cầu của bạn.`);
  revalidateBarn(barnSlug);
  return ok(`Đã gỡ "${item.name}" khỏi chuồng.`);
}

export type DecorPlacement = { itemSlug: string; x: number; y: number; scale: number; z: number; flipped: boolean };

/** Lưu bố cục người dùng tự sắp. Idempotent: lưu lại cùng bố cục không đổi gì thêm. */
export async function saveDecorLayout(barnSlug: string, layout: DecorPlacement[]): Promise<ActionResult> {
  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug } });
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

  if (writes.length) await prisma.$transaction(writes);
  revalidateBarn(barnSlug);
  return ok(
    writes.length === 0
      ? "Bố cục không có gì thay đổi."
      : `Đã lưu bố cục — ${writes.length} món được xếp lại. Nông trại sẽ lắp đúng như vậy.`,
  );
}

/** Trả bố cục về vị trí gợi ý ban đầu của từng món. */
export async function resetDecorLayout(barnSlug: string): Promise<ActionResult> {
  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug } });
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
  revalidateBarn(barnSlug);
  return ok("Đã đưa mọi món về vị trí mặc định.");
}

// ---------------- Nhật ký & media ----------------

export async function postUpdate(barnSlug: string, text: string, kind: string): Promise<ActionResult> {
  const barn = await prisma.barn.findUnique({ where: { slug: barnSlug } });
  const body = text.trim().slice(0, 1000);
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (!barn.workerId) return nope("Chuồng chưa có nông dân phụ trách.");
  if (!body) return nope("Nội dung cập nhật đang trống.");

  const k = (UPDATE_KINDS as readonly string[]).includes(kind) ? (kind as UpdateKind) : "NOTE";
  await stamp(barn.id, barn.workerId, k, body);
  revalidateBarn(barnSlug);
  return ok(`Đã đăng cập nhật lên ${barn.label}.`);
}

/** Admin: gắn ảnh/video cho một chuồng bằng URL (Supabase Storage, YouTube…). */
export async function addMedia(formData: FormData): Promise<ActionResult> {
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
  revalidateBarn(barnSlug);
  return ok(`Đã gửi ${type === "VIDEO" ? "video" : "ảnh"} lên ${barn.label}.`);
}

export async function deleteMedia(id: string, barnSlug: string): Promise<ActionResult> {
  const { count } = await prisma.barnMedia.deleteMany({ where: { id } });
  revalidateBarn(barnSlug);
  return count > 0 ? ok("Đã xoá khỏi chuồng.") : nope("Mục này đã bị xoá trước đó.");
}

// ---------------- Vòng đời đàn ----------------

// (dev/admin) đánh dấu đàn layer đã hết chu kỳ đẻ — để test màn kết chu kỳ
export async function setEndOfLay(barnSlug: string): Promise<ActionResult> {
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

  revalidateBarn(barnSlug);
  redirect(`/chuong/${barnSlug}`);
}
