export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { FarmerAvatar } from "@/components/Illustrations";
import { BASE_PRICES } from "@/data/catalog";
import { fmtVnd } from "@/lib/pricing";

export default async function Farmer({ params }: { params: { id: string } }) {
  const w = await prisma.farmWorker.findUnique({ where: { id: params.id } });
  if (!w) return notFound();

  return (
    <div className="screen">
      <div className="card">
        <div className="flex gap-3.5 items-center">
          <div className="avatar w-16 h-16"><FarmerAvatar /></div>
          <div><h2 className="display text-[20px]">{w.name}</h2><p className="lede mt-0.5">{w.area} · nuôi gà thả vườn</p></div>
        </div>
        {w.bio && <p className="text-[13.6px] mt-3" style={{ color: "var(--ink-soft)" }}>“{w.bio}”</p>}
        <div className="flex justify-between items-center rounded-[14px] p-[13px] mt-3.5" style={{ background: "var(--paddy-tint)" }}>
          <div><div className="text-[12px]" style={{ color: "var(--paddy-deep)" }}>Phần công {w.name} nhận từ một chuồng</div><div className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>Trích minh bạch trong phí bạn trả</div></div>
          <div className="display font-bold text-[18px]" style={{ color: "var(--paddy-deep)" }}>{fmtVnd(BASE_PRICES.LAYER.cong)}</div>
        </div>
        {w.consentMedia && <p className="text-[11.5px] mt-2.5" style={{ color: "var(--ink-soft)" }}>{w.name} đã đồng ý xuất hiện trong hình ảnh/video gửi tới bạn.</p>}
      </div>

      <div className="soft mt-3 text-[13px]">
        <b>Vì sao ChicChic không phải "app nuôi gà online" kiểu lừa đảo?</b>
        <ul className="mt-2 pl-[18px]" style={{ color: "var(--ink-soft)" }}>
          <li>Có farm thật, người thật, địa chỉ thật.</li>
          <li>Bạn trả tiền để <b>nhận nông sản</b>, không phải để "sinh lời".</li>
          <li>Tin xấu (gà ốm/chết) cũng được báo thật.</li>
        </ul>
      </div>
    </div>
  );
}
