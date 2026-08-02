export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { FarmerAvatar } from "@/components/Illustrations";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";
import { BASE_PRICES } from "@/data/catalog";
import { fmtVnd, priceBreakdown } from "@/lib/pricing";
import { ageFromBirthYear, timeAgo } from "@/lib/decor";
import { getSessionUser } from "@/lib/auth";
import { workerLoad } from "@/lib/workers";

/**
 * Hồ sơ một cô/chú nông dân — "mặt thật" của nông trại, trụ niềm tin số 2 của định vị
 * chống-đa-cấp. Trang chủ link thẳng vào đây, kể cả với khách chưa đăng nhập, nên trang
 * chia làm hai nửa:
 *
 * - **Phần giới thiệu (công khai):** tên, tuổi, kinh nghiệm, nơi ở, lời tự giới thiệu,
 *   ảnh/video cô chú tự đăng, và phần công minh bạch. Đây là thứ người lạ cần thấy TRƯỚC
 *   khi tin — khoá sau màn đăng nhập là vứt bỏ toàn bộ giá trị chống lừa đảo của nó.
 * - **Phần gắn với chuồng cụ thể (phải đăng nhập):** danh sách chuồng đang chăm, ảnh
 *   hằng ngày, ghi chép. Đó là dữ liệu của những chủ chuồng khác — giữ đúng bất biến §9.5.
 *
 * Ảnh/video tự giới thiệu chỉ mở công khai khi cô/chú đã bật `consentMedia`: đưa mặt một
 * người lên trang ai cũng xem được là mức đồng thuận khác với cho khách đã đăng nhập xem.
 */
export default async function Farmer({ params }: { params: { id: string } }) {
  const me = await getSessionUser();

  const [w, load, inside] = await Promise.all([
    prisma.farmWorker.findUnique({
      where: { id: params.id },
      include: {
        farm: { select: { name: true } },
        introMedia: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    }),
    // Đếm chuồng ĐANG CÓ CHỦ — dùng lại đúng hàm trang chủ dùng, để hai nơi không lệch số.
    workerLoad(params.id),
    me
      ? prisma.farmWorker.findUnique({
          where: { id: params.id },
          select: {
            barns: {
              select: { id: true, slug: true, label: true, flock: { select: { productLine: true, size: true } } },
            },
            updates: {
              orderBy: { createdAt: "desc" }, take: 5,
              select: { id: true, text: true, createdAt: true, barn: { select: { label: true } } },
            },
            media: { orderBy: { capturedAt: "desc" }, take: 8 },
          },
        })
      : null,
  ]);
  if (!w) return notFound();

  const strip: MediaVM[] = (inside?.media ?? []).map((m) => ({
    id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
    durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: w.name,
  }));

  // Ảnh/video cô chú tự giới thiệu — khác với ảnh chuồng gửi hằng ngày ở dưới
  const intro: MediaVM[] = w.introMedia.map((m) => ({
    id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
    durationSec: null, capturedAt: m.createdAt.toISOString(), workerName: w.name,
  }));
  const showIntro = intro.length > 0 && (!!me || w.consentMedia);
  const age = ageFromBirthYear(w.birthYear);

  return (
    <div className="screen">
      <div className="card">
        <div className="flex gap-3.5 items-center">
          <div className="avatar w-16 h-16 flex-none"><FarmerAvatar /></div>
          <div>
            <h2 className="display text-[20px]">{w.name}</h2>
            <p className="lede mt-0.5">
              {age ? `${age} tuổi · ` : ""}{w.yearsExp} năm nuôi gà · {w.area}
            </p>
            <p className="text-[11.8px] mt-0.5" style={{ color: "var(--ink-soft)" }}>{w.farm.name}</p>
          </div>
        </div>
        {w.bio && <p className="text-[13.6px] mt-3" style={{ color: "var(--ink-soft)" }}>“{w.bio}”</p>}

        {load > 0 && (
          <p className="text-[12.4px] mt-2.5" style={{ color: "var(--ink-soft)" }}>
            🏡 Đang chăm <b style={{ color: "var(--ink)" }}>{load} chuồng</b> của các chủ chuồng ChicChic
            {w.active ? ` · nhận tối đa ${w.maxBarns} chuồng` : " · tạm không nhận chuồng mới"}
          </p>
        )}

        <div className="flex justify-between items-center gap-2 rounded-[14px] p-[13px] mt-3.5" style={{ background: "var(--paddy-tint)" }}>
          <div className="min-w-0">
            <div className="text-[12px]" style={{ color: "var(--paddy-deep)" }}>Phần công {w.name} nhận từ một chuồng gà đẻ</div>
            <div className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
              {fmtVnd(BASE_PRICES.LAYER.cong)}/mái mỗi tháng — trích minh bạch trong phí bạn trả
            </div>
          </div>
          <div className="display font-bold text-[18px] flex-none" style={{ color: "var(--paddy-deep)" }}>
            {fmtVnd(priceBreakdown("LAYER", "chuan").cong)}
          </div>
        </div>

        {w.consentMedia && (
          <p className="text-[11.5px] mt-2.5" style={{ color: "var(--ink-soft)" }}>
            {w.name} đã đồng ý xuất hiện trong hình ảnh/video gửi tới bạn.
          </p>
        )}
      </div>

      {/* ---------- Cô chú tự giới thiệu ---------- */}
      {showIntro && (
        <>
          <div className="label">{w.name} tự giới thiệu</div>
          <MediaStrip list={intro} />
        </>
      )}

      {/* ---------- Chuồng đang chăm (chỉ người đã đăng nhập) ---------- */}
      {inside && inside.barns.length > 0 && (
        <div className="card mt-3">
          <div className="font-bold text-[14px] mb-1.5">Đang chăm {inside.barns.length} chuồng</div>
          {inside.barns.map((b) => (
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

      {/* ---------- Ảnh gần đây (chỉ người đã đăng nhập) ---------- */}
      {strip.length > 0 && (
        <>
          <div className="label">{w.name} gửi gần đây</div>
          <MediaStrip list={strip} />
        </>
      )}

      {/* ---------- Ghi chép gần đây (chỉ người đã đăng nhập) ---------- */}
      {inside && inside.updates.length > 0 && (
        <div className="card mt-3">
          <div className="font-bold text-[14px] mb-1.5">Ghi chép gần đây</div>
          {inside.updates.map((u) => (
            <div key={u.id} className="py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <div className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>{u.barn.label} · {timeAgo(u.createdAt)}</div>
              <div className="text-[13.2px] mt-0.5">{u.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Khách chưa đăng nhập: nói rõ còn gì ở phía trong, thay vì im lặng giấu đi. */}
      {!me && (
        <div className="card mt-3">
          <div className="font-bold text-[14px]">Còn gì ở bên trong?</div>
          <p className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
            Ảnh và video {w.name} gửi về mỗi ngày, cùng ghi chép chăm sóc từng chuồng, là không gian
            riêng của từng chủ chuồng — cần đăng nhập mới xem được.
          </p>
          <div className="grid gap-2 mt-3">
            <Link href="/dang-ky?next=%2Fnhan-chuong" className="btn btn-primary no-underline">Tạo tài khoản & nhận chuồng →</Link>
            <Link href={`/dang-nhap?next=${encodeURIComponent(`/nong-dan/${w.id}`)}`} className="btn btn-ghost no-underline">Tôi đã có tài khoản</Link>
          </div>
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
