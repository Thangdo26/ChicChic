import { PrismaClient } from "@prisma/client";
import { BREEDS, FEEDING_PLANS, DECOR_ITEMS, HEALTH_PACKAGE } from "../src/data/catalog";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding ChicChic…");

  // Catalog
  for (const b of BREEDS) {
    await prisma.breed.upsert({
      where: { slug: b.slug },
      update: {},
      create: {
        slug: b.slug, name: b.name, layer: b.layer, broiler: b.broiler,
        story: b.story, layerNote: b.layerNote, broilerNote: b.broilerNote,
      },
    });
  }
  for (const f of FEEDING_PLANS) {
    await prisma.feedingPlan.upsert({
      where: { slug: f.slug },
      update: {},
      create: { slug: f.slug, name: f.name, ratio: f.ratio, priceMultiplier: f.priceMultiplier, note: f.note, emoji: f.emoji },
    });
  }
  for (const d of DECOR_ITEMS) {
    await prisma.decorItem.upsert({
      where: { slug: d.slug },
      update: {},
      create: { slug: d.slug, name: d.name, priceVnd: d.priceVnd, svgKey: d.svgKey },
    });
  }
  await prisma.healthPackage.upsert({
    where: { slug: HEALTH_PACKAGE.slug },
    update: {},
    create: HEALTH_PACKAGE,
  });

  // Farm + Zone + Nông dân
  const farm = await prisma.farm.create({
    data: { name: "Nông trại ChicChic Ba Vì", address: "Ba Vì, Hà Nội" },
  });
  const zone = await prisma.zone.create({ data: { name: "Khu A (quây thả vườn)", farmId: farm.id } });
  const lan = await prisma.farmWorker.create({
    data: {
      name: "Cô Lan", area: "Ba Vì, Hà Nội", avatarKey: "lan", consentMedia: true, farmId: farm.id,
      bio: "8 năm nuôi gà thả vườn. Chăm giúp các bạn trên thành phố, gửi ảnh mỗi ngày.",
    },
  });

  // Chuồng demo (layer) — có sẵn để xem /chuong/demo
  const miaLayer = await prisma.breed.findUniqueOrThrow({ where: { slug: "ga-mia" } });
  const feedQue = await prisma.feedingPlan.findUniqueOrThrow({ where: { slug: "que" } });

  const barn = await prisma.barn.create({
    data: {
      slug: "demo", label: 'Chuồng "Nhà mình"', zoneId: zone.id, workerId: lan.id, outside: false,
      flock: {
        create: {
          productLine: "LAYER", breedId: miaLayer.id, feedingPlanId: feedQue.id,
          stage: "LAYING", size: 10, species: "CHICKEN",
          birds: {
            create: ["Gấu", "Miu", "Đậu", "Nâu", "Bông"].map((name, i) => ({
              tagCode: `A-L-${String(i + 1).padStart(2, "0")}`, name, status: "ALIVE",
            })),
          },
          products: { create: [{ type: "EGG", qty: 12 }] },
        },
      },
    },
  });

  await prisma.farmUpdate.createMany({
    data: [
      { barnId: barn.id, workerId: lan.id, kind: "CARE", text: "Đàn dậy sớm, ăn khỏe. Trời nắng đẹp." },
      { barnId: barn.id, workerId: lan.id, kind: "NOTE", text: "Thay lót chuồng, cho uống nước sạch. Gà lớn đều." },
    ],
  });

  // Chuồng layer thứ 2 — ĐANG Ở CUỐI CHU KỲ ĐẺ, để xem màn /chuong/demo-cuoi-ky/ket-chu-ky
  const barn2 = await prisma.barn.create({
    data: {
      slug: "demo-cuoi-ky", label: 'Chuồng "Vườn xưa"', zoneId: zone.id, workerId: lan.id,
      flock: {
        create: {
          productLine: "LAYER", breedId: miaLayer.id, feedingPlanId: feedQue.id,
          stage: "END_OF_LAY", size: 10, species: "CHICKEN",
          birds: {
            create: ["Mây", "Nắng", "Sương", "Lá", "Gió"].map((name, i) => ({
              tagCode: `A-L2-${String(i + 1).padStart(2, "0")}`, name, status: "ALIVE",
            })),
          },
          products: { create: [{ type: "EGG", qty: 0 }] },
        },
      },
    },
  });
  await prisma.farmUpdate.create({
    data: { barnId: barn2.id, workerId: lan.id, kind: "MILESTONE", text: "Đàn đã hoàn thành một chu kỳ đẻ trọn vẹn. Cảm ơn các bạn gà 🌾" },
  });

  console.log("✅ Done. Xem /chuong/demo và /chuong/demo-cuoi-ky (cuối chu kỳ đẻ)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
