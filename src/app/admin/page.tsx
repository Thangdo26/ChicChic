export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { confirmPayment, deleteMedia, setEndOfLay } from "@/app/actions";
import { toggleWorkerActive } from "@/app/admin-actions";
import { ActionButton } from "@/components/Toast";
import { MediaForm, UpdateForm } from "@/components/AdminForms";
import { CreateWorkerForm, WorkerAccountRow } from "@/components/WorkerAccountForms";
import { fmtVnd } from "@/lib/pricing";
import { timeAgo, transferCode } from "@/lib/decor";

export default async function Admin() {
  const [barns, media, reservations] = await Promise.all([
    prisma.barn.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        flock: { select: { productLine: true, stage: true, size: true } },
        updates: { orderBy: { createdAt: "desc" }, take: 2 },
        _count: { select: { media: true, decor: true } },
      },
    }),
    prisma.barnMedia.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { barn: { select: { slug: true, label: true } } } }),
    prisma.reservation.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: true, barn: { select: { slug: true } } } }),
  ]);

  // Nông dân + tài khoản đăng nhập của họ (cột userId là unique nên 1-1)
  const workers = await prisma.farmWorker.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, area: true, active: true, maxBarns: true,
      user: { select: { username: true, email: true } },
      _count: { select: { barns: true } },
    },
  });

  // Đơn chưa xong cọc — REPORTED (user đã báo chuyển) lên đầu vì cần xử lý ngay
  const awaiting = await prisma.reservation.findMany({
    where: { paymentStatus: { not: "CONFIRMED" }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
    include: { user: true, barn: { select: { slug: true, label: true } } },
    orderBy: [{ paymentStatus: "desc" }, { createdAt: "asc" }],
  });

  const locked = !!process.env.ADMIN_PASSWORD;
  const barnOptions = barns.map((b) => ({ slug: b.slug, label: b.label }));
  const unlinked = workers.filter((w) => !w.user).map((w) => ({ id: w.id, name: w.name, area: w.area }));

  return (
    <div className="screen">
      <span className="eyebrow">Bảng điều khiển nông trại</span>
      <h2 className="display text-[21px] mt-1 mb-3">Quản lý chuồng</h2>

      {!locked && (
        <div className="rounded-[14px] p-3 mb-3 text-[12.7px]" style={{ background: "#FCEDE9", border: "1px solid #F0C9BE", color: "#8A3A26" }}>
          ⚠️ <b>Trang này đang KHÔNG có mật khẩu.</b> Ai biết đường dẫn cũng vào đăng bài được.
          Đặt biến môi trường <code>ADMIN_PASSWORD</code> (trên Vercel: Settings → Environment Variables) rồi deploy lại
          <b> trước khi</b> chia link ra ngoài.
        </div>
      )}

      {/* ---------- Tổng quan chuồng ---------- */}
      <div className="card">
        <div className="font-bold text-[14px] mb-1.5">Các chuồng ({barns.length})</div>
        {barns.map((b) => (
          <div key={b.id} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13.3px] truncate">{b.label}</div>
              <div className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>
                /{b.slug} · {b.flock?.productLine === "LAYER" ? "gà đẻ" : "gà thịt"} · {b.flock?.stage ?? "—"} ·
                {" "}{b._count.media} media · {b._count.decor} decor
              </div>
            </div>
            <Link href={`/chuong/${b.slug}`} className="btn btn-ghost btn-sm flex-none no-underline">Mở</Link>
          </div>
        ))}
      </div>

      {/* ---------- Đối soát cọc ---------- */}
      <div className="card mt-3" style={awaiting.some((r) => r.paymentStatus === "REPORTED") ? { borderColor: "var(--yolk)" } : undefined}>
        <div className="font-bold text-[14px] mb-1">💰 Đối soát cọc ({awaiting.length} đơn chờ)</div>
        <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
          Kiểm tra tài khoản ngân hàng/MoMo có khoản đúng <b>nội dung CK</b> rồi bấm xác nhận —
          chuồng của khách sẽ <b>tự mở khoá</b> ngay (trang bên khách tự cập nhật, không cần họ tải lại).
        </p>
        {awaiting.length === 0 && <div className="text-[12.8px]" style={{ color: "var(--ink-soft)" }}>Không có đơn nào chờ đối soát 🎉</div>}
        {awaiting.map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-2.5" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-[12.9px] truncate">
                <b className="tabular-nums">{transferCode(r.id)}</b> · {fmtVnd(r.depositVnd)} · {r.user.email}
              </div>
              <div className="text-[11.4px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                {r.paymentStatus === "REPORTED"
                  ? <b style={{ color: "var(--yolk-deep)" }}>⏳ Khách đã báo chuyển {r.reportedAt ? timeAgo(r.reportedAt) : ""} — kiểm tra & xác nhận</b>
                  : "Chưa thấy khách báo chuyển"}
                {r.barn && <> · {r.barn.label}</>}
              </div>
            </div>
            <ActionButton
              action={confirmPayment.bind(null, r.id)}
              className="btn btn-yolk btn-sm flex-none"
              confirm={`Xác nhận ĐÃ NHẬN ${fmtVnd(r.depositVnd)} với nội dung "${transferCode(r.id)}"?`}
              pendingLabel="Đang xác nhận…"
            >Đã nhận tiền</ActionButton>
          </div>
        ))}
      </div>

      {/* ---------- Tài khoản nông dân ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">👩‍🌾 Tài khoản nông dân ({workers.length})</div>
        <p className="text-[12.2px] mb-2.5" style={{ color: "var(--ink-soft)" }}>
          Các cô chú <b>không tự đăng ký</b> được. Bạn đặt tên đăng nhập + mật khẩu ở đây rồi
          đưa tận tay; cô/chú vào <b>/dang-nhap</b> gõ đúng hai thứ đó là thấy chuồng và việc của mình.
        </p>

        <p className="text-[11.6px] mb-1" style={{ color: "var(--ink-soft)" }}>
          💡 Bấm vào <b>tên</b> một cô/chú để xem tên đăng nhập và đặt mật khẩu mới.
          Nút <b>Tạm dừng</b> khoá đăng nhập của người đó và đăng xuất khỏi mọi thiết bị.
        </p>

        {workers.map((w) => (
          <div key={w.id} className="flex items-center gap-2 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <WorkerAccountRow
              worker={{
                id: w.id, name: w.name, area: w.area, active: w.active, maxBarns: w.maxBarns,
                barns: w._count.barns, username: w.user?.username ?? null, email: w.user?.email ?? null,
              }}
            />
            <ActionButton
              action={toggleWorkerActive.bind(null, w.id)}
              className="btn btn-ghost btn-sm flex-none"
              style={w.active ? { color: "#B4472F", borderColor: "#F0CFC6" } : undefined}
              pendingLabel="…"
              confirm={w.active
                ? `Tạm dừng ${w.name}?\n\n• Cô/chú KHÔNG đăng nhập được nữa và bị đăng xuất khỏi mọi thiết bị.\n• Không nhận chuồng mới.${
                  w._count.barns > 0
                    ? `\n• ${w._count.barns} chuồng đang chăm vẫn gắn tên cô/chú nhưng SẼ KHÔNG CÓ TIN MỚI cho tới khi mở lại.`
                    : ""}`
                : undefined}
            >{w.active ? "Tạm dừng" : "Mở lại"}</ActionButton>
          </div>
        ))}

        <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--line)" }}>
          <div className="font-semibold text-[13.2px] mb-2">Cấp tài khoản mới</div>
          <CreateWorkerForm pending={unlinked} />
        </div>
      </div>

      {/* ---------- Đăng ảnh / video ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">📷 Gửi ảnh / video cho chủ chuồng</div>
        <p className="text-[12.2px] mb-2.5" style={{ color: "var(--ink-soft)" }}>
          Dán URL ảnh hoặc video. Dùng được: link công khai từ <b>Supabase Storage</b>, link <b>YouTube</b> (tự chuyển sang dạng nhúng),
          hoặc file <code>.mp4</code>.
        </p>
        <MediaForm barns={barnOptions} />
      </div>

      {/* ---------- Media gần đây ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1.5">Ảnh/video gần đây</div>
        {media.length === 0 && <div className="text-[12.8px]" style={{ color: "var(--ink-soft)" }}>Chưa có gì.</div>}
        {media.map((m) => (
          <div key={m.id} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <span className="text-[15px] flex-none">{m.type === "VIDEO" ? "🎬" : "🖼️"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.8px] truncate">{m.caption ?? m.url}</div>
              <div className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>{m.barn.slug} · {timeAgo(m.createdAt)}</div>
            </div>
            <ActionButton
              action={deleteMedia.bind(null, m.id, m.barn.slug)}
              className="btn btn-ghost btn-sm flex-none"
              style={{ color: "#B4472F", borderColor: "#F0CFC6" }}
              confirm="Xoá mục này khỏi chuồng?"
              pendingLabel="Đang xoá…"
            >Xoá</ActionButton>
          </div>
        ))}
      </div>

      {/* ---------- Đăng ghi chú ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1.5">📝 Đăng cập nhật (không kèm ảnh)</div>
        <UpdateForm barns={barnOptions} />
      </div>

      {/* ---------- Đơn giữ chỗ ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1.5">💚 Đơn giữ chỗ ({reservations.length})</div>
        {reservations.length === 0 && <div className="text-[12.8px]" style={{ color: "var(--ink-soft)" }}>Chưa có đơn nào.</div>}
        {reservations.map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-[12.9px] truncate"><b>{r.user.email}</b> · {r.productLine === "LAYER" ? "gà đẻ" : "gà thịt"}</div>
              <div className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>
                {r.status} · {r.paymentStatus === "CONFIRMED" ? "✓ đã cọc" : r.paymentStatus === "REPORTED" ? "⏳ chờ đối soát" : "chưa cọc"} · {fmtVnd(r.priceEstimateVnd)} · {timeAgo(r.createdAt)}
                {r.henNames.length > 0 && ` · ${r.henNames.join(", ")}`}
              </div>
            </div>
            {r.barn && <Link href={`/chuong/${r.barn.slug}`} className="btn btn-ghost btn-sm flex-none no-underline">Chuồng</Link>}
          </div>
        ))}
      </div>

      {/* ---------- Dev ---------- */}
      <div className="card mt-3" style={{ borderStyle: "dashed" }}>
        <div className="font-bold text-[14px] mb-1.5">Dev — đánh dấu hết chu kỳ đẻ (test màn kết chu kỳ)</div>
        {barns.filter((b) => b.flock?.productLine === "LAYER").map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 py-1.5" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <span className="text-[13px] min-w-0 truncate">{b.label} <span style={{ color: "var(--ink-soft)" }}>({b.flock?.stage})</span></span>
            <ActionButton
              action={setEndOfLay.bind(null, b.slug)}
              className="btn btn-ghost btn-sm flex-none"
              disabled={b.flock?.stage === "END_OF_LAY"}
              pendingLabel="Đang đặt…"
            >Đặt END_OF_LAY</ActionButton>
          </div>
        ))}
      </div>
    </div>
  );
}
