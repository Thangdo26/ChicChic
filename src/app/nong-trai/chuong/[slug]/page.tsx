export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorker } from "@/lib/auth";
import { Coop } from "@/components/Illustrations";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";
import { WorkerTaskCard, DailyUpdateForm, HarvestForm, type WorkerTaskVM } from "@/components/WorkerForms";
import BarnThread from "@/components/BarnThread";
import { TASK_META, type TaskKind, type TaskStatus } from "@/lib/tasks";
import { listMessages, markRead, threadAccess } from "@/lib/messages";
import { barnDisplayName, flockProgress, isToday, timeAgo } from "@/lib/decor";
import { LOT_TYPE_EMOJI, keepLabel, lotSummary, type LotType } from "@/lib/harvest";
import { STAGE_VI } from "@/lib/flock";

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
      // Lô vừa ghi — để cô chú biết mình ghi rồi, khỏi ghi trùng. `take` nhỏ vì đây
      // chỉ là nhắc việc, sổ đầy đủ nằm ở trang của chủ chuồng.
      lots: { orderBy: { collectedAt: "desc" }, take: 5 },
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
  const lots = barn.lots;
  const isLayer = flock?.productLine === "LAYER";
  const prog = flock ? flockProgress(flock.startDate, flock.cycleDays) : null;
  const named = flock?.birds.filter((b) => b.name).map((b) => b.name) ?? [];

  // Hộp thư: nhúng thẳng vào trang chuồng, không tạo trang thứ ba để cô chú phải nhớ.
  // Chuồng chưa có chủ thì `threadAccess` trả null → không có hộp thư nào cả.
  //
  // Cộng trứng chạy SONG SONG với hộp thư — hai thứ không phụ thuộc nhau, xếp hàng
  // nối tiếp là thêm nguyên một lượt đi–về (§8).
  //
  // Cố ý là `aggregate` chứ không phải cộng từ `barn.lots`: `lots` chỉ lấy 5 dòng gần
  // nhất để nhắc việc, cộng 5 dòng đó rồi gọi là "tổng" là một con số sai âm thầm.
  const [thread, eggAgg] = await Promise.all([
    threadAccess(params.slug),
    prisma.harvestLot.aggregate({
      where: { barnId: barn.id, type: "EGG" },
      _sum: { qty: true },
    }),
  ]);
  // Số trứng THẬT. Trước đây đọc `Product.qty`, mà cột đó không có một lệnh `update`
  // nào trong `src/` nên mọi chuồng thật vĩnh viễn 0 quả (§11.11 — nay đã vá).
  const eggs = eggAgg._sum.qty ?? 0;
  if (thread) await markRead(thread.barn.id, thread.meId);
  const messages = thread ? await listMessages(thread.barn.id, thread.meId) : [];

  return (
    <div className="screen">
      <Link href="/nong-trai" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Hộp việc</Link>

      <div className="coopwrap mt-2" style={{ padding: "14px 14px 4px" }}>
        <Coop
          label={barnDisplayName(barn.label)}
          outside={barn.outside}
          decor={barn.decor.map((d) => ({ id: d.id, svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped, text: d.text }))}
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

      {/* ---------- Hộp thư với chủ chuồng ---------- */}
      {thread && thread.role === "WORKER" && (
        <div id="hop-thu" className="card mt-3.5" style={{ scrollMarginTop: 70 }}>
          <div className="font-bold text-[14px]">💬 Hộp thư với {thread.ownerName}</div>
          <p className="text-[12.2px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Trả lời nhanh bằng nút có sẵn cũng được — chủ chuồng chỉ cần biết cô/chú đã đọc.
          </p>
          <BarnThread
            barnSlug={barn.slug}
            role="WORKER"
            ownerName={thread.ownerName}
            workerName={thread.workerName}
            initial={messages}
            compact
          />
        </div>
      )}

      {/* ---------- Việc của chuồng này ---------- */}
      <div id="viec" className="label" style={{ scrollMarginTop: 70 }}>Việc đang chờ ({openTasks.length})</div>
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

      {/* ---------- Sổ thu hoạch ----------
          Đặt ngay dưới ô gửi tin: nhặt trứng xong là chụp một tấm rồi ghi luôn, không
          phải đi tìm ở màn khác. */}
      <div className="card mt-3.5">
        <div className="font-bold text-[14px]">
          {barn.flock?.productLine === "LAYER" ? "🥚 Ghi sổ thu hoạch" : "🍗 Ghi sổ thu hoạch"}
        </div>
        <p className="text-[12.2px] mb-2.5 mt-0.5" style={{ color: "var(--ink-soft)" }}>
          Nhặt được bao nhiêu thì ghi bấy nhiêu, kèm một tấm ảnh. Nông trại giữ hộ 7 ngày
          kể từ lúc thu.
        </p>
        <HarvestForm barns={[{
          slug: barn.slug, label: barn.label,
          isLayer: barn.flock?.productLine === "LAYER",
        }]} />
      </div>

      {/* Lô đã ghi gần đây — để cô chú biết mình đã ghi rồi, khỏi ghi trùng. */}
      {lots.length > 0 && (
        <div className="card mt-3">
          <div className="font-bold text-[14px] mb-1">Đã ghi gần đây</div>
          {lots.map((l) => (
            <div key={l.id} className="flex items-center gap-2 py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <span className="flex-none text-[15px]">{LOT_TYPE_EMOJI[l.type as LotType]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold">
                  {lotSummary({ type: l.type as LotType, qty: l.qty, weightKg: l.weightKg })}
                </div>
                <div className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>
                  {timeAgo(l.collectedAt)} · {keepLabel(l.collectedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
