// Bộ nhớ đệm phía server cho những truy vấn LẶP LẠI mà dữ liệu hầu như không đổi.
//
// Vì sao đáng làm ở repo này: mỗi lượt đi–về DB là chờ THẬT, không phải vài mili giây.
// Đo được ~282ms từ khi DB dời sang ap-southeast-1 (Singapore); hồi còn ở ap-south-1
// (Mumbai) thì ~1,3s - xem CODEMAP §10 và §11.23. Và một trang thường tốn vài lượt NỐI
// TIẾP nhau, nên con số đó bị nhân lên chứ không cộng một lần.
//
// ────────── Luật dùng ──────────
// 1. CHỈ cache dữ liệu KHÔNG thuộc về một người cụ thể. Không bao giờ đưa vào đây thứ
//    phụ thuộc phiên đăng nhập - `unstable_cache` dùng chung cho mọi request, cache
//    nhầm một lần là lộ dữ liệu người này cho người kia.
// 2. Dữ liệu danh mục (`DecorItem`, `Breed`, `FeedingPlan`, `Zone`) chỉ do
//    `prisma/seed.ts` ghi - không có action nào trong `src/` đụng vào, nên cache dài
//    là an toàn tuyệt đối. Đổi danh mục thì chạy seed rồi deploy lại.
// 3. Số liệu "gần tĩnh" (trang chủ) cache ngắn: sai lệch vài phút không hại ai, mà
//    trang chủ là trang công khai chịu tải nặng nhất.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

/** Danh mục do seed ghi - coi như bất biến giữa hai lần deploy. */
const CATALOG_TTL = 60 * 60; // 1 giờ
/** Số liệu sống của nông trại - lệch vài phút không ảnh hưởng quyết định của ai. */
const PROOF_TTL = 5 * 60;

/**
 * Toàn bộ danh mục trang trí, sắp sẵn theo `sortOrder`.
 * Trang /trang-tri gọi nó, và `decorStockBySlug` cũng cần đúng bảng này - trước đây
 * hai chỗ tự truy vấn riêng nên mỗi lần mở trang là hai lượt đi–về cho cùng dữ liệu.
 */
export const cachedDecorItems = unstable_cache(
  () => prisma.decorItem.findMany({ orderBy: { sortOrder: "asc" } }),
  ["decor-items"],
  { revalidate: CATALOG_TTL, tags: ["catalog"] },
);

/** Khu nuôi. `POST /api/reservations` đọc mỗi lần nhận chuồng chỉ để chọn zone. */
export const cachedZones = unstable_cache(
  () => prisma.zone.findMany({ orderBy: { name: "asc" } }),
  ["zones"],
  { revalidate: CATALOG_TTL, tags: ["catalog"] },
);

/** Một giống gà theo slug. Tra lúc nhận chuồng, dữ liệu do seed ghi. */
export const cachedBreed = unstable_cache(
  (slug: string) => prisma.breed.findUnique({ where: { slug } }),
  ["breed"],
  { revalidate: CATALOG_TTL, tags: ["catalog"] },
);

/** Một chế độ ăn theo slug. Như trên. */
export const cachedFeedingPlan = unstable_cache(
  (slug: string) => prisma.feedingPlan.findUnique({ where: { slug } }),
  ["feeding-plan"],
  { revalidate: CATALOG_TTL, tags: ["catalog"] },
);

/**
 * Ba con số ở trang chủ (nông dân · chuồng · ảnh).
 *
 * Đây là ba `count()` trên ba bảng, chạy lại cho MỌI lượt xem trang công khai. Số
 * chậm 5 phút thì không ai thiệt gì - nhưng ba lượt đi–về Mumbai cho mỗi khách vãng
 * lai thì có.
 */
export const cachedFarmProof = unstable_cache(
  async () => {
    const [workers, barns, media] = await Promise.all([
      prisma.farmWorker.count({ where: { active: true } }),
      prisma.barn.count({ where: { ownerId: { not: null } } }),
      prisma.barnMedia.count(),
    ]);
    return { workers, barns, media };
  },
  ["farm-proof"],
  { revalidate: PROOF_TTL, tags: ["farm-proof"] },
);
