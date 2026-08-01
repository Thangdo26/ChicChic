export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorker } from "@/lib/auth";
import { Coop } from "@/components/Illustrations";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";
import { WorkerTaskCard, DailyUpdateForm, type WorkerTaskVM } from "@/components/WorkerForms";
import { TASK_META, type TaskKind, type TaskStatus } from "@/lib/tasks";
import { flockProgress, isToday, timeAgo } from "@/lib/decor";

const STAGE_VI: Record<string, string> = {
  BROODING: "Đang úm", GROWING: "Đang lớn", LAYING: "Đang đẻ", FINISHING: "Sắp thu hoạch",
  END_OF_LAY: "Hết chu kỳ đẻ", HARVESTED: "Đã thu hoạch", RETIRED: "Đã nghỉ hưu",
};

export default async function WorkerBarn({ params }: { params: { slug: string } }) {
  const w = await requireWorker(`/nong-trai/chuong/${params.slug}`);

  const barn = await prisma.barn.findUnique({
    where: { slug: params.slug },
    include: {
      owner: { select: { name: true, email: true } },
      decor: { include: { item: true }, orderBy: { z: "asc" } },
      flock: { include: { breed: true, feedingPlan: true, birds: true, products: true } },
      media: { orderBy: { capturedAt: "desc" }, take: 8, include: { worker: { select: { name: true } } } },
      tasks: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });
  if (!barn) return notFound();
  // Chuồng của người khác → về hộp việc của mình
  if (barn.workerId !== w.workerId) redirect("/nong-trai");

  const openTasks: WorkerTaskVM[] = barn.tasks
    .filter((t) => t.status === "OPEN")
    .map((t) => ({
      id: t.id, kind: t.kind as TaskKind, title: t.title, note: t.note,
      dueAt: t.dueAt?.toISOString() ?? null, status: t.status as TaskStatus,
      createdAt: t.createdAt.toISOString(), seen: !!t.seenAt,
      barnSlug: barn.slug, barnLabel: barn.label,
      ownerName: barn.owner?.name ?? barn.owner?.email ?? null,
    }));

  const history = barn.tasks.filter((t) => t.status !== "OPEN").slice(0, 6);
  const strip: MediaVM[] = barn.media.map((m) => ({
    id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
    durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: m.worker?.name ?? null,
  }));
  const fresh = barn.media[0] && isToday(barn.media[0].capturedAt);
  const flock = barn.flock;
  const eggs = flock?.products.find((p) => p.type === "EGG")?.qty ?? 0;
  const isLayer = flock?.productLine === "LAYER";
  const prog = flock ? flockProgress(flock.startDate, flock.cycleDays) : null;
  const named = flock?.birds.filter((b) => b.name).map((b) => b.name) ?? [];

  return (
    <div className="screen">
      <Link href="/nong-trai" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Hộp việc</Link>

      <div className="coopwrap mt-2" style={{ padding: "14px 14px 4px" }}>
        <Coop
          label={barn.label.replace(/^Chuồng\s*/i, "").replace(/["“”]/g, "")}
          outside={barn.outside}
          decor={barn.decor.map((d) => ({ svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped }))}
        />
      </div>

      <h2 className="display text-[20px] mt-3 mb-1">{barn.label}</h2>
      <p className="lede">
        {barn.owner ? <>Chủ chuồng: <b>{barn.owner.name ?? barn.owner.email}</b>. </> : "Chuồng chưa có chủ — vẫn chăm bình thường. "}
        {flock && <>{flock.breed.name} · {isLayer ? "gà đẻ" : "gà thịt"} · {flock.size} con · ăn {flock.feedingPlan.name}.</>}
      </p>

      <div className="statusband mt-3">
        <div><div className="sb-k">{isLayer ? "Trứng chu kỳ" : "Tiến độ"}</div><div className="sb-v">{isLayer ? `${eggs} quả` : `${prog?.day}/${prog?.total}`}</div></div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Đàn</div><div className="sb-v">{STAGE_VI[flock?.stage ?? ""] ?? "—"}</div></div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Vị trí đàn</div><div className="sb-v">{barn.outside ? "Ngoài vườn" : "Trong chuồng"}</div></div>
      </div>

      {named.length > 0 && (
        <>
          <div className="label">Tên chủ chuồng đặt cho đàn</div>
          <div className="flex flex-wrap gap-1.5">
            {named.map((n) => (
              <span key={n} className="font-semibold text-[12.5px] rounded-full px-2.5 py-1"
                style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>🐔 {n}</span>
            ))}
          </div>
          <p className="text-[11.6px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
            Nhắc tên các bạn ấy trong lời nhắn — đó là điều chủ chuồng nhớ nhất.
          </p>
        </>
      )}

      {/* ---------- Bố cục trang trí phải lắp ---------- */}
      {barn.decor.length > 0 && (
        <div className="card mt-3.5">
          <div className="font-bold text-[14px] mb-1">🎨 Bản vẽ trang trí của chủ chuồng</div>
          <p className="text-[12.2px] mb-1.5" style={{ color: "var(--ink-soft)" }}>
            Lắp đúng vị trí như hình trên đầu trang. Xong nhớ chụp lại một tấm.
          </p>
          {barn.decor.map((d) => (
            <div key={d.id} className="kv">
              <span style={{ color: "var(--ink-soft)" }}>{d.item.name}</span>
              <span className="font-semibold">{d.photoUrl ? "✓ đã có ảnh" : "chưa có ảnh"}</span>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Việc của chuồng này ---------- */}
      <div className="label">Việc đang chờ ({openTasks.length})</div>
      {openTasks.length === 0 ? (
        <div className="soft text-[13px]" style={{ color: "var(--ink-soft)" }}>
          Chuồng này không có việc nào đang chờ.
        </div>
      ) : (
        openTasks.map((t) => <WorkerTaskCard key={t.id} task={t} />)
      )}

      {/* ---------- Gửi cập nhật ---------- */}
      <div className="card mt-3.5" style={fresh ? undefined : { borderColor: "#EBD8AE" }}>
        <div className="font-bold text-[14px]">📷 Gửi cập nhật cho chủ chuồng</div>
        <p className="text-[12.2px] mb-2.5 mt-0.5" style={{ color: "var(--ink-soft)" }}>
          {fresh ? "Hôm nay đã có tin rồi — gửi thêm cũng tốt." : "Hôm nay chuồng này chưa có tin nào."}
        </p>
        <DailyUpdateForm barns={[{ slug: barn.slug, label: barn.label }]} />
      </div>

      {/* ---------- Đã gửi gần đây ---------- */}
      {strip.length > 0 && (
        <>
          <div className="label">Đã gửi gần đây</div>
          <MediaStrip list={strip} />
        </>
      )}

      {history.length > 0 && (
        <div className="card mt-3.5">
          <div className="font-bold text-[14px] mb-1">Lịch sử việc</div>
          {history.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <span className="flex-none text-[15px]">{TASK_META[t.kind as TaskKind].emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.9px] truncate">{t.title}</div>
                <div className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>
                  {t.status === "DONE" ? "✓ xong" : "không làm được"} · {t.doneAt ? timeAgo(t.doneAt) : ""}
                  {t.doneNote ? ` · “${t.doneNote}”` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
