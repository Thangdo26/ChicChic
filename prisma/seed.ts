// Seed ChicChic — IDEMPOTENT.
// Mọi bản ghi dùng ID cố định + upsert, nên `npm run db:seed` chạy lại bao nhiêu lần
// cũng cho đúng một bộ dữ liệu, không bao giờ báo "Unique constraint failed".
// Mốc thời gian tính tương đối so với lúc chạy → demo luôn có nội dung "hôm nay".

import { PrismaClient } from "@prisma/client";
import { BREEDS, FEEDING_PLANS, DECOR_ITEMS, HEALTH_PACKAGE } from "../src/data/catalog";

const prisma = new PrismaClient();

const MIN = 60_000, H = 60 * MIN, D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms);

// ---- ID cố định (khoá idempotency) ----
const ID = {
  farm: "sd_farm_bavi",
  zoneA: "sd_zone_a",
  zoneB: "sd_zone_b",
  lan: "sd_wk_lan",
  tam: "sd_wk_tam",
  userDemo: "sd_user_demo",
  userKhach: "sd_user_khach",
  barnDemo: "sd_barn_demo",
  barnThit: "sd_barn_thit",
  barnCuoiKy: "sd_barn_cuoiky",
  flockDemo: "sd_flock_demo",
  flockThit: "sd_flock_thit",
  flockCuoiKy: "sd_flock_cuoiky",
};

async function main() {
  console.log("🌱 Seeding ChicChic…");

  // ---------- Catalog ----------
  for (const b of BREEDS) {
    const data = {
      slug: b.slug, name: b.name, layer: b.layer, broiler: b.broiler,
      story: b.story, layerNote: b.layerNote, broilerNote: b.broilerNote,
    };
    await prisma.breed.upsert({ where: { slug: b.slug }, update: data, create: data });
  }

  for (const f of FEEDING_PLANS) {
    const data = { slug: f.slug, name: f.name, ratio: f.ratio, priceMultiplier: f.priceMultiplier, note: f.note, emoji: f.emoji };
    await prisma.feedingPlan.upsert({ where: { slug: f.slug }, update: data, create: data });
  }

  for (const d of DECOR_ITEMS) {
    const data = {
      slug: d.slug, name: d.name, priceVnd: d.priceVnd, svgKey: d.svgKey,
      category: d.category, blurb: d.blurb, defaultX: d.defaultX, defaultY: d.defaultY, sortOrder: d.sortOrder,
    };
    await prisma.decorItem.upsert({ where: { slug: d.slug }, update: data, create: data });
  }

  await prisma.healthPackage.upsert({
    where: { slug: HEALTH_PACKAGE.slug }, update: HEALTH_PACKAGE, create: HEALTH_PACKAGE,
  });

  // ---------- Farm / Zone / Nông dân ----------
  const farm = { name: "Nông trại ChicChic Ba Vì", address: "Thôn Yên Thịnh, xã Vân Hoà, Ba Vì, Hà Nội" };
  await prisma.farm.upsert({ where: { id: ID.farm }, update: farm, create: { id: ID.farm, ...farm } });

  for (const z of [
    { id: ID.zoneA, name: "Khu A — quây thả vườn" },
    { id: ID.zoneB, name: "Khu B — chuồng nuôi thịt" },
  ]) {
    await prisma.zone.upsert({ where: { id: z.id }, update: { name: z.name }, create: { ...z, farmId: ID.farm } });
  }

  const workers = [
    {
      id: ID.lan, name: "Cô Lan", area: "Ba Vì, Hà Nội", avatarKey: "lan", consentMedia: true,
      bio: "8 năm nuôi gà thả vườn. Chăm giúp các bạn trên thành phố, gửi ảnh mỗi ngày.",
    },
    {
      id: ID.tam, name: "Chú Tám", area: "Ba Vì, Hà Nội", avatarKey: "tam", consentMedia: true,
      bio: "Phụ trách khu gà thịt. Cẩn thận chuyện cám và nước, ghi sổ từng ngày.",
    },
  ];
  for (const w of workers) {
    const { id, ...rest } = w;
    await prisma.farmWorker.upsert({ where: { id }, update: rest, create: { id, ...rest, farmId: ID.farm } });
  }

  // ---------- Người dùng demo ----------
  for (const u of [
    { id: ID.userDemo, email: "demo@chicchic.vn", name: "Bạn Demo", phone: "0900000001" },
    { id: ID.userKhach, email: "khach@chicchic.vn", name: "Chị Hà", phone: "0900000002" },
  ]) {
    const { id, email, ...rest } = u;
    await prisma.user.upsert({ where: { email }, update: rest, create: { id, email, ...rest } });
  }

  const mia = await prisma.breed.findUniqueOrThrow({ where: { slug: "ga-mia" } });
  const dongTao = await prisma.breed.findUniqueOrThrow({ where: { slug: "ga-dong-tao" } });
  const feedQue = await prisma.feedingPlan.findUniqueOrThrow({ where: { slug: "que" } });
  const feedChuan = await prisma.feedingPlan.findUniqueOrThrow({ where: { slug: "chuan" } });

  // ========== CHUỒNG 1 — layer đang đẻ, đầy đủ decor + ảnh + video ==========
  await upsertBarn({
    id: ID.barnDemo, slug: "demo", label: 'Chuồng "Nhà mình"', zoneId: ID.zoneA,
    workerId: ID.lan, ownerId: ID.userDemo, outside: false,
    flock: {
      id: ID.flockDemo, productLine: "LAYER", breedId: mia.id, feedingPlanId: feedQue.id,
      stage: "LAYING", size: 10, cycleDays: 300, startDate: ago(96 * D),
    },
    birds: ["Gấu", "Miu", "Đậu", "Nâu", "Bông", "Mít", "Sữa", "Kem"].map((name, i) => ({
      tagCode: `A-L-${String(i + 1).padStart(2, "0")}`, name,
    })),
    products: [{ key: "egg", type: "EGG" as const, qty: 46 }],
  });

  await placeDecor(ID.barnDemo, [
    { slug: "bien-ten", x: 120, y: 56, scale: 1, z: 5 },
    { slug: "chau-cay", x: 34, y: 132, scale: 1.05, z: 1 },
    { slug: "den-day", x: 168, y: 44, scale: 1, z: 4 },
    { slug: "o-de-rom", x: 74, y: 140, scale: 0.9, z: 2 },
    { slug: "mang-uong", x: 200, y: 148, scale: 0.85, z: 3 },
  ]);

  await putUpdates([
    { id: "sd_up_d1", barnId: ID.barnDemo, workerId: ID.lan, kind: "CARE", at: ago(2 * H),
      text: "Đàn dậy sớm, ăn hết cữ sáng. Trời nắng đẹp, mình mở cửa cho thoáng." },
    { id: "sd_up_d2", barnId: ID.barnDemo, workerId: ID.lan, kind: "PHOTO", at: ago(5 * H),
      text: "Thu trứng sáng nay được 7 quả, còn ấm. Bạn Bông đẻ đều nhất tuần này." },
    { id: "sd_up_d3", barnId: ID.barnDemo, workerId: ID.lan, kind: "VIDEO", at: ago(9 * H),
      text: "Quay lại cữ ăn sáng cho bạn xem — bạn Gấu vẫn tranh ăn nhất đàn 😄" },
    { id: "sd_up_d4", barnId: ID.barnDemo, workerId: ID.lan, kind: "DECOR", at: ago(1 * D + 3 * H),
      text: 'Đã lắp "Biển tên chuồng" xong rồi nhé! Gửi bạn tấm ảnh chứng minh 📸' },
    { id: "sd_up_d5", barnId: ID.barnDemo, workerId: ID.lan, kind: "NOTE", at: ago(2 * D),
      text: "Thay lót chuồng, rắc vôi khử trùng nền. Nước uống thay 2 lần/ngày." },
    { id: "sd_up_d6", barnId: ID.barnDemo, workerId: ID.lan, kind: "HEALTH", at: ago(6 * D),
      text: "Bạn Nâu hơi ủ rũ hôm kia, mình tách ra theo dõi. Nay ăn lại bình thường rồi, yên tâm." },
    { id: "sd_up_d7", barnId: ID.barnDemo, workerId: ID.lan, kind: "MILESTONE", at: ago(14 * D),
      text: "Đàn tròn 3 tháng ở chuồng bạn. Cảm ơn bạn đã kiên nhẫn 🌾" },
  ]);

  await putMedia([
    { id: "sd_md_d1", barnId: ID.barnDemo, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-sang.svg",
      caption: "Đàn ra ăn cữ đầu, trời nắng đẹp", at: ago(2 * H) },
    { id: "sd_md_d2", barnId: ID.barnDemo, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-trung.svg",
      caption: "Trứng thu sáng nay — 7 quả", at: ago(5 * H), updateId: "sd_up_d2" },
    { id: "sd_md_d3", barnId: ID.barnDemo, workerId: ID.lan, type: "VIDEO", url: "/demo/video-cho-an.svg",
      posterUrl: "/demo/photo-sang.svg", caption: "Cữ ăn sáng của đàn", durationSec: 42, at: ago(9 * H), updateId: "sd_up_d3" },
    { id: "sd_md_d4", barnId: ID.barnDemo, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-decor.svg",
      caption: "Biển tên đã lắp lên cửa chuồng", at: ago(1 * D + 3 * H), updateId: "sd_up_d4" },
    { id: "sd_md_d5", barnId: ID.barnDemo, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-chieu.svg",
      caption: "Chạng vạng — đèn dây bật, đàn vào chuồng đủ", at: ago(1 * D + 10 * H) },
    { id: "sd_md_d6", barnId: ID.barnDemo, workerId: ID.lan, type: "VIDEO", url: "/demo/video-tha-vuon.svg",
      posterUrl: "/demo/photo-vuon.svg", caption: "Buổi thả vườn chiều thứ Bảy", durationSec: 65, at: ago(3 * D) },
    { id: "sd_md_d7", barnId: ID.barnDemo, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-vuon.svg",
      caption: "Đàn nhặt sâu ngoài vườn", at: ago(6 * D) },
  ]);

  await putHealthEvent({
    id: "sd_he_demo", flockId: ID.flockDemo, status: "RECOVERED",
    description: "Bạn Nâu ủ rũ, bỏ ăn 1 cữ. Tách theo dõi 2 ngày, bổ sung điện giải.",
    medsCostVnd: 18000, vetNote: "Không dùng kháng sinh. Chỉ điện giải + vitamin.",
    withdrawalUntil: ago(3 * D), at: ago(6 * D),
  });

  // ========== CHUỒNG 2 — gà thịt, đang nuôi dở, có thời gian ngừng thuốc ==========
  await upsertBarn({
    id: ID.barnThit, slug: "demo-thit", label: 'Chuồng "Mùa vụ"', zoneId: ID.zoneB,
    workerId: ID.tam, ownerId: ID.userKhach, outside: true,
    flock: {
      id: ID.flockThit, productLine: "BROILER", breedId: mia.id, feedingPlanId: feedChuan.id,
      stage: "GROWING", size: 6, cycleDays: 75, startDate: ago(41 * D),
    },
    birds: Array.from({ length: 6 }, (_, i) => ({ tagCode: `B-T-${String(i + 1).padStart(2, "0")}`, name: null })),
    products: [],
  });

  await placeDecor(ID.barnThit, [
    { slug: "hang-rao", x: 40, y: 156, scale: 1.1, z: 1 },
    { slug: "mang-theme", x: 140, y: 150, scale: 1, z: 2 },
    { slug: "chong-chong", x: 206, y: 56, scale: 0.95, z: 3 },
  ]);

  await putUpdates([
    { id: "sd_up_t1", barnId: ID.barnThit, workerId: ID.tam, kind: "RANGE", at: ago(4 * H),
      text: "Đã lùa đàn ra vườn cho gà chạy nhặt sâu, ăn cỏ 🌿" },
    { id: "sd_up_t2", barnId: ID.barnThit, workerId: ID.tam, kind: "HEALTH", at: ago(2 * D),
      text: "Đàn có 2 con bị khò khè, thú y kê kháng sinh 3 ngày. Trong thời gian ngừng thuốc mình sẽ KHÔNG giao thịt — báo bạn biết trước." },
    { id: "sd_up_t3", barnId: ID.barnThit, workerId: ID.tam, kind: "CARE", at: ago(5 * D),
      text: "Cân thử 3 con: trung bình 1,6kg. Đúng tiến độ so với lứa trước." },
  ]);

  await putMedia([
    { id: "sd_md_t1", barnId: ID.barnThit, workerId: ID.tam, type: "VIDEO", url: "/demo/video-tha-vuon.svg",
      posterUrl: "/demo/photo-vuon.svg", caption: "Đàn ra vườn chiều nay", durationSec: 65, at: ago(4 * H), updateId: "sd_up_t1" },
    { id: "sd_md_t2", barnId: ID.barnThit, workerId: ID.tam, type: "PHOTO", url: "/demo/photo-vuon.svg",
      caption: "Khu quây thả — cỏ còn tốt", at: ago(4 * H) },
    { id: "sd_md_t3", barnId: ID.barnThit, workerId: ID.tam, type: "PHOTO", url: "/demo/photo-sang.svg",
      caption: "Cữ ăn sáng khu B", at: ago(2 * D) },
  ]);

  await putHealthEvent({
    id: "sd_he_thit", flockId: ID.flockThit, status: "TREATING",
    description: "2 con khò khè, nghi CRD nhẹ. Thú y xã kê kháng sinh theo đơn, uống 3 ngày.",
    medsCostVnd: 42000, vetNote: "Doxycycline theo liều thú y. Ngừng thuốc 7 ngày trước khi giết mổ.",
    withdrawalUntil: new Date(Date.now() + 5 * D), at: ago(2 * D),
  });

  // ========== CHUỒNG 3 — cuối chu kỳ đẻ ==========
  await upsertBarn({
    id: ID.barnCuoiKy, slug: "demo-cuoi-ky", label: 'Chuồng "Vườn xưa"', zoneId: ID.zoneA,
    workerId: ID.lan, ownerId: ID.userDemo, outside: false,
    flock: {
      id: ID.flockCuoiKy, productLine: "LAYER", breedId: dongTao.id, feedingPlanId: feedQue.id,
      stage: "END_OF_LAY", size: 10, cycleDays: 300, startDate: ago(320 * D),
    },
    birds: ["Mây", "Nắng", "Sương", "Lá", "Gió"].map((name, i) => ({
      tagCode: `A-L2-${String(i + 1).padStart(2, "0")}`, name,
    })),
    products: [{ key: "egg", type: "EGG" as const, qty: 0 }],
  });

  await placeDecor(ID.barnCuoiKy, [
    { slug: "bien-ten", x: 120, y: 56, scale: 1, z: 3 },
    { slug: "cau-dau", x: 196, y: 116, scale: 1, z: 2 },
    { slug: "bang-phan", x: 40, y: 100, scale: 0.9, z: 1 },
  ]);

  await putUpdates([
    { id: "sd_up_c1", barnId: ID.barnCuoiKy, workerId: ID.lan, kind: "MILESTONE", at: ago(1 * D),
      text: "Đàn đã hoàn thành một chu kỳ đẻ trọn vẹn. Cảm ơn các bạn gà 🌾" },
    { id: "sd_up_c2", barnId: ID.barnCuoiKy, workerId: ID.lan, kind: "NOTE", at: ago(8 * D),
      text: "Sản lượng trứng giảm dần 3 tuần nay — đúng quy luật cuối chu kỳ, không phải đàn bệnh." },
  ]);

  await putMedia([
    { id: "sd_md_c1", barnId: ID.barnCuoiKy, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-chieu.svg",
      caption: "Chiều cuối chu kỳ ở chuồng Vườn xưa", at: ago(1 * D) },
    { id: "sd_md_c2", barnId: ID.barnCuoiKy, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-trung.svg",
      caption: "Mẻ trứng cuối cùng của lứa này", at: ago(9 * D) },
  ]);

  // ---------- Đơn giữ chỗ demo (để /admin có nội dung) ----------
  // priceEstimateVnd = priceBreakdown(line, feed, size) — giá tính theo đầu con:
  //   LAYER "que"    10 mái: 18.000×1,25×10 + 9.000×10 + 8.000×10 = 395.000
  //   BROILER "chuan" 6 con: 42.000×6      + 21.000×6 + 17.000×6 = 480.000
  await putReservation({
    id: "sd_rsv_1", idemKey: "seed-rsv-1", userId: ID.userDemo, barnId: ID.barnDemo,
    productLine: "LAYER", breedSlug: "ga-mia", feedingPlanSlug: "que",
    henNames: ["Gấu", "Miu", "Đậu"], priceEstimateVnd: 395000, status: "ACTIVE", at: ago(100 * D),
  });
  await putReservation({
    id: "sd_rsv_2", idemKey: "seed-rsv-2", userId: ID.userKhach, barnId: ID.barnThit,
    productLine: "BROILER", breedSlug: "ga-mia", feedingPlanSlug: "chuan",
    henNames: [], priceEstimateVnd: 480000, status: "ACTIVE", at: ago(42 * D),
  });

  const [barns, media] = await Promise.all([prisma.barn.count(), prisma.barnMedia.count()]);
  console.log(`✅ Xong — ${barns} chuồng, ${media} ảnh/video.`);
  console.log("   Xem: /chuong/demo · /chuong/demo-thit · /chuong/demo-cuoi-ky");
}

// ---------------- helpers (tất cả đều idempotent) ----------------

type BarnSpec = {
  id: string; slug: string; label: string; zoneId: string;
  workerId: string; ownerId: string; outside: boolean;
  flock: {
    id: string; productLine: "LAYER" | "BROILER"; breedId: string; feedingPlanId: string;
    stage: "BROODING" | "GROWING" | "LAYING" | "FINISHING" | "END_OF_LAY" | "HARVESTED" | "RETIRED";
    size: number; cycleDays: number; startDate: Date;
  };
  birds: { tagCode: string; name: string | null }[];
  products: { key: string; type: "EGG" | "MEAT"; qty: number }[];
};

async function upsertBarn(s: BarnSpec) {
  const barnData = {
    slug: s.slug, label: s.label, zoneId: s.zoneId, workerId: s.workerId,
    ownerId: s.ownerId, outside: s.outside,
  };
  await prisma.barn.upsert({ where: { id: s.id }, update: barnData, create: { id: s.id, ...barnData } });

  const flockData = {
    productLine: s.flock.productLine, breedId: s.flock.breedId, feedingPlanId: s.flock.feedingPlanId,
    stage: s.flock.stage, size: s.flock.size, cycleDays: s.flock.cycleDays, startDate: s.flock.startDate,
  };
  await prisma.flock.upsert({
    where: { id: s.flock.id }, update: flockData, create: { id: s.flock.id, barnId: s.id, ...flockData },
  });

  for (const [i, b] of s.birds.entries()) {
    const id = `${s.flock.id}_bird_${i}`;
    const data = { tagCode: b.tagCode, name: b.name, status: "ALIVE" as const };
    await prisma.bird.upsert({ where: { id }, update: data, create: { id, flockId: s.flock.id, ...data } });
  }

  for (const p of s.products) {
    const id = `${s.flock.id}_prod_${p.key}`;
    await prisma.product.upsert({
      where: { id }, update: { type: p.type, qty: p.qty }, create: { id, flockId: s.flock.id, type: p.type, qty: p.qty },
    });
  }
}

async function placeDecor(barnId: string, list: { slug: string; x: number; y: number; scale: number; z: number }[]) {
  for (const d of list) {
    const item = await prisma.decorItem.findUniqueOrThrow({ where: { slug: d.slug } });
    const pos = { x: d.x, y: d.y, scale: d.scale, z: d.z };
    await prisma.barnDecor.upsert({
      where: { barnId_itemId: { barnId, itemId: item.id } },
      update: pos,
      create: { barnId, itemId: item.id, ...pos },
    });
  }
}

type UpdateSpec = { id: string; barnId: string; workerId: string; kind: string; text: string; at: Date };

async function putUpdates(list: UpdateSpec[]) {
  for (const u of list) {
    const data = { kind: u.kind as never, text: u.text, createdAt: u.at };
    await prisma.farmUpdate.upsert({
      where: { id: u.id }, update: data, create: { id: u.id, barnId: u.barnId, workerId: u.workerId, ...data },
    });
  }
}

type MediaSpec = {
  id: string; barnId: string; workerId: string; type: "PHOTO" | "VIDEO"; url: string;
  posterUrl?: string; caption?: string; durationSec?: number; at: Date; updateId?: string;
};

async function putMedia(list: MediaSpec[]) {
  for (const m of list) {
    const data = {
      type: m.type, url: m.url, posterUrl: m.posterUrl ?? null, caption: m.caption ?? null,
      durationSec: m.durationSec ?? null, capturedAt: m.at, updateId: m.updateId ?? null,
    };
    await prisma.barnMedia.upsert({
      where: { id: m.id }, update: data, create: { id: m.id, barnId: m.barnId, workerId: m.workerId, ...data },
    });
  }
}

async function putHealthEvent(e: {
  id: string; flockId: string; status: "REPORTED" | "TREATING" | "RECOVERED" | "DECEASED";
  description: string; medsCostVnd: number; vetNote: string; withdrawalUntil: Date; at: Date;
}) {
  const { id, flockId, at, ...rest } = e;
  const data = { ...rest, createdAt: at };
  await prisma.healthEvent.upsert({ where: { id }, update: data, create: { id, flockId, ...data } });
}

async function putReservation(r: {
  id: string; idemKey: string; userId: string; barnId: string;
  productLine: "LAYER" | "BROILER"; breedSlug: string; feedingPlanSlug: string;
  henNames: string[]; priceEstimateVnd: number;
  status: "HELD" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED"; at: Date;
}) {
  const { id, at, ...rest } = r;
  const data = { ...rest, createdAt: at };
  await prisma.reservation.upsert({ where: { id }, update: data, create: { id, ...data } });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
