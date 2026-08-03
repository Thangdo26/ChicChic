export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { FarmerAvatar } from "@/components/Illustrations";
import { MediaGrid, type MediaVM } from "@/components/MediaGallery";
import { dayLabel, hhmm } from "@/lib/decor";
import BarnLocked from "@/components/BarnLocked";
import { canViewBarn, requireUser } from "@/lib/auth";

const KIND_META: Record<string, { ic: string; label: string }> = {
  CARE: { ic: "🌾", label: "Chăm sóc" },
  NOTE: { ic: "📝", label: "Ghi chú" },
  PHOTO: { ic: "📷", label: "Ảnh" },
  VIDEO: { ic: "🎬", label: "Video" },
  HEALTH: { ic: "🩺", label: "Sức khoẻ" },
  DECOR: { ic: "🎨", label: "Trang trí" },
  MILESTONE: { ic: "🏅", label: "Cột mốc" },
  RANGE: { ic: "🌿", label: "Thả vườn" },
};

/** Số ảnh tải mỗi lần. Một chuồng nuôi hết chu kỳ có thể tích tới hàng trăm mục. */
const PAGE = 60;

export default async function BarnJournal({
  params, searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string; so?: string };
}) {
  await requireUser(`/chuong/${params.id}/nhat-ky`);

  // Trần số ảnh lấy về. Trước đây `media` findMany KHÔNG có `take`: chuồng nuôi lâu
  // kéo cả vài trăm ảnh xuống mỗi lần mở trang, và số đó chỉ có tăng. Lấy dư 1 mục để
  // biết còn nữa hay không mà không cần thêm một `count`.
  const limit = Math.min(600, Math.max(PAGE, Math.floor(Number(searchParams?.so)) || PAGE));

  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  // Ba truy vấn độc lập → song song. Tổng số ảnh/video và số của hôm nay đếm bằng
  // aggregate thay vì đếm trên mảng đã tải — mảng đó giờ chỉ là một trang.
  const [barn, byType, todayCount] = await Promise.all([
    prisma.barn.findUnique({
      where: { slug: params.id },
      include: {
        worker: { select: { name: true } },
        media: { orderBy: { capturedAt: "desc" }, take: limit + 1 },
        updates: { orderBy: { createdAt: "desc" }, take: 60 },
      },
    }),
    prisma.barnMedia.groupBy({
      by: ["type"],
      where: { barn: { slug: params.id } },
      _count: { _all: true },
    }),
    prisma.barnMedia.count({
      where: { barn: { slug: params.id }, capturedAt: { gte: midnight } },
    }),
  ]);
  if (!barn) return notFound();
  if (!(await canViewBarn(barn, `/chuong/${params.id}/nhat-ky`))) return <BarnLocked slug={barn.slug} />;

  const tab = searchParams?.tab === "nhat-ky" ? "nhat-ky" : "anh";
  const hasMore = barn.media.length > limit;
  const all: MediaVM[] = barn.media.slice(0, limit).map((m) => ({
    id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
    durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: barn.worker?.name ?? null,
  }));
  const countOf = (t: string) => byType.find((r) => r.type === t)?._count._all ?? 0;
  const photos = countOf("PHOTO");
  const videos = countOf("VIDEO");

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>
      <span className="eyebrow block mt-2">Hiện trạng chuồng</span>
      <h2 className="display text-[21px] mt-1 mb-1.5">Ảnh & video từ nông trại</h2>
      <p className="lede">
        {todayCount > 0
          ? `Hôm nay nông dân đã gửi ${todayCount} mục từ ${barn.label}.`
          : `Tất cả những gì đã ghi lại ở ${barn.label} — ${photos} ảnh, ${videos} video.`}
      </p>

      <div className="seg mt-3">
        <Link href={`/chuong/${params.id}/nhat-ky`} className={`no-underline text-center ${tab === "anh" ? "on" : ""}`}>📷 Ảnh & video</Link>
        <Link href={`/chuong/${params.id}/nhat-ky?tab=nhat-ky`} className={`no-underline text-center ${tab === "nhat-ky" ? "on" : ""}`}>📝 Nhật ký</Link>
      </div>

      {tab === "anh" ? (
        <>
          <MediaGrid list={all} />
          {hasMore && (
            <Link
              href={`/chuong/${params.id}/nhat-ky?so=${limit + PAGE}`}
              className="btn btn-ghost mt-3 no-underline text-center"
            >
              Xem thêm {PAGE} mục cũ hơn
            </Link>
          )}
        </>
      ) : (
        <div className="mt-3.5">
          {barn.updates.length === 0 && (
            <div className="soft text-center py-6 text-[13px]" style={{ color: "var(--ink-soft)" }}>Chưa có ghi chép nào.</div>
          )}
          {barn.updates.map((u, i) => {
            const meta = KIND_META[u.kind] ?? KIND_META.NOTE;
            const prev = barn.updates[i - 1];
            const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(u.createdAt);
            return (
              <div key={u.id}>
                {newDay && (
                  <div className="flex items-center gap-2.5 mt-4 mb-1">
                    <span className="font-bold text-[12.5px] tracking-wide uppercase" style={{ color: "var(--ink-soft)" }}>{dayLabel(u.createdAt)}</span>
                    <span className="flex-1 h-px" style={{ background: "var(--line-soft)" }} />
                  </div>
                )}
                <div className="card mt-2">
                  <div className="flex gap-3">
                    <div className="avatar w-[34px] h-[34px] flex-none"><FarmerAvatar /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-[13px]">{barn.worker?.name ?? "Nông trại"}</span>
                        <span className="text-[11px] font-semibold rounded-full px-1.5 py-0.5"
                          style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>{meta.ic} {meta.label}</span>
                        <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>{hhmm(u.createdAt)}</span>
                      </div>
                      <div className="text-[13.4px] mt-1">{u.text}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11.6px] mt-5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Ảnh và video do chính nông dân chăm chuồng chụp tại nông trại, có đóng dấu tên người gửi.
        Tin xấu (gà ốm, gà chết) cũng được báo ở đây thay vì giấu đi.
      </p>
    </div>
  );
}
