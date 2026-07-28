"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

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
