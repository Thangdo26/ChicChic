export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { addMedia, deleteMedia, postUpdate, setEndOfLay } from "@/app/actions";
import { fmtVnd } from "@/lib/pricing";
import { timeAgo } from "@/lib/decor";

const input = { border: "1.5px solid var(--line)", background: "#fff" } as const;
const CLS = "rounded-[11px] px-3 py-2.5 text-[14px] w-full";

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

  const locked = !!process.env.ADMIN_PASSWORD;

  async function submitUpdate(formData: FormData) {
    "use server";
    await postUpdate(String(formData.get("barn")), String(formData.get("text")), String(formData.get("kind")));
  }

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

      {/* ---------- Đăng ảnh / video ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">📷 Gửi ảnh / video cho chủ chuồng</div>
        <p className="text-[12.2px] mb-2.5" style={{ color: "var(--ink-soft)" }}>
          Dán URL ảnh hoặc video. Dùng được: link công khai từ <b>Supabase Storage</b>, link <b>YouTube</b> (tự chuyển sang dạng nhúng),
          hoặc file <code>.mp4</code>.
        </p>
        <form action={addMedia} className="grid gap-2.5">
          <select name="barn" className={CLS} style={input} required>
            {barns.map((b) => <option key={b.id} value={b.slug}>{b.label} ({b.slug})</option>)}
          </select>
          <select name="type" className={CLS} style={input}>
            <option value="PHOTO">Ảnh</option>
            <option value="VIDEO">Video</option>
          </select>
          <input name="url" className={CLS} style={input} required
            placeholder="https://…/anh.jpg  hoặc  https://youtu.be/…" />
          <input name="poster" className={CLS} style={input} placeholder="Ảnh bìa cho video (tuỳ chọn)" />
          <input name="caption" className={CLS} style={input} maxLength={200}
            placeholder="Chú thích — VD: 6:40 sáng, đàn ra ăn cữ đầu" />
          <button className="btn btn-primary mt-1" type="submit">Gửi lên chuồng</button>
        </form>
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
            <form action={deleteMedia.bind(null, m.id, m.barn.slug)} className="flex-none">
              <button className="btn btn-ghost btn-sm" type="submit" style={{ color: "#B4472F", borderColor: "#F0CFC6" }}>Xoá</button>
            </form>
          </div>
        ))}
      </div>

      {/* ---------- Đăng ghi chú ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1.5">📝 Đăng cập nhật (không kèm ảnh)</div>
        <form action={submitUpdate} className="grid gap-2.5">
          <select name="barn" className={CLS} style={input}>
            {barns.map((b) => <option key={b.id} value={b.slug}>{b.label} ({b.slug})</option>)}
          </select>
          <select name="kind" className={CLS} style={input}>
            {["CARE", "NOTE", "HEALTH", "MILESTONE", "RANGE"].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <textarea name="text" rows={3} className={CLS} style={input} required
            placeholder="VD: Sáng nay đàn ăn khỏe, trời nắng đẹp." />
          <button className="btn btn-primary mt-1" type="submit">Đăng cập nhật</button>
        </form>
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
                {r.status} · {fmtVnd(r.priceEstimateVnd)} · cọc {fmtVnd(r.depositVnd)} · {timeAgo(r.createdAt)}
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
          <form key={b.id} action={setEndOfLay.bind(null, b.slug)} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <span className="text-[13px]">{b.label} <span style={{ color: "var(--ink-soft)" }}>({b.flock?.stage})</span></span>
            <button className="btn btn-ghost btn-sm" type="submit" disabled={b.flock?.stage === "END_OF_LAY"}>Đặt END_OF_LAY</button>
          </form>
        ))}
      </div>
    </div>
  );
}
