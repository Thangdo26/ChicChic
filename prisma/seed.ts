// Seed ChicChic - IDEMPOTENT.
// Mọi bản ghi dùng ID cố định + upsert, nên `npm run db:seed` chạy lại bao nhiêu lần
// cũng cho đúng một bộ dữ liệu, không bao giờ báo "Unique constraint failed".
// Mốc thời gian tính tương đối so với lúc chạy → demo luôn có nội dung "hôm nay".

import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";
import { BREEDS, FEEDING_PLANS, DECOR_ITEMS, HEALTH_PACKAGE } from "../src/data/catalog";

const prisma = new PrismaClient();

// Cùng định dạng "salt:hash" với src/lib/auth.ts
function scryptHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const MIN = 60_000, H = 60 * MIN, D = 24 * H;
const ago = (ms: number) => new Date(Date.now() - ms);

// ---- ID cố định (khoá idempotency) ----
const ID = {
  farm: "sd_farm_bavi",
  zoneA: "sd_zone_a",
  zoneB: "sd_zone_b",
  lan: "sd_wk_lan",
  tam: "sd_wk_tam",
  dung: "sd_wk_dung",
  hoa: "sd_wk_hoa",
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
      // Ghi tường minh cả khi undefined: món cũ chạy lại seed phải được ĐẶT LẠI về
      // false/null, nếu không một món đổi từ yếm sang decor sẽ giữ cờ cũ và lọt vào
      // nhầm đường (yếm mà `wearable = false` thì `confirmDecorPaid` lắp nó vào chuồng).
      wearable: d.wearable ?? false,
      colorHex: d.colorHex ?? null,
      tone: d.tone ?? null,
    };
    // `stockQty` CỐ Ý chỉ đặt lúc tạo mới, KHÔNG có trong `update`.
    //
    // Đây là số liệu VẬN HÀNH của nông trại (hàng thật trên kệ), không phải dữ liệu
    // danh mục. Nông trại nhập thêm lên 50 rồi ai đó chạy `npm run db:seed` để cập
    // nhật giá mà kho bị kéo về 20 là mất hàng trong sổ, và không ai biết vì sao.
    await prisma.decorItem.upsert({
      where: { slug: d.slug },
      update: data,
      create: { ...data, stockQty: 20 },
    });
  }

  // ---------- Giá niêm yết trên chợ ----------
  // Chỉ seed khi bảng CÒN TRỐNG: mỗi lần đổi giá là một dòng mới, seed chạy lại mà
  // chèn thêm là ghi đè giá nông trại vừa đặt bằng giá mẫu.
  if ((await prisma.marketPrice.count()) === 0) {
    await prisma.marketPrice.createMany({
      data: [
        // Trứng cùng giá mọi giống (dòng breedSlug = null). Thị trường gà ta 4.500–7.000đ.
        { type: "EGG", breedSlug: null, unitVnd: 5500, note: "Giá mẫu lúc seed" },
        // Gà thịt theo cân. Dòng null là "gà ta nói chung", giống nào có dòng riêng thì ưu tiên.
        { type: "MEAT", breedSlug: null, unitVnd: 130000, note: "Giá mẫu lúc seed" },
        { type: "MEAT", breedSlug: "ga-mia", unitVnd: 150000, note: "Giá mẫu lúc seed" },
        { type: "MEAT", breedSlug: "ga-dong-tao", unitVnd: 350000, note: "Giá mẫu lúc seed" },
      ],
    });
  }

  await prisma.healthPackage.upsert({
    where: { slug: HEALTH_PACKAGE.slug }, update: HEALTH_PACKAGE, create: HEALTH_PACKAGE,
  });

  // ---------- Farm / Zone / Nông dân ----------
  const farm = { name: "Nông trại ChicChic Ba Vì", address: "Thôn Yên Thịnh, xã Vân Hoà, Ba Vì, Hà Nội" };
  await prisma.farm.upsert({ where: { id: ID.farm }, update: farm, create: { id: ID.farm, ...farm } });

  for (const z of [
    { id: ID.zoneA, name: "Khu A - quây thả vườn" },
    { id: ID.zoneB, name: "Khu B - chuồng nuôi thịt" },
  ]) {
    await prisma.zone.upsert({ where: { id: z.id }, update: { name: z.name }, create: { ...z, farmId: ID.farm } });
  }

  // ---------- Người dùng demo ----------
  // Mật khẩu chung: chicchic123 - để đăng nhập thử ngay mà không cần luồng OTP.
  const demoHash = scryptHash("chicchic123");
  for (const u of [
    { id: ID.userDemo, email: "demo@chicchic.vn", name: "Bạn Demo", phone: "0900000001" },
    { id: ID.userKhach, email: "khach@chicchic.vn", name: "Chị Hà", phone: "0900000002" },
  ]) {
    const { id, email, ...rest } = u;
    const data = { ...rest, passwordHash: demoHash, emailVerifiedAt: new Date(), role: "USER" as const };
    await prisma.user.upsert({ where: { email }, update: data, create: { id, email, ...data } });
  }

  // ---------- Nông dân (mỗi người một TÀI KHOẢN riêng để vào /nong-trai) ----------
  // maxBarns = 15: một người chỉ nhận tối đa 15 chuồng để còn nhớ được từng đàn.
  type IntroSeed = { type: "PHOTO" | "VIDEO"; url: string; caption: string; posterUrl?: string };
  const workers: {
    id: string; name: string; area: string; avatarKey: string; consentMedia: boolean;
    yearsExp: number; maxBarns: number; active: boolean; email: string; username: string;
    bio: string; birthYear: number; intro: IntroSeed[];
  }[] = [
    {
      id: ID.lan, name: "Cô Lan", area: "Ba Vì, Hà Nội", avatarKey: "lan", consentMedia: true,
      yearsExp: 8, maxBarns: 15, active: true, email: "lan@chicchic.vn", username: "colan",
      birthYear: 1978,
      bio: "8 năm nuôi gà thả vườn. Chăm giúp các bạn trên thành phố, gửi ảnh mỗi ngày.",
      intro: [
        { type: "PHOTO", url: "/demo/photo-sang.svg", caption: "Tôi ra chuồng lúc 6 giờ sáng mỗi ngày" },
        { type: "PHOTO", url: "/demo/photo-trung.svg", caption: "Mẻ trứng gom sáng nay" },
        { type: "VIDEO", url: "/demo/video-cho-an.svg", posterUrl: "/demo/photo-sang.svg", caption: "Cữ ăn sáng của đàn" },
      ],
    },
    {
      id: ID.tam, name: "Chú Tám", area: "Ba Vì, Hà Nội", avatarKey: "tam", consentMedia: true,
      yearsExp: 12, maxBarns: 15, active: true, email: "tam@chicchic.vn", username: "chutam",
      birthYear: 1969,
      bio: "Phụ trách khu gà thịt. Cẩn thận chuyện cám và nước, ghi sổ từng ngày.",
      intro: [
        { type: "PHOTO", url: "/demo/photo-vuon.svg", caption: "Khu vườn thả của tôi" },
        { type: "VIDEO", url: "/demo/video-tha-vuon.svg", posterUrl: "/demo/photo-vuon.svg", caption: "Buổi thả vườn chiều" },
      ],
    },
    {
      id: ID.dung, name: "Anh Dũng", area: "Ba Vì, Hà Nội", avatarKey: "dung", consentMedia: true,
      yearsExp: 5, maxBarns: 15, active: true, email: "dung@chicchic.vn", username: "anhdung",
      birthYear: 1995,
      bio: "Mới về quê nối nghiệp nhà. Chịu khó quay video, hay kể chuyện từng con gà.",
      intro: [
        { type: "PHOTO", url: "/demo/photo-chieu.svg", caption: "Chuồng lúc chạng vạng" },
      ],
    },
    {
      id: ID.hoa, name: "Chị Hoa", area: "Ba Vì, Hà Nội", avatarKey: "hoa", consentMedia: true,
      yearsExp: 6, maxBarns: 15, active: false, email: "hoa@chicchic.vn", username: "chihoa",
      birthYear: 1988,
      bio: "Đang nghỉ chăm con nhỏ tới cuối quý - tạm chưa nhận chuồng mới.",
      intro: [],
    },
  ];
  for (const w of workers) {
    const { id, email, username, intro, ...rest } = w;
    // Tài khoản đăng nhập của nông dân: cùng mật khẩu demo, role WORKER.
    // Có username để các cô chú gõ "colan" thay vì phải nhớ email.
    const account = { name: w.name, username, passwordHash: demoHash, emailVerifiedAt: new Date(), role: "WORKER" as const };
    const user = await prisma.user.upsert({ where: { email }, update: account, create: { email, ...account } });
    await prisma.farmWorker.upsert({
      where: { id },
      update: { ...rest, userId: user.id },
      create: { id, ...rest, userId: user.id, farmId: ID.farm },
    });

    // Ảnh/video cô chú tự giới thiệu - khách xem trước khi chọn người chăm chuồng
    for (const [i, m] of intro.entries()) {
      const mediaId = `sd_wm_${id}_${i}`;
      const data = { workerId: id, type: m.type, url: m.url, posterUrl: m.posterUrl ?? null, caption: m.caption, sortOrder: i };
      await prisma.workerMedia.upsert({ where: { id: mediaId }, update: data, create: { id: mediaId, ...data } });
    }
  }

  const mia = await prisma.breed.findUniqueOrThrow({ where: { slug: "ga-mia" } });
  const dongTao = await prisma.breed.findUniqueOrThrow({ where: { slug: "ga-dong-tao" } });
  const feedQue = await prisma.feedingPlan.findUniqueOrThrow({ where: { slug: "que" } });
  const feedChuan = await prisma.feedingPlan.findUniqueOrThrow({ where: { slug: "chuan" } });

  // ========== CHUỒNG 1 - layer đang đẻ, đầy đủ decor + ảnh + video ==========
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
      text: "Quay lại cữ ăn sáng cho bạn xem - bạn Gấu vẫn tranh ăn nhất đàn 😄" },
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
      caption: "Trứng thu sáng nay - 7 quả", at: ago(5 * H), updateId: "sd_up_d2" },
    { id: "sd_md_d3", barnId: ID.barnDemo, workerId: ID.lan, type: "VIDEO", url: "/demo/video-cho-an.svg",
      posterUrl: "/demo/photo-sang.svg", caption: "Cữ ăn sáng của đàn", durationSec: 42, at: ago(9 * H), updateId: "sd_up_d3" },
    { id: "sd_md_d4", barnId: ID.barnDemo, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-decor.svg",
      caption: "Biển tên đã lắp lên cửa chuồng", at: ago(1 * D + 3 * H), updateId: "sd_up_d4" },
    { id: "sd_md_d5", barnId: ID.barnDemo, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-chieu.svg",
      caption: "Chạng vạng - đèn dây bật, đàn vào chuồng đủ", at: ago(1 * D + 10 * H) },
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

  // ========== CHUỒNG 2 - gà thịt, đang nuôi dở, có thời gian ngừng thuốc ==========
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
      text: "Đàn có 2 con bị khò khè, thú y kê kháng sinh 3 ngày. Trong thời gian ngừng thuốc mình sẽ KHÔNG giao thịt - báo bạn biết trước." },
    { id: "sd_up_t3", barnId: ID.barnThit, workerId: ID.tam, kind: "CARE", at: ago(5 * D),
      text: "Cân thử 3 con: trung bình 1,6kg. Đúng tiến độ so với lứa trước." },
  ]);

  await putMedia([
    { id: "sd_md_t1", barnId: ID.barnThit, workerId: ID.tam, type: "VIDEO", url: "/demo/video-tha-vuon.svg",
      posterUrl: "/demo/photo-vuon.svg", caption: "Đàn ra vườn chiều nay", durationSec: 65, at: ago(4 * H), updateId: "sd_up_t1" },
    { id: "sd_md_t2", barnId: ID.barnThit, workerId: ID.tam, type: "PHOTO", url: "/demo/photo-vuon.svg",
      caption: "Khu quây thả - cỏ còn tốt", at: ago(4 * H) },
    { id: "sd_md_t3", barnId: ID.barnThit, workerId: ID.tam, type: "PHOTO", url: "/demo/photo-sang.svg",
      caption: "Cữ ăn sáng khu B", at: ago(2 * D) },
  ]);

  await putHealthEvent({
    id: "sd_he_thit", flockId: ID.flockThit, status: "TREATING",
    description: "2 con khò khè, nghi CRD nhẹ. Thú y xã kê kháng sinh theo đơn, uống 3 ngày.",
    medsCostVnd: 42000, vetNote: "Doxycycline theo liều thú y. Ngừng thuốc 7 ngày trước khi giết mổ.",
    withdrawalUntil: new Date(Date.now() + 5 * D), at: ago(2 * D),
  });

  // ========== CHUỒNG 3 - cuối chu kỳ đẻ ==========
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
      text: "Sản lượng trứng giảm dần 3 tuần nay - đúng quy luật cuối chu kỳ, không phải đàn bệnh." },
  ]);

  await putMedia([
    { id: "sd_md_c1", barnId: ID.barnCuoiKy, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-chieu.svg",
      caption: "Chiều cuối chu kỳ ở chuồng Vườn xưa", at: ago(1 * D) },
    { id: "sd_md_c2", barnId: ID.barnCuoiKy, workerId: ID.lan, type: "PHOTO", url: "/demo/photo-trung.svg",
      caption: "Mẻ trứng cuối cùng của lứa này", at: ago(9 * D) },
  ]);

  // ---------- Đơn giữ chỗ demo (để /admin có nội dung) ----------
  // priceEstimateVnd = priceBreakdown(line, feed, size) - giá tính theo đầu con:
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
  // Chuồng cuối chu kỳ cũng cần đơn đã cọc để decor không bị khoá
  await putReservation({
    id: "sd_rsv_3", idemKey: "seed-rsv-3", userId: ID.userDemo, barnId: ID.barnCuoiKy,
    productLine: "LAYER", breedSlug: "ga-dong-tao", feedingPlanSlug: "que",
    henNames: ["Mây", "Nắng", "Sương"], priceEstimateVnd: 218000, status: "ACTIVE", at: ago(320 * D),
  });

  // ---------- Nhiệm vụ demo (hộp việc của nông dân) ----------
  await putTasks([
    // Đang chờ - hiện trong /nong-trai của cô Lan
    {
      id: "sd_task_feed", barnId: ID.barnDemo, workerId: ID.lan, requestedById: ID.userDemo,
      kind: "FEED", title: "Cho ăn theo giờ hẹn", status: "OPEN",
      note: "Cữ chiều cho mình xin thêm ít rau xanh với ạ.",
      dueAt: new Date(Date.now() + 3 * H), at: ago(2 * H),
    },
    {
      id: "sd_task_check", barnId: ID.barnDemo, workerId: ID.lan, requestedById: ID.userDemo,
      kind: "CHECK", title: "Ngó chuồng & báo hiện trạng", status: "OPEN",
      note: "Bạn Nâu hôm qua hơi ủ rũ, cô xem giúp con nay ăn được không ạ.",
      at: ago(40 * MIN),
    },
    {
      id: "sd_task_range", barnId: ID.barnThit, workerId: ID.tam, requestedById: ID.userKhach,
      kind: "RANGE_IN", title: "Gọi đàn về chuồng", status: "OPEN",
      note: "Chiều nay có mưa, chú gọi đàn về sớm giúp cháu nhé.",
      at: ago(90 * MIN),
    },
    // Đã xong - có ảnh minh chứng đi kèm
    {
      id: "sd_task_decor", barnId: ID.barnDemo, workerId: ID.lan, requestedById: ID.userDemo,
      kind: "DECOR", title: "Lắp trang trí", status: "DONE",
      note: "Treo biển tên ngay trước cửa chuồng giúp mình nhé.",
      doneNote: 'Đã treo "Biển tên chuồng" lên cửa rồi nhé, gửi bạn tấm ảnh 📸',
      proofMediaId: "sd_md_d4", at: ago(1 * D + 5 * H), doneAt: ago(1 * D + 3 * H),
    },
    {
      id: "sd_task_check2", barnId: ID.barnCuoiKy, workerId: ID.lan, requestedById: ID.userDemo,
      kind: "CHECK", title: "Ngó chuồng & báo hiện trạng", status: "DONE",
      note: "Cuối chu kỳ rồi, cô chụp giúp mình một tấm chiều nay nhé.",
      doneNote: "Chiều nay đàn vẫn ra sân bới cỏ bình thường, không con nào ốm.",
      proofMediaId: "sd_md_c1", at: ago(1 * D + 4 * H), doneAt: ago(1 * D),
    },
  ]);

  const [barns, media, tasks] = await Promise.all([
    prisma.barn.count(), prisma.barnMedia.count(), prisma.barnTask.count(),
  ]);
  console.log(`✅ Xong - ${barns} chuồng, ${media} ảnh/video, ${tasks} nhiệm vụ.`);
  console.log("   Xem: /chuong/demo · /chuong/demo-thit · /chuong/demo-cuoi-ky");
  console.log("   Chủ chuồng:  demo@chicchic.vn / chicchic123");
  console.log("   Nông dân:    lan@chicchic.vn · tam@chicchic.vn · dung@chicchic.vn  (cùng mật khẩu) → /nong-trai");
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
    isPublic: true, // 3 chuồng seed là chuồng trưng bày - khách chưa đăng nhập vẫn xem được
  };
  await prisma.barn.upsert({ where: { id: s.id }, update: barnData, create: { id: s.id, ...barnData } });

  const flockData = {
    productLine: s.flock.productLine, breedId: s.flock.breedId, feedingPlanId: s.flock.feedingPlanId,
    stage: s.flock.stage, size: s.flock.size, cycleDays: s.flock.cycleDays, startDate: s.flock.startDate,
    // Đàn seed coi như đã tiêm phòng úm ngày thứ 7 - để trang truy xuất có dữ liệu thật mà hiển thị.
    vaccinatedAt: new Date(s.flock.startDate.getTime() + 7 * 86_400_000),
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

// Id tự đặt theo (chuồng, món) để seed chạy lại bao nhiêu lần cũng không nhân bản.
// KHÔNG dùng where: { barnId_itemId } nữa - ràng buộc unique đó đã bỏ để một chuồng
// lắp được nhiều bản cùng loại (xem schema BarnDecor).
async function placeDecor(
  barnId: string,
  list: { slug: string; x: number; y: number; scale: number; z: number; text?: string }[],
) {
  for (const d of list) {
    const item = await prisma.decorItem.findUniqueOrThrow({ where: { slug: d.slug } });
    const data = { x: d.x, y: d.y, scale: d.scale, z: d.z, text: d.text ?? null };
    const id = `${barnId}_decor_${d.slug}`;
    // Dọn bản cũ mang id ngẫu nhiên (tạo trước khi seed chuyển sang id tự đặt), nếu không
    // chạy seed lần nữa sẽ nhân đôi món trong chuồng demo.
    await prisma.barnDecor.deleteMany({
      where: { barnId, itemId: item.id, id: { not: id } },
    });
    await prisma.barnDecor.upsert({
      where: { id },
      update: data,
      create: { id, barnId, itemId: item.id, ...data },
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

type TaskSpec = {
  id: string; barnId: string; workerId: string; requestedById: string;
  kind: "DECOR" | "RANGE_OUT" | "RANGE_IN" | "FEED" | "CHECK";
  title: string; status: "OPEN" | "DONE" | "DECLINED";
  note?: string; doneNote?: string; proofMediaId?: string;
  dueAt?: Date; at: Date; doneAt?: Date;
};

async function putTasks(list: TaskSpec[]) {
  for (const t of list) {
    const data = {
      kind: t.kind as never, title: t.title, status: t.status as never,
      note: t.note ?? null, doneNote: t.doneNote ?? null,
      proofMediaId: t.proofMediaId ?? null,
      dueAt: t.dueAt ?? null, doneAt: t.doneAt ?? null,
      // việc đã xong coi như nông dân đã đọc; việc đang chờ để nguyên "mới"
      seenAt: t.status === "OPEN" ? null : t.doneAt ?? t.at,
      createdAt: t.at,
    };
    await prisma.barnTask.upsert({
      where: { id: t.id },
      update: data,
      create: { id: t.id, barnId: t.barnId, workerId: t.workerId, requestedById: t.requestedById, ...data },
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
  // Đơn demo luôn ở trạng thái đã cọc xong - để mọi tính năng mở khoá sẵn khi trải nghiệm
  const data = {
    ...rest, createdAt: at,
    paymentStatus: "CONFIRMED" as const, reportedAt: at, paidAt: at,
  };
  await prisma.reservation.upsert({ where: { id }, update: data, create: { id, ...data } });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
