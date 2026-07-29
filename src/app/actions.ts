"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { RETIRE_CARE_VND, type EndOfLayChoice } from "@/data/catalog";

export async function toggleRange(barnSlug: string) {
  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug }, include: { worker: true } });
  const outside = !barn.outside;
  await prisma.barn.update({ where: { id: barn.id }, data: { outside } });
  if (barn.workerId) {
    await prisma.farmUpdate.create({
      data: {
        barnId: barn.id, workerId: barn.workerId, kind: "RANGE",
        text: outside ? "Đã lùa đàn ra vườn cho gà chạy nhặt sâu, ăn cỏ 🌿" : "Đã gọi đàn về chuồng an toàn, đếm đủ 🏡",
      },
    });
  }
  revalidatePath(`/chuong/${barnSlug}`);
}

export async function installDecor(barnSlug: string, itemSlug: string) {
  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug } });
  const item = await prisma.decorItem.findUniqueOrThrow({ where: { slug: itemSlug } });
  await prisma.barnDecor.upsert({
    where: { barnId_itemId: { barnId: barn.id, itemId: item.id } },
    update: {}, create: { barnId: barn.id, itemId: item.id },
  });
  if (barn.workerId) {
    await prisma.farmUpdate.create({
      data: { barnId: barn.id, workerId: barn.workerId, kind: "DECOR", text: `Đã lắp "${item.name}" vào chuồng bạn xong rồi nhé! Gửi bạn tấm ảnh 📸` },
    });
  }
  revalidatePath(`/chuong/${barnSlug}`);
  revalidatePath(`/chuong/${barnSlug}/trang-tri`);
}

export async function postUpdate(barnSlug: string, text: string, kind: string) {
  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug } });
  if (!barn.workerId || !text.trim()) return;
  await prisma.farmUpdate.create({ data: { barnId: barn.id, workerId: barn.workerId, kind: kind as any, text } });
  revalidatePath(`/chuong/${barnSlug}`);
}

// (dev/admin) đánh dấu đàn layer đã hết chu kỳ đẻ — để test màn kết chu kỳ
export async function setEndOfLay(barnSlug: string) {
  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug }, include: { flock: true } });
  if (barn.flock && barn.flock.productLine === "LAYER") {
    await prisma.flock.update({ where: { id: barn.flock.id }, data: { stage: "END_OF_LAY" } });
    if (barn.workerId) {
      await prisma.farmUpdate.create({ data: { barnId: barn.id, workerId: barn.workerId, kind: "MILESTONE", text: "Đàn đã hoàn thành một chu kỳ đẻ trọn vẹn 🌾" } });
    }
  }
  revalidatePath(`/chuong/${barnSlug}`);
}

// Quyết định cuối chu kỳ đẻ: thịt / nghỉ hưu / nuôi lứa mới (form-based)
export async function decideEndOfLay(formData: FormData) {
  const barnSlug = String(formData.get("barn"));
  const choice = String(formData.get("choice")) as EndOfLayChoice;
  const barn = await prisma.barn.findUniqueOrThrow({ where: { slug: barnSlug }, include: { flock: true } });
  if (!barn.flock) return;
  const flockId = barn.flock.id;

  await prisma.lifecycleDecision.create({
    data: { barnId: barn.id, flockId, choice, retireFeeVnd: choice === "RETIRE" ? RETIRE_CARE_VND : 0 },
  });

  const stamp = async (text: string) => {
    if (barn.workerId) await prisma.farmUpdate.create({ data: { barnId: barn.id, workerId: barn.workerId, kind: "MILESTONE", text } });
  };

  if (choice === "MEAT") {
    await prisma.bird.updateMany({ where: { flockId }, data: { status: "HARVESTED" } });
    await prisma.flock.update({ where: { id: flockId }, data: { stage: "HARVESTED" } });
    await stamp("Đàn được sơ chế theo đúng quy định giết mổ & kiểm dịch, chuẩn bị gửi về bạn. Cảm ơn một mùa đẻ 🍲");
  } else if (choice === "RETIRE") {
    await prisma.bird.updateMany({ where: { flockId }, data: { status: "RETIRED" } });
    await prisma.flock.update({ where: { id: flockId }, data: { stage: "RETIRED" } });
    await stamp("Các bạn gà được ở lại vườn nhà cô Lan, sống tiếp an nhàn 🌾");
  } else if (choice === "RENEW") {
    // giữ 1 flock/chuồng: reset flock hiện tại thành lứa layer mới
    await prisma.bird.deleteMany({ where: { flockId } });
    await prisma.product.deleteMany({ where: { flockId } });
    await prisma.flock.update({
      where: { id: flockId },
      data: {
        stage: "LAYING", startDate: new Date(),
        birds: { create: Array.from({ length: 5 }).map((_, i) => ({ tagCode: `NEW-${String(i + 1).padStart(2, "0")}`, name: null, status: "ALIVE" })) },
        products: { create: [{ type: "EGG", qty: 0 }] },
      },
    });
    await stamp("Bắt đầu một lứa mới trong chuồng của bạn — hãy đặt tên cho các bạn gà nhé 🐣");
  }

  revalidatePath(`/chuong/${barnSlug}`);
  redirect(`/chuong/${barnSlug}`);
}
