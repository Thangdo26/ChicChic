export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canViewBarn, requireUser } from "@/lib/auth";
import { cachedDecorItems } from "@/lib/cache";
import { decorStock } from "@/lib/decor-store";
import BarnLocked from "@/components/BarnLocked";
import BirdGearPanel, { type BirdVM, type GearVM } from "@/components/BirdGearPanel";

/**
 * Đàn gà — chỗ chủ chuồng nhìn thấy từng con và mặc yếm cho chúng.
 *
 * HIỆU NĂNG: trang này cố ý PHẲNG MỘT TẦNG. `Bird` và `BirdGear` lấy bằng hai truy vấn
 * riêng chạy song song rồi ghép trong Node, KHÔNG `include` lồng từ Bird xuống gear —
 * Prisma phát một truy vấn cho mỗi quan hệ trong `include`, lồng hai tầng qua N con là
 * đúng cái làm trang chuồng chậm 9s hồi DB còn ở Mumbai (§11.23).
 * Danh mục yếm lấy từ `cachedDecorItems` (TTL 1 giờ) nên tốn 0 lượt đi–về.
 */
export default async function DanGa({ params }: { params: { id: string } }) {
  const next = `/chuong/${params.id}/dan-ga`;
  // requireUser Ở DÒNG ĐẦU, trước mọi truy vấn nặng (bẫy §10: đo được 9,3s → 0,09s).
  await requireUser(next);

  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    select: {
      id: true, slug: true, label: true, ownerId: true, workerId: true, isPublic: true,
      flock: { select: { id: true, productLine: true } },
    },
  });
  if (!barn || !barn.flock) return notFound();
  if (!(await canViewBarn(barn, next))) return <BarnLocked slug={barn.slug} />;

  const isLayer = barn.flock.productLine === "LAYER";

  const [birds, gearRows, catalog, stock] = await Promise.all([
    prisma.bird.findMany({
      where: { flockId: barn.flock.id, status: "ALIVE" },
      select: { id: true, name: true, tagCode: true },
      orderBy: { tagCode: "asc" },
      take: 50,
    }),
    // Một truy vấn PHẲNG cho cả đàn, lọc theo chuồng qua quan hệ — không lồng từ Bird.
    prisma.birdGear.findMany({
      where: { bird: { flock: { barnId: barn.id } }, status: { not: "OFF" } },
      select: {
        id: true, birdId: true, status: true, photoUrl: true,
        item: { select: { name: true, colorHex: true } },
      },
    }),
    cachedDecorItems(),
    decorStock(barn.id),
  ]);

  const gearByBird = new Map(gearRows.map((g) => [g.birdId, g]));
  const vmBirds: BirdVM[] = birds.map((b) => {
    const g = gearByBird.get(b.id);
    return {
      id: b.id, name: b.name, tagCode: b.tagCode,
      gear: g
        ? {
            id: g.id,
            itemName: g.item.name,
            colorHex: g.item.colorHex,
            status: g.status as "PENDING_ON" | "WORN" | "PENDING_OFF",
            photoUrl: g.photoUrl,
          }
        : null,
    };
  });

  // Chỉ hiện loại yếm chuồng ĐÃ MUA — catalog đầy đủ nằm ở trang Trang trí.
  const vmGear: GearVM[] = catalog
    .filter((it) => it.wearable)
    .map((it) => ({ it, s: stock.get(it.id) }))
    .filter((r) => (r.s?.owned ?? 0) > 0)
    .map(({ it, s }) => ({
      slug: it.slug, name: it.name, colorHex: it.colorHex, tone: it.tone,
      priceVnd: it.priceVnd, owned: s!.owned, free: s!.free,
    }));

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline"
        style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>

      <div className="mt-2">
        <span className="eyebrow">Đàn gà</span>
        <h2 className="display text-[18px] mt-0.5 leading-tight">{barn.label}</h2>
      </div>

      {isLayer ? (
        <>
          <p className="text-[12.6px] mt-1.5 mb-2.5 leading-snug" style={{ color: "var(--ink-soft)" }}>
            Mặc cho mỗi con một màu yếm khác nhau, từ nay <b>nhìn ảnh là nhận ra con nào
            là con nào</b>. Yếm cũng che lưng gà mái khỏi bị trống đạp trụi lông.
          </p>
          <BirdGearPanel barnSlug={barn.slug} birds={vmBirds} gear={vmGear} />
        </>
      ) : (
        // Broiler không đặt tên từng con — nói thật là tính năng này không dành cho
        // đàn này, thay vì hiện một danh sách bấm vào đâu cũng bị từ chối.
        <div className="card mt-2 text-center">
          <div className="text-[30px]">🐓</div>
          <div className="font-bold text-[14px] mt-1">Đàn gà thịt đi theo cả lứa</div>
          <p className="text-[12.6px] mt-1 leading-snug" style={{ color: "var(--ink-soft)" }}>
            Yếm chỉ dành cho đàn <b>gà đẻ</b> — nơi bạn đặt tên cho từng con. Đàn này
            gồm {vmBirds.length} con được chăm theo cả đàn.
          </p>
          <Link href={`/chuong/${params.id}/truy-xuat`} className="btn btn-ghost btn-sm mt-2.5 no-underline">
            Xem truy xuất đàn →
          </Link>
        </div>
      )}
    </div>
  );
}
