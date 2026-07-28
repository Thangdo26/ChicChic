import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { QRCode } from "@/components/Illustrations";

export default async function Trace({ params }: { params: { id: string } }) {
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: { worker: true, flock: { include: { breed: true, feedingPlan: true, healthEvents: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  if (!barn || !barn.flock) return notFound();
  const isLayer = barn.flock.productLine === "LAYER";
  const evt = barn.flock.healthEvents[0];
  const inWithdrawal = evt?.withdrawalUntil && new Date(evt.withdrawalUntil) > new Date();

  const KV = ({ k, v }: { k: string; v: string }) => (<div className="kv"><span style={{ color: "var(--ink-soft)" }}>{k}</span><span className="font-semibold">{v}</span></div>);

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>
      <div className="card mt-2">
        <div className="flex justify-between items-start">
          <div><span className="eyebrow">Truy xuất</span><h2 className="display text-[19px] mt-0.5">Lô CC-{isLayer ? "L" : "B"}-2607</h2></div>
          <div className="w-[120px] h-[120px] rounded-[12px] p-2 bg-white" style={{ border: "1px solid var(--line)" }}><QRCode /></div>
        </div>
        <div className="mt-3">
          <KV k="Chuồng" v={barn.label} />
          <KV k="Giống" v={barn.flock.breed.name} />
          <KV k="Chế độ ăn" v={`${barn.flock.feedingPlan.name} · ${barn.flock.feedingPlan.ratio}`} />
          <KV k="Người chăm" v={`${barn.worker?.name} (${barn.worker?.area})`} />
          <KV k="Tiêm phòng úm" v="✓ Đã tiêm theo quy định" />
        </div>
        <div className="flex gap-2.5 rounded-[13px] p-[11px] mt-3 text-[12.6px]" style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
          ⏳ <div><b>Thời gian ngừng thuốc:</b> nếu đàn phải dùng thuốc, trứng/thịt trong thời gian ngừng thuốc <b>sẽ không được giao</b>. Trạng thái: {inWithdrawal ? <b style={{ color: "#B4472F" }}>Đang ngừng thuốc — tạm dừng giao</b> : <b style={{ color: "var(--paddy)" }}>Không dùng thuốc — an toàn giao</b>}.</div>
        </div>
      </div>
    </div>
  );
}
