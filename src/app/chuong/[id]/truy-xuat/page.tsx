export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { QRCode } from "@/components/Illustrations";
import { fmtVnd } from "@/lib/pricing";
import { flockProgress } from "@/lib/decor";
import BarnLocked from "@/components/BarnLocked";
import { canViewBarn, requireUser } from "@/lib/auth";
import { STAGE_VI } from "@/lib/flock";

export default async function Trace({ params }: { params: { id: string } }) {
  await requireUser(`/chuong/${params.id}/truy-xuat`);
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: {
      worker: true,
      decor: { include: { item: true } },
      _count: { select: { media: true, updates: true } },
      flock: {
        include: {
          breed: true, feedingPlan: true,
          healthEvents: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!barn || !barn.flock) return notFound();
  if (!(await canViewBarn(barn, `/chuong/${params.id}/truy-xuat`))) return <BarnLocked slug={barn.slug} />;

  const { flock } = barn;
  const isLayer = flock.productLine === "LAYER";
  const evt = flock.healthEvents[0];
  const inWithdrawal = !!evt?.withdrawalUntil && new Date(evt.withdrawalUntil) > new Date();
  const progress = flockProgress(flock.startDate, flock.cycleDays);

  // Mã lô suy ra từ dữ liệu thật, không phải số cứng
  const start = new Date(flock.startDate);
  const lot = `CC-${isLayer ? "L" : "B"}-${String(start.getDate()).padStart(2, "0")}${String(start.getMonth() + 1).padStart(2, "0")}-${barn.slug.slice(-4).toUpperCase()}`;
  const medsTotal = flock.healthEvents.reduce((s, e) => s + e.medsCostVnd, 0);

  const KV = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="kv"><span style={{ color: "var(--ink-soft)" }}>{k}</span><span className="font-semibold text-right">{v}</span></div>
  );

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>

      <div className="card mt-2">
        <div className="flex justify-between items-start gap-3">
          <div><span className="eyebrow">Truy xuất</span><h2 className="display text-[18px] mt-0.5 leading-tight">Lô {lot}</h2></div>
          <div className="w-[104px] h-[104px] flex-none rounded-[12px] p-2 bg-white" style={{ border: "1px solid var(--line)" }}><QRCode /></div>
        </div>
        <div className="mt-3">
          <KV k="Chuồng" v={barn.label} />
          <KV k="Giống" v={flock.breed.name} />
          <KV k="Chế độ ăn" v={`${flock.feedingPlan.name} · ${flock.feedingPlan.ratio}`} />
          <KV k="Trạng thái đàn" v={`${STAGE_VI[flock.stage] ?? flock.stage} · ${flock.size} con`} />
          <KV k="Vào đàn" v={start.toLocaleDateString("vi-VN")} />
          <KV k={isLayer ? "Chu kỳ" : "Tiến độ"} v={`Ngày ${progress.day} / ${progress.total}`} />
          <KV k="Người chăm" v={barn.worker ? `${barn.worker.name} (${barn.worker.area})` : "—"} />
          {/* Nói đúng những gì có trong sổ. Chưa ghi nhận thì nói chưa, không khẳng định bừa. */}
          <KV
            k="Tiêm phòng úm"
            v={flock.vaccinatedAt
              ? `✓ Đã tiêm ${new Date(flock.vaccinatedAt).toLocaleDateString("vi-VN")}`
              : <span style={{ color: "var(--ink-soft)", fontWeight: 500 }}>Chưa cập nhật</span>}
          />
          <KV k="Bằng chứng" v={`${barn._count.media} ảnh/video · ${barn._count.updates} ghi chép`} />
        </div>

        <div className="flex gap-2.5 rounded-[13px] p-[11px] mt-3 text-[12.6px]" style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
          ⏳ <div>
            <b>Thời gian ngừng thuốc:</b> nếu đàn phải dùng thuốc, trứng/thịt trong thời gian ngừng thuốc <b>sẽ không được giao</b>. Trạng thái:{" "}
            {inWithdrawal
              ? <b style={{ color: "#B4472F" }}>Đang ngừng thuốc tới {new Date(evt!.withdrawalUntil!).toLocaleDateString("vi-VN")} — tạm dừng giao</b>
              : <b style={{ color: "var(--paddy)" }}>Không trong thời gian ngừng thuốc — an toàn giao</b>}.
          </div>
        </div>
      </div>

      {/* ---------- Lịch sử sức khoẻ ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">Lịch sử sức khoẻ</div>
        <p className="text-[12px] mb-2" style={{ color: "var(--ink-soft)" }}>
          Kể cả tin xấu. Thuốc tính đúng giá gốc, ghi rõ từng khoản.
        </p>
        {flock.healthEvents.length === 0 ? (
          <div className="text-[13px]" style={{ color: "var(--ink-soft)" }}>Chưa có sự cố nào được ghi nhận.</div>
        ) : (
          flock.healthEvents.map((e) => (
            <div key={e.id} className="py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                  style={e.status === "RECOVERED"
                    ? { background: "var(--paddy-tint)", color: "var(--paddy-deep)" }
                    : { background: "#FCF3E8", color: "#8a5a1a" }}>{e.status}</span>
                <span className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>{new Date(e.createdAt).toLocaleDateString("vi-VN")}</span>
                <span className="ml-auto font-semibold text-[12.6px]">{fmtVnd(e.medsCostVnd)}</span>
              </div>
              <div className="text-[13px] mt-1">{e.description}</div>
              {e.vetNote && <div className="text-[12px] mt-1" style={{ color: "var(--ink-soft)" }}>🩺 {e.vetNote}</div>}
            </div>
          ))
        )}
        {medsTotal > 0 && (
          <div className="flex justify-between text-[13px] pt-2.5 mt-1" style={{ borderTop: "1px dashed var(--line)" }}>
            <span style={{ color: "var(--ink-soft)" }}>Tổng tiền thuốc (giá gốc)</span><b>{fmtVnd(medsTotal)}</b>
          </div>
        )}
      </div>

      {/* ---------- Decor đã lắp ---------- */}
      {barn.decor.length > 0 && (
        <div className="card mt-3">
          <div className="font-bold text-[14px] mb-1.5">Đã lắp theo yêu cầu của bạn</div>
          {barn.decor.map((d) => (
            <div key={d.id} className="kv">
              <span style={{ color: "var(--ink-soft)" }}>{d.item.name}</span>
              <span className="font-semibold">{new Date(d.installedAt).toLocaleDateString("vi-VN")}</span>
            </div>
          ))}
        </div>
      )}

      <Link href={`/chuong/${params.id}/nhat-ky`} className="btn btn-ghost mt-3 no-underline">Xem toàn bộ ảnh & nhật ký →</Link>
    </div>
  );
}
