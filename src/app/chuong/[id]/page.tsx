export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Coop, FarmerAvatar } from "@/components/Illustrations";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";
import { ActionButton } from "@/components/Toast";
import PaymentBanner from "@/components/PaymentBanner";
import { toggleRange } from "@/app/actions";
import { canViewBarn, getSessionUser, requireUser } from "@/lib/auth";
import BarnLocked from "@/components/BarnLocked";
import TaskPanel, { type TaskVM } from "@/components/TaskPanel";
import { flockProgress, isToday, timeAgo, transferCode } from "@/lib/decor";
import { unreadFor } from "@/lib/messages";
import { track } from "@/lib/track";
import type { TaskKind, TaskStatus } from "@/lib/tasks";

export default async function BarnDashboard({ params }: { params: { id: string } }) {
  // Chặn TRƯỚC khi truy vấn: khách chưa đăng nhập được chuyển hướng ngay,
  // không phải chờ một query nặng rồi mới bị từ chối.
  await requireUser(`/chuong/${params.id}`);

  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: {
      worker: true,
      reservation: true,
      decor: { include: { item: true }, orderBy: { z: "asc" } },
      // Một chuồng chỉ thuộc MỘT nông dân → dùng barn.worker, khỏi join lại ở từng ghi chép.
      updates: { orderBy: { createdAt: "desc" }, take: 6, include: { media: true } },
      media: { orderBy: { capturedAt: "desc" }, take: 12 },
      tasks: { orderBy: { createdAt: "desc" }, take: 8, include: { proof: { select: { url: true, type: true } } } },
      flock: { include: { breed: true, feedingPlan: true, products: true, healthEvents: { orderBy: { createdAt: "desc" }, take: 1 } } },
    },
  });
  if (!barn || !barn.flock) return notFound();
  if (!(await canViewBarn(barn, `/chuong/${params.id}`))) return <BarnLocked slug={barn.slug} />;

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
    durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: barn.worker?.name ?? null,
  });
  const todays = barn.media.filter((m) => isToday(m.capturedAt)).map(toVM);
  const strip = todays.length ? todays : barn.media.slice(0, 4).map(toVM);

  const me = await getSessionUser();
  const isOwner = !!me && me.id === barn.ownerId;
  // Tin chưa đọc trong hộp thư — chỉ chủ chuồng mới có hộp thư ở trang này.
  const unreadMsgs = isOwner ? await unreadFor(barn.id, me.id) : 0;
  // Tín hiệu giữ chân: chủ chuồng có mở chuồng của mình hôm nay không.
  // Chỉ ghi cho CHỦ chuồng — lượt xem chuồng trưng bày không phải là giữ chân.
  if (isOwner) {
    await track("barn_opened", {
      userId: me.id, barnSlug: barn.slug,
      props: {
        productLine: flock.productLine,
        stage: flock.stage,
        freshMediaToday: todays.length,
        openTasks: barn.tasks.filter((t) => t.status === "OPEN").length,
      },
    });
  }
  // Chuồng trưng bày mà người xem không sở hữu → xem cho biết trước khi nhận nuôi.
  const isDemoView = !isOwner && barn.isPublic && me?.role === "USER";
  const tasks: TaskVM[] = barn.tasks.map((t) => ({
    id: t.id, kind: t.kind as TaskKind, title: t.title, note: t.note,
    dueAt: t.dueAt?.toISOString() ?? null, status: t.status as TaskStatus,
    createdAt: t.createdAt.toISOString(), doneAt: t.doneAt?.toISOString() ?? null,
    doneNote: t.doneNote, proofUrl: t.proof?.url ?? null, proofType: t.proof?.type ?? null,
  }));
  const rangePending = barn.tasks.some((t) => t.status === "OPEN" && (t.kind === "RANGE_OUT" || t.kind === "RANGE_IN"));

  return (
    <div className="screen">
      <Link href="/chuong" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Quay lại</Link>
      <div className="coopwrap mt-2" style={{ padding: "14px 14px 4px" }}>
        <Coop decor={decor} outside={barn.outside} label={signLabel} />
      </div>
      <h2 className="display text-[20px] mt-3.5 mb-2.5">{barn.label} · {flock.breed.name}</h2>

      {isDemoView && (
        <div className="flex gap-2.5 rounded-[14px] p-3 mb-3 text-[12.7px]"
          style={{ background: "var(--paddy-tint)", border: "1px solid #CDE0C6" }}>
          👀<div>
            <b>Đây là chuồng mô phỏng.</b> Chuồng có thật ở nông trại, nhưng do bạn khác nhận nuôi —
            bạn xem để hình dung, chưa giao việc hay trang trí được.{" "}
            <Link href="/nhan-chuong" className="font-semibold" style={{ color: "var(--paddy)" }}>Nhận chuồng cho riêng bạn ›</Link>
          </div>
        </div>
      )}

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
              disabled={!isOwner || rangePending}
              pendingLabel="Đang nhắn nông dân…"
            >
              {rangePending
                ? "⏳ Đang chờ nông dân ra chuồng"
                : barn.outside ? "🏡 Nhờ gọi đàn về chuồng" : "🌿 Nhờ thả đàn ra vườn"}
            </ActionButton>
            <p className="text-[11.5px] mt-1.5 text-center" style={{ color: "var(--ink-soft)" }}>
              Cửa chuồng ngoài đời do {barn.worker?.name ?? "nông dân"} mở — bấm là gửi việc, xong sẽ có ảnh gửi về.
            </p>
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

      {/* ---------- Hộp thư ----------
          Để nguyên một hàng riêng phía trên lưới lối tắt: đây là chỗ duy nhất chủ chuồng
          hỏi được một câu mà không phải giao việc, và tin chưa đọc cần được nhìn thấy ngay. */}
      {isOwner && barn.worker && (
        <Link href={`/chuong/${barn.slug}/tin-nhan`} className="card flex items-center gap-3 mt-3.5 no-underline"
          style={unreadMsgs > 0 ? { borderColor: "#EBD8AE", background: "#FFFDF6" } : undefined}>
          <span className="flex-none text-[18px]">💬</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[13.8px]" style={{ color: "var(--ink)" }}>
              Nhắn với {barn.worker.name}
            </div>
            <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
              {unreadMsgs > 0
                ? `${unreadMsgs} tin mới chưa đọc`
                : `Hỏi han về đàn gà — ${barn.worker.name} thường trả lời trong ngày`}
            </div>
          </div>
          {unreadMsgs > 0 && (
            <span className="flex-none text-[11px] font-bold rounded-full px-2 py-0.5"
              style={{ background: "var(--yolk)", color: "#3a2a08" }}>{unreadMsgs}</span>
          )}
          <span className="flex-none font-semibold text-[14px]" style={{ color: "var(--paddy)" }}>›</span>
        </Link>
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

      {/* ---------- Việc giao cho nông dân ---------- */}
      {barn.worker && activated && (
        <TaskPanel
          barnSlug={barn.slug}
          workerName={barn.worker.name}
          tasks={tasks}
          canAssign={isOwner}
        />
      )}

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
              <span className="font-semibold text-[13px]">{barn.worker?.name ?? "Nông trại"}</span>
              <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}> · {timeAgo(u.createdAt)}</span>
              <div className="text-[13.3px] mt-0.5">{u.text}</div>
              {u.media.length > 0 && (
                <MediaStrip compact list={u.media.map((m) => ({
                  id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
                  durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: barn.worker?.name ?? null,
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
