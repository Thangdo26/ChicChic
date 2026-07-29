export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Coop, FarmerAvatar } from "@/components/Illustrations";
import { toggleRange } from "@/app/actions";

export default async function BarnDashboard({ params }: { params: { id: string } }) {
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: {
      worker: true,
      decor: { include: { item: true } },
      updates: { orderBy: { createdAt: "desc" }, take: 8, include: { worker: true } },
      flock: { include: { breed: true, feedingPlan: true, products: true, birds: true } },
    },
  });
  if (!barn || !barn.flock) return notFound();

  const isLayer = barn.flock.productLine === "LAYER";
  const decorKeys = barn.decor.map((d: { item: { svgKey: string } }) => d.item.svgKey);
  const eggs = barn.flock.products.find((p: { type: string; qty: number }) => p.type === "EGG")?.qty ?? 0;
  const stage: string = barn.flock.stage;
  const endOfLay = isLayer && stage === "END_OF_LAY";
  const closed = stage === "HARVESTED" || stage === "RETIRED";

  return (
    <>
      <div className="screen">
        <Link href="/nhan-chuong" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Quay lại</Link>
        <div className="coopwrap mt-2" style={{ padding: "14px 14px 4px" }}><Coop decor={decorKeys} outside={barn.outside} /></div>
        <h2 className="display text-[20px] mt-3.5 mb-2.5">{barn.label} · {barn.flock.breed.name}</h2>

        {endOfLay && (
          <Link href={`/chuong/${barn.slug}/ket-chu-ky`} className="no-underline block rounded-[16px] p-[14px] mb-3" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE" }}>
            <div className="font-semibold text-[14px]" style={{ color: "var(--yolk-deep)" }}>🌾 Đàn đã hoàn thành chu kỳ đẻ</div>
            <div className="text-[12.7px] mt-0.5" style={{ color: "var(--ink-soft)" }}>Khi bạn sẵn sàng, chọn hướng đi tiếp — nhận thịt, cho nghỉ hưu, hay nuôi lứa mới. Không có thời hạn. ›</div>
          </Link>
        )}

        {closed && (
          <div className="card mb-3" style={{ background: "var(--paddy-tint)" }}>
            <div className="font-semibold text-[14.5px]">{stage === "HARVESTED" ? "🍲 Đàn đã được nhận thịt" : "🌾 Đàn đã nghỉ hưu ở nông trại"}</div>
            <div className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>Cảm ơn một mùa đẻ trọn vẹn cùng {barn.label}.</div>
            <Link href="/nhan-chuong" className="btn btn-primary mt-3 no-underline">Bắt đầu một chuồng mới →</Link>
          </div>
        )}

        <div className="statusband">
          <div><div className="text-[11.5px] opacity-80">{isLayer ? "Trứng tháng này" : "Tiến độ nuôi"}</div><div className="font-bold text-[16px]">{isLayer ? `${eggs} quả` : "Ngày 41 / 75"}</div></div>
          <div className="w-px self-stretch" style={{ background: "rgba(255,255,255,.18)" }} />
          <div><div className="text-[11.5px] opacity-80">Đàn</div><div className="font-bold text-[16px]">{barn.flock.size} con</div></div>
          <div className="w-px self-stretch" style={{ background: "rgba(255,255,255,.18)" }} />
          <div><div className="text-[11.5px] opacity-80">{barn.worker?.name ?? "Nông dân"}</div><div className="font-bold text-[16px]">Đang chăm</div></div>
        </div>

        {!isLayer && (
          <form action={toggleRange.bind(null, barn.slug)} className="mt-3">
            <button className="btn btn-ghost" type="submit">{barn.outside ? "🏡 Gọi đàn về chuồng" : "🌿 Cho đàn ra vườn"}</button>
          </form>
        )}

        <div className="grid grid-cols-2 gap-2.5 mt-3.5">
          <Link href={`/chuong/${barn.slug}/trang-tri`} className="quick no-underline"><div className="w-8 h-8 rounded-[9px] grid place-items-center" style={{ background: "var(--paddy-tint)", color: "var(--paddy)" }}>🎨</div><div className="font-semibold text-[14px]">Trang trí chuồng</div><div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>{barn.decor.length ? `${barn.decor.length} món đã lắp` : "Thêm biển tên, chậu cây…"}</div></Link>
          <Link href={`/chuong/${barn.slug}/truy-xuat`} className="quick no-underline"><div className="w-8 h-8 rounded-[9px] grid place-items-center" style={{ background: "var(--paddy-tint)", color: "var(--paddy)" }}>🔎</div><div className="font-semibold text-[14px]">Truy xuất & QR</div><div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>Nhật ký lô nuôi</div></Link>
          {barn.workerId && <Link href={`/nong-dan/${barn.workerId}`} className="quick no-underline"><div className="w-8 h-8 rounded-[9px] grid place-items-center" style={{ background: "var(--paddy-tint)", color: "var(--paddy)" }}>👩‍🌾</div><div className="font-semibold text-[14px]">{barn.worker?.name}</div><div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>Người chăm chuồng</div></Link>}
          <Link href="/nhan-chuong" className="quick no-underline"><div className="w-8 h-8 rounded-[9px] grid place-items-center" style={{ background: "var(--paddy-tint)", color: "var(--paddy)" }}>💚</div><div className="font-semibold text-[14px]">Nhận thêm chuồng</div><div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>Đặt mua trước</div></Link>
        </div>

        <div className="card mt-3.5">
          <div className="font-bold text-[14px] mb-1">Cập nhật từ nông trại</div>
          {barn.updates.map((u: { id: string; worker: { name: string }; createdAt: Date; text: string }) => (
            <div key={u.id} className="flex gap-3 py-3" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <div className="avatar w-[34px] h-[34px]"><FarmerAvatar /></div>
              <div className="flex-1">
                <span className="font-semibold text-[13px]">{u.worker.name}</span>
                <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}> · {timeAgo(u.createdAt)}</span>
                <div className="text-[13.3px] mt-0.5">{u.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function timeAgo(d: Date) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}
