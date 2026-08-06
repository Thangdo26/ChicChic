export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Coop } from "@/components/Illustrations";
import { barnDisplayName, flockProgress, isToday, timeAgo } from "@/lib/decor";
import { fmtVnd } from "@/lib/pricing";

const STAGE_VI: Record<string, string> = {
  BROODING: "Đang úm", GROWING: "Đang lớn", LAYING: "Đang đẻ", FINISHING: "Sắp thu hoạch",
  END_OF_LAY: "Hết chu kỳ đẻ", HARVESTED: "Đã thu hoạch", RETIRED: "Đã nghỉ hưu",
};

/**
 * Cửa vào khu chuồng: "Xem thử một chuồng đang nuôi" ở trang chủ dẫn về đây.
 * - Đã có chuồng → liệt kê để chọn vào chuồng nào.
 * - Chưa có chuồng nào → mời nhận nuôi chuồng đầu tiên, kèm lối xem chuồng mô phỏng.
 */
export default async function MyBarns() {
  const me = await requireUser("/chuong");
  // Nông dân không "nhận nuôi" chuồng — cổng của họ là hộp việc.
  if (me.role === "WORKER") redirect("/nong-trai");

  // Phẳng hoá — cùng bệnh với trang chuồng và /tai-khoan: `include`/`select` lồng qua N
  // chuồng bung ra hàng chục câu lệnh NỐI TIẾP, mỗi câu là một lượt chờ thật (§10).
  // Lọc con theo `barn: { ownerId }` để cả cụm đi trong MỘT đợt song song.
  const [barns, decorRows, mediaRows, eggSums] = await Promise.all([
    prisma.barn.findMany({
      where: { ownerId: me.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, slug: true, label: true, outside: true,
        worker: { select: { name: true } },
        reservation: { select: { paymentStatus: true, depositVnd: true } },
        flock: {
          select: {
            productLine: true, stage: true, size: true, cycleDays: true, startDate: true,
            breed: { select: { name: true } },
          },
        },
      },
    }),
    prisma.barnDecor.findMany({
      where: { barn: { ownerId: me.id } }, orderBy: { z: "asc" },
      select: { id: true, barnId: true, x: true, y: true, scale: true, flipped: true, text: true, item: { select: { svgKey: true } } },
    }),
    // "Ảnh mới nhất của từng chuồng": lấy một nắm rồi chọn ở Node, thay vì N lượt đi–về.
    prisma.barnMedia.findMany({
      where: { barn: { ownerId: me.id } }, orderBy: { capturedAt: "desc" }, take: 60,
      select: { barnId: true, capturedAt: true },
    }),
    // ⭐ Số trứng THẬT từ sổ thu hoạch — trang này cũng đang đọc `Product.qty`, cột
    // không có lệnh `update` nào trong `src/` nên ô "🥚 … quả" LUÔN là 0 (§11.11).
    prisma.harvestLot.groupBy({
      by: ["barnId"], where: { barn: { ownerId: me.id }, type: "EGG" }, _sum: { qty: true },
    }),
  ]);

  const decorBy = new Map<string, typeof decorRows>();
  for (const d of decorRows) (decorBy.get(d.barnId) ?? decorBy.set(d.barnId, []).get(d.barnId)!).push(d);
  const lastMediaBy = new Map<string, Date>();
  for (const m of mediaRows) if (!lastMediaBy.has(m.barnId)) lastMediaBy.set(m.barnId, m.capturedAt);
  const eggBy = new Map(eggSums.map((r) => [r.barnId, r._sum.qty ?? 0]));

  // ---------- Chưa có chuồng nào ----------
  if (barns.length === 0) {
    return (
      <div className="screen">
        <div className="coopwrap">
          <span className="pill">🐣 Chuồng của bạn còn trống</span>
          <div className="mt-1.5">
            <Coop
              label="Chờ bạn"
              decor={[
                { svgKey: "bien", x: 120, y: 56 },
                { svgKey: "cay", x: 34, y: 132, scale: 1.05 },
              ]}
            />
          </div>
        </div>

        <h1 className="display text-[23px] leading-[1.15] font-bold mt-4 mb-2 text-center">
          Hãy nhận nuôi <span style={{ color: "var(--paddy)" }}>chuồng đầu tiên</span> của bạn
        </h1>
        <p className="lede text-center">
          Chọn giống gà, cách cho ăn và số con — cô chú nông dân ở nông trại sẽ chăm giúp,
          gửi ảnh/video thật mỗi ngày. Đến kỳ bạn nhận trứng hoặc gà thật.
        </p>

        <div className="grid gap-2 mt-4">
          <Link href="/nhan-chuong" className="btn btn-primary no-underline">Nhận nuôi chuồng đầu tiên →</Link>
          <Link href="/chuong/demo" className="btn btn-ghost no-underline">👀 Xem thử chuồng mô phỏng</Link>
        </div>
        <p className="text-[11.8px] mt-2 text-center" style={{ color: "var(--ink-soft)" }}>
          Chuồng mô phỏng là chuồng thật đang nuôi ở nông trại, mở cho mọi người xem —
          để bạn hình dung trước khi nhận một chuồng cho riêng mình.
        </p>
      </div>
    );
  }

  // ---------- Đã có chuồng → chọn một chuồng để vào ----------
  return (
    <div className="screen">
      <Link href="/" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Trang chủ</Link>
      <h1 className="display text-[21px] mt-2">Chuồng bạn đang nuôi</h1>
      <p className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
        Bạn có <b>{barns.length} chuồng</b> — chọn một chuồng để xem hiện trạng hôm nay.
      </p>

      <div className="grid gap-3 mt-3">
        {barns.map((b) => {
          const paid = !b.reservation || b.reservation.paymentStatus === "CONFIRMED";
          const isLayer = b.flock?.productLine === "LAYER";
          const eggs = eggBy.get(b.id) ?? 0;
          const prog = b.flock ? flockProgress(b.flock.startDate, b.flock.cycleDays) : null;
          const lastMedia = lastMediaBy.get(b.id);

          return (
            <Link
              key={b.id}
              href={`/chuong/${b.slug}`}
              className="card no-underline"
              style={!paid ? { borderColor: "#EBD8AE" } : undefined}
            >
              <div className="flex items-start gap-3">
                <div className="flex-none rounded-[12px] overflow-hidden"
                  style={{ width: 86, background: "linear-gradient(180deg,#EAF1E3,#DCE8D2)", border: "1px solid var(--line)" }}>
                  <Coop
                    label={barnDisplayName(b.label)}
                    outside={b.outside}
                    decor={(decorBy.get(b.id) ?? []).map((d) => ({ id: d.id, svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped, text: d.text }))}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14.6px] truncate" style={{ color: "var(--ink)" }}>{b.label}</div>
                  <div className="text-[12.2px] mt-0.5 truncate" style={{ color: "var(--ink-soft)" }}>
                    {b.flock?.breed.name} · {isLayer ? "gà đẻ" : "gà thịt"} · {b.flock?.size} con
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {!paid ? (
                      <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                        style={{ background: "var(--yolk-tint)", color: "var(--yolk-deep)" }}>
                        🔒 {b.reservation!.paymentStatus === "REPORTED" ? "Chờ đối soát cọc" : `Cần cọc ${fmtVnd(b.reservation!.depositVnd)}`}
                      </span>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                          style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                          {STAGE_VI[b.flock?.stage ?? ""] ?? "Đang nuôi"}
                        </span>
                        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                          style={{ background: "var(--paper2)", color: "var(--ink-soft)" }}>
                          {isLayer ? `🥚 ${eggs} quả` : `📅 ngày ${prog?.day}/${prog?.total}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
                <span className="text-[11.8px] min-w-0 truncate" style={{ color: "var(--ink-soft)" }}>
                  {lastMedia
                    ? `${isToday(lastMedia) ? "🟢 Có tin hôm nay" : `📷 Ảnh mới ${timeAgo(lastMedia)}`} · ${b.worker?.name ?? "Nông dân"} chăm`
                    : `${b.worker?.name ?? "Nông dân"} đang chuẩn bị đàn cho bạn`}
                </span>
                <span className="flex-none text-[12.6px] font-semibold whitespace-nowrap" style={{ color: "var(--paddy)" }}>
                  Vào chuồng ›
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-2 mt-3">
        <Link href="/nhan-chuong" className="btn btn-ghost no-underline">+ Nhận thêm một chuồng</Link>
      </div>
    </div>
  );
}
