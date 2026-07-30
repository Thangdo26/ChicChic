export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import DecorStudio, { type CatalogItem, type Placed } from "@/components/DecorStudio";
import { DECOR_CATEGORIES } from "@/data/catalog";

export default async function Decor({ params }: { params: { id: string } }) {
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: { decor: { include: { item: true }, orderBy: { z: "asc" } } },
  });
  if (!barn) return notFound();

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
