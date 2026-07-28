import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DecorFigure } from "@/components/Illustrations";
import { installDecor } from "@/app/actions";
import { fmtVnd } from "@/lib/pricing";

export default async function Decor({ params }: { params: { id: string } }) {
  const barn = await prisma.barn.findUnique({ where: { slug: params.id }, include: { decor: true } });
  if (!barn) return notFound();
  const items = await prisma.decorItem.findMany();
  const owned = new Set(barn.decor.map((d: { itemId: string }) => d.itemId));

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>
      <span className="eyebrow block mt-2">Trang trí thật</span>
      <h2 className="display text-[21px] mt-1 mb-1.5">Bạn đặt, cô Lan lắp thật</h2>
      <p className="lede">Mỗi món được lắp vào chuồng thật của bạn ở nông trại — và bạn nhận ngay một tấm ảnh chứng minh.</p>

      <div className="grid grid-cols-2 gap-2.5 mt-3.5">
        {items.map((d: { id: string; slug: string; name: string; priceVnd: number; svgKey: string }) => (
          <div key={d.id} className="card text-center">
            <div className="h-16 grid place-items-center"><DecorFigure svgKey={d.svgKey} /></div>
            <div className="font-semibold text-[13.5px]">{d.name}</div>
            <div className="text-[12px] mb-2.5" style={{ color: "var(--ink-soft)" }}>{fmtVnd(d.priceVnd)}</div>
            {owned.has(d.id) ? (
              <span className="font-semibold text-[12.5px] inline-flex gap-1.5 items-center" style={{ color: "var(--paddy)" }}>✓ Cô Lan đã lắp</span>
            ) : (
              <form action={installDecor.bind(null, params.id, d.slug)}><button className="btn btn-yolk btn-sm w-full" type="submit">Đặt lắp</button></form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
