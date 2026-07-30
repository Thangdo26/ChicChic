export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { FarmerAvatar } from "@/components/Illustrations";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";
import { BASE_PRICES } from "@/data/catalog";
import { fmtVnd } from "@/lib/pricing";
import { timeAgo } from "@/lib/decor";

export default async function Farmer({ params }: { params: { id: string } }) {
  const w = await prisma.farmWorker.findUnique({
    where: { id: params.id },
    include: {
      farm: true,
      barns: { include: { flock: { select: { productLine: true, size: true, stage: true } } } },
      updates: { orderBy: { createdAt: "desc" }, take: 5, include: { barn: { select: { slug: true, label: true } } } },
      media: { orderBy: { capturedAt: "desc" }, take: 8 },
    },
  });
  if (!w) return notFound();

  const strip: MediaVM[] = w.media.map((m) => ({
    id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
    durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: w.name,
  }));

  return (
    <div className="screen">
      <div className="card">
        <div className="flex gap-3.5 items-center">
          <div className="avatar w-16 h-16 flex-none"><FarmerAvatar /></div>
          <div>
            <h2 className="display text-[20px]">{w.name}</h2>
            <p className="lede mt-0.5">{w.area} · nuôi gà thả vườn</p>
            <p className="text-[11.8px] mt-0.5" style={{ color: "var(--ink-soft)" }}>{w.farm.name}</p>
          </div>
        </div>
        {w.bio && <p className="text-[13.6px] mt-3" style={{ color: "var(--ink-soft)" }}>“{w.bio}”</p>}

        <div className="flex justify-between items-center rounded-[14px] p-[13px] mt-3.5" style={{ background: "var(--paddy-tint)" }}>
          <div>
            <div className="text-[12px]" style={{ color: "var(--paddy-deep)" }}>Phần công {w.name} nhận từ một chuồng</div>
            <div className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>Trích minh bạch trong phí bạn trả</div>
          </div>
          <div className="display font-bold text-[18px]" style={{ color: "var(--paddy-deep)" }}>{fmtVnd(BASE_PRICES.LAYER.cong)}</div>
        </div>

        {w.consentMedia && (
          <p className="text-[11.5px] mt-2.5" style={{ color: "var(--ink-soft)" }}>
            {w.name} đã đồng ý xuất hiện trong hình ảnh/video gửi tới bạn.
          </p>
        )}
      </div>

      {/* ---------- Chuồng đang chăm ---------- */}
      {w.barns.length > 0 && (
        <div className="card mt-3">
          <div className="font-bold text-[14px] mb-1.5">Đang chăm {w.barns.length} chuồng</div>
          {w.barns.map((b) => (
            <Link key={b.id} href={`/chuong/${b.slug}`} className="flex items-center gap-2 py-2 no-underline" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13.3px] truncate" style={{ color: "var(--ink)" }}>{b.label}</div>
                <div className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>
                  {b.flock ? `${b.flock.productLine === "LAYER" ? "Gà đẻ" : "Gà thịt"} · ${b.flock.size} con` : "Chưa vào đàn"}
                </div>
              </div>
              <span className="text-[13px] font-semibold" style={{ color: "var(--paddy)" }}>›</span>
            </Link>
          ))}
        </div>
      )}

      {/* ---------- Ảnh gần đây ---------- */}
      {strip.length > 0 && (
        <>
          <div className="label">{w.name} gửi gần đây</div>
          <MediaStrip list={strip} />
        </>
      )}

      {/* ---------- Ghi chép gần đây ---------- */}
      {w.updates.length > 0 && (
        <div className="card mt-3">
          <div className="font-bold text-[14px] mb-1.5">Ghi chép gần đây</div>
          {w.updates.map((u) => (
            <div key={u.id} className="py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <div className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>{u.barn.label} · {timeAgo(u.createdAt)}</div>
              <div className="text-[13.2px] mt-0.5">{u.text}</div>
            </div>
          ))}
        </div>
      )}

      <div className="soft mt-3 text-[13px]">
        <b>Vì sao ChicChic không phải &ldquo;app nuôi gà online&rdquo; kiểu lừa đảo?</b>
        <ul className="mt-2 pl-[18px]" style={{ color: "var(--ink-soft)" }}>
          <li>Có farm thật, người thật, địa chỉ thật.</li>
          <li>Bạn trả tiền để <b>nhận nông sản</b>, không phải để &ldquo;sinh lời&rdquo;.</li>
          <li>Tin xấu (gà ốm/chết) cũng được báo thật.</li>
        </ul>
      </div>
    </div>
  );
}
