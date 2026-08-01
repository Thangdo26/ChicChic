export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import DecorStudio, { type CatalogItem, type Placed } from "@/components/DecorStudio";
import BarnLocked from "@/components/BarnLocked";
import { canViewBarn, requireUser } from "@/lib/auth";
import { DECOR_CATEGORIES } from "@/data/catalog";

export default async function Decor({ params }: { params: { id: string } }) {
  await requireUser(`/chuong/${params.id}/trang-tri`);
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: {
      reservation: { select: { paymentStatus: true } },
      decor: { include: { item: true }, orderBy: { z: "asc" } },
    },
    // isPublic + ownerId đi kèm mặc định — canViewBarn cần cả hai
  });
  if (!barn) return notFound();
  if (!(await canViewBarn(barn, `/chuong/${params.id}/trang-tri`))) return <BarnLocked slug={barn.slug} />;

  // Decor là tính năng trả phí — khoá tới khi cọc được đối soát
  const activated = !barn.reservation || barn.reservation.paymentStatus === "CONFIRMED";
  if (!activated) {
    return (
      <div className="screen">
        <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>
        <div className="soft text-center py-8 mt-3">
          <div className="text-[34px]">🔒</div>
          <h2 className="display text-[19px] mt-2">Trang trí mở khoá sau khi cọc</h2>
          <p className="lede mt-2 px-2">
            Hoàn tất cọc giữ chỗ là bạn kéo-thả trang trí chuồng được ngay — cô chú nông dân sẽ lắp thật theo đúng bố cục bạn xếp.
          </p>
          <Link href={`/chuong/${params.id}`} className="btn btn-primary mt-4 no-underline">Hoàn tất cọc →</Link>
        </div>
      </div>
    );
  }

  const items = await prisma.decorItem.findMany({ orderBy: { sortOrder: "asc" } });

  const placed: Placed[] = barn.decor.map((d) => ({
    itemSlug: d.item.slug, name: d.item.name, svgKey: d.item.svgKey, priceVnd: d.item.priceVnd,
    x: d.x, y: d.y, scale: d.scale, z: d.z, flipped: d.flipped,
  }));

  const catalog: CatalogItem[] = items.map((i) => ({
    slug: i.slug, name: i.name, svgKey: i.svgKey, priceVnd: i.priceVnd, category: i.category, blurb: i.blurb,
  }));

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>
      <span className="eyebrow block mt-2">Trang trí thật</span>
      <h2 className="display text-[21px] mt-1 mb-1.5">Bạn xếp, nông dân lắp thật</h2>
      <p className="lede">
        Kéo từng món tới đúng chỗ bạn muốn trên chuồng. Bố cục này được gửi tới nông trại —
        lắp xong bạn nhận một tấm ảnh chứng minh.
      </p>

      <DecorStudio
        barnSlug={barn.slug}
        barnLabel={barn.label.replace(/^Chuồng\s*/i, "").replace(/["“”]/g, "")}
        outside={barn.outside}
        placed={placed}
        catalog={catalog}
        categories={DECOR_CATEGORIES.map((c) => ({ ...c }))}
      />
    </div>
  );
}
