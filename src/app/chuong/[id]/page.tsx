export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Coop, FarmerAvatar } from "@/components/Illustrations";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";
import { ActionButton } from "@/components/Toast";
import PaymentBanner from "@/components/PaymentBanner";
import { toggleRange } from "@/app/actions";
import { flockProgress, isToday, timeAgo, transferCode } from "@/lib/decor";

export default async function BarnDashboard({ params }: { params: { id: string } }) {
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: {
      worker: true,
      reservation: true,
      decor: { include: { item: true }, orderBy: { z: "asc" } },
      updates: { orderBy: { createdAt: "desc" }, take: 6, include: { worker: true, media: true } },
      media: { orderBy: { capturedAt: "desc" }, take: 12, include: { worker: true } },
      flock: { include: { breed: true, feedingPlan: true, products: true, birds: true, healthEvents: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });
  if (!barn || !barn.flock) return notFound();

  const payment = barn.reservation?.paymentStatus ?? "CONFIRMED";
  const activated = payment === "CONFIRMED";

  const { flock } = barn;
  const isLayer = flock.productLine === "LAYER";
  const eggs = flock.products.find((p) => p.type === "EGG")?.qty ?? 0;
  const endOfLay = isLayer && flock.stage === "END_OF_LAY";
  const closed = flock.stage === "HARVESTED" || flock.stage === "RETIRED";
  const progress = flockProgress(flock.startDate, flock.cycleDays);

  const evt = flock.healthEvents[0];
  const inWithdrawal = !!evt?.withdrawalUntil && new Date(evt.withdrawalUntil) > new Date();

  const decor = barn.decor.map((d) => ({
    svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped,
  }));
  const signLabel = barn.label.replace(/^Chuồng\s*/i, "").replace(/["“”]/g, "");

  const toVM = (m: (typeof barn.media)[number]): MediaVM => ({
    id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
    durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: m.worker?.name ?? null,
  });
  const todays = barn.media.filter((m) => isToday(m.capturedAt)).map(toVM);
  const strip = todays.length ? todays : barn.media.slice(0, 4).map(toVM);

  return (
    <div className="screen">
      <Link href="/nhan-chuong" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Quay lại</Link>
      <div className="coopwrap mt-2" style={{ padding: "14px 14px 4px" }}>
        <Coop decor={decor} outside={barn.outside} label={signLabel} />
      </div>
      <h2 className="display text-[20px] mt-3.5 mb-2.5">{barn.label} · {flock.breed.name}</h2>

      {barn.reservation && !activated && (
        <PaymentBanner
          barnSlug={barn.slug}
          depositVnd={barn.reservation.depositVnd}
          code={transferCode(barn.reservation.id)}
          bank={process.env.NEXT_PUBLIC_HOLD_BANK ?? "Ngân hàng · số TK · Chủ TK"}
          momo={process.env.NEXT_PUBLIC_HOLD_MOMO ?? "09xxxxxxxx"}
          initialStatus={payment}
        />
      )}

      {endOfLay && (
        <Link href={`/chuong/${barn.slug}/ket-chu-ky`} className="no-underline block rounded-[16px] p-[14px] mb-3" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE" }}>
          <div className="font-semibold text-[14px]" style={{ color: "var(--yolk-deep)" }}>🌾 Đàn đã hoàn thành chu kỳ đẻ</div>
          <div className="text-[12.7px] mt-0.5" style={{ color: "var(--ink-soft)" }}>Khi bạn sẵn sàng, chọn hướng đi tiếp — nhận thịt, cho nghỉ hưu, hay nuôi lứa mới. Không có thời hạn. ›</div>
        </Link>
      )}

      {closed && (
        <div className="card mb-3" style={{ background: "var(--paddy-tint)" }}>
          <div className="font-semibold text-[14.5px]">{flock.stage === "HARVESTED" ? "🍲 Đàn đã được nhận thịt" : "🌾 Đàn đã nghỉ hưu ở nông trại"}</div>
          <div className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>Cảm ơn một mùa đẻ trọn vẹn cùng {barn.label}.</div>
          <Link href="/nhan-chuong" className="btn btn-primary mt-3 no-underline">Bắt đầu một chuồng mới →</Link>
        </div>
      )}

      {inWithdrawal && (
        <div className="flex gap-2.5 rounded-[14px] p-3 mb-3 text-[12.7px]" style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
          ⏳<div>
            <b>Đàn đang trong thời gian ngừng thuốc.</b> Trứng/thịt trong giai đoạn này <b>không được giao</b> —
            tụi mình báo bạn trước thay vì im lặng. <Link href={`/chuong/${barn.slug}/truy-xuat`} style={{ color: "var(--paddy)" }}>Xem chi tiết ›</Link>
          </div>
        </div>
      )}

      <div className="statusband">
        <div>
          <div className="sb-k">{isLayer ? "Trứng chu kỳ này" : "Tiến độ"}</div>
          <div className="sb-v">{isLayer ? `${eggs} quả` : `${progress.day}/${progress.total}`}</div>
        </div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Đàn</div><div className="sb-v">{flock.size} con</div></div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">{barn.worker?.name ?? "Nông dân"}</div><div className="sb-v">Đang chăm</div></div>
      </div>

      {!isLayer && !closed && (
        <>
          <div className="mt-2.5 rounded-full overflow-hidden" style={{ height: 7, background: "var(--paper2)", border: "1px solid var(--line)" }}>
            <div style={{ width: `${progress.pct}%`, height: "100%", background: "var(--paddy)" }} />
          </div>
          <div className="mt-2.5">
            <ActionButton
              action={toggleRange.bind(null, barn.slug)}
              className="btn btn-ghost"
              pendingLabel="Đang báo cho nông trại…"
            >{barn.outside ? "🏡 Gọi đàn về chuồng" : "🌿 Cho đàn ra vườn"}</ActionButton>
          </div>
        </>
      )}

      {/* ---------- Ảnh & video ---------- */}
      {strip.length > 0 && (
        <>
          <div className="flex items-end justify-between gap-2 mt-4 mb-2">
            <div className="min-w-0">
              <div className="font-bold text-[15px]">{todays.length ? "Hôm nay ở chuồng bạn" : "Gần đây ở chuồng bạn"}</div>
              <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                {todays.length ? `${todays.length} ảnh/video nông dân gửi hôm nay` : "Chưa có gì mới hôm nay — đây là những gì gần nhất"}
              </div>
            </div>
            <Link href={`/chuong/${barn.slug}/nhat-ky`} className="flex-none text-[13px] font-semibold no-underline whitespace-nowrap" style={{ color: "var(--paddy)" }}>Tất cả ›</Link>
          </div>
          <MediaStrip list={strip} />
        </>
      )}

      {/* ---------- Lối tắt ---------- */}
      <div className="grid grid-cols-2 gap-2.5 mt-3.5">
        <Quick href={`/chuong/${barn.slug}/trang-tri`} ic={activated ? "🎨" : "🔒"} title="Trang trí chuồng"
          sub={!activated ? "Mở khoá sau khi cọc" : barn.decor.length ? `${barn.decor.length} món đã lắp · sắp xếp lại` : "Thêm biển tên, chậu cây…"} />
        <Quick href={`/chuong/${barn.slug}/nhat-ky`} ic="📷" title="Ảnh & video"
          sub={barn.media.length ? `${barn.media.length} mục gần đây` : "Hiện trạng chuồng mỗi ngày"} />
        <Quick href={`/chuong/${barn.slug}/truy-xuat`} ic="🔎" title="Truy xuất & QR" sub="Nhật ký lô nuôi" />
        {barn.workerId
          ? <Quick href={`/nong-dan/${barn.workerId}`} ic="👩‍🌾" title={barn.worker?.name ?? "Nông dân"} sub="Người chăm chuồng" />
          : <Quick href="/nhan-chuong" ic="💚" title="Nhận thêm chuồng" sub="Đặt mua trước" />}
      </div>

      {/* ---------- Nhật ký ---------- */}
      <div className="card mt-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="font-bold text-[14px] min-w-0 truncate">Cập nhật từ nông trại</div>
          <Link href={`/chuong/${barn.slug}/nhat-ky`} className="flex-none text-[12.5px] font-semibold no-underline whitespace-nowrap" style={{ color: "var(--paddy)" }}>Xem tất cả</Link>
        </div>
        {barn.updates.map((u) => (
          <div key={u.id} className="flex gap-3 py-3" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="avatar w-[34px] h-[34px] flex-none"><FarmerAvatar /></div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-[13px]">{u.worker.name}</span>
              <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}> · {timeAgo(u.createdAt)}</span>
              <div className="text-[13.3px] mt-0.5">{u.text}</div>
              {u.media.length > 0 && (
                <MediaStrip compact list={u.media.map((m) => ({
                  id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
                  durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: u.worker.name,
                }))} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Quick({ href, ic, title, sub }: { href: string; ic: string; title: string; sub: string }) {
  return (
    <Link href={href} className="quick no-underline">
      <div className="w-8 h-8 rounded-[9px] grid place-items-center" style={{ background: "var(--paddy-tint)", color: "var(--paddy)" }}>{ic}</div>
      <div className="font-semibold text-[14px]">{title}</div>
      <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>{sub}</div>
    </Link>
  );
}
