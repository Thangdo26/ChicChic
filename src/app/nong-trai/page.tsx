export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireWorker } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { markTasksSeen } from "@/app/worker-actions";
import { ActionButton } from "@/components/Toast";
import { FarmerAvatar, Coop } from "@/components/Illustrations";
import { WorkerTaskCard, DailyUpdateForm, type WorkerTaskVM } from "@/components/WorkerForms";
import { TASK_META, isOverdue, type TaskKind, type TaskStatus } from "@/lib/tasks";
import { isToday, timeAgo } from "@/lib/decor";

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export default async function WorkerHome() {
  const w = await requireWorker();

  const [openTasks, recentDone, barns, doneToday] = await Promise.all([
    prisma.barnTask.findMany({
      where: { workerId: w.workerId, status: "OPEN" },
      include: { barn: { select: { slug: true, label: true, owner: { select: { name: true, email: true } } } } },
    }),
    prisma.barnTask.findMany({
      where: { workerId: w.workerId, status: { in: ["DONE", "DECLINED"] } },
      orderBy: { doneAt: "desc" }, take: 5,
      include: { barn: { select: { slug: true, label: true } } },
    }),
    prisma.barn.findMany({
      where: { workerId: w.workerId },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { name: true, email: true } },
        decor: { include: { item: { select: { svgKey: true } } }, orderBy: { z: "asc" } },
        flock: { select: { productLine: true, size: true, stage: true } },
        media: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
      },
    }),
    prisma.barnTask.count({ where: { workerId: w.workerId, status: "DONE", doneAt: { gte: startOfToday() } } }),
  ]);

  // Quá giờ hẹn lên đầu, rồi tới việc có hẹn giờ, cuối cùng là việc thường.
  const sorted = [...openTasks].sort((a, b) => {
    const la = isOverdue({ status: "OPEN", dueAt: a.dueAt }) ? 0 : 1;
    const lb = isOverdue({ status: "OPEN", dueAt: b.dueAt }) ? 0 : 1;
    if (la !== lb) return la - lb;
    if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const vm: WorkerTaskVM[] = sorted.map((t) => ({
    id: t.id, kind: t.kind as TaskKind, title: t.title, note: t.note,
    dueAt: t.dueAt?.toISOString() ?? null, status: t.status as TaskStatus,
    createdAt: t.createdAt.toISOString(), seen: !!t.seenAt,
    barnSlug: t.barn.slug, barnLabel: t.barn.label,
    ownerName: t.barn.owner?.name ?? t.barn.owner?.email ?? null,
  }));

  const owned = barns.filter((b) => b.ownerId);
  const silentToday = owned.filter((b) => !b.media[0] || !isToday(b.media[0].capturedAt));
  const unseen = openTasks.filter((t) => !t.seenAt).length;
  const free = Math.max(0, w.maxBarns - owned.length);

  return (
    <div className="screen">
      {/* ---------- Hồ sơ nông dân ---------- */}
      <div className="flex items-center gap-3">
        <div className="avatar w-12 h-12 flex-none"><FarmerAvatar /></div>
        <div className="min-w-0 flex-1">
          <span className="eyebrow">Cổng nông dân</span>
          <h1 className="display text-[20px] leading-tight truncate">{w.name}</h1>
          <p className="text-[12.2px] truncate" style={{ color: "var(--ink-soft)" }}>
            Đang chăm {owned.length}/{w.maxBarns} chuồng · còn nhận {free}
          </p>
        </div>
        <ActionButton action={logout} className="btn btn-ghost btn-sm flex-none" pendingLabel="…">Đăng xuất</ActionButton>
      </div>

      <div className="statusband mt-3.5">
        <div><div className="sb-k">Việc đang chờ</div><div className="sb-v">{openTasks.length}</div></div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Xong hôm nay</div><div className="sb-v">{doneToday}</div></div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Chưa gửi tin</div><div className="sb-v">{silentToday.length}</div></div>
      </div>

      {silentToday.length > 0 && (
        <div className="rounded-[14px] p-3 mt-3 text-[12.7px]"
          style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE", color: "var(--yolk-deep)" }}>
          📷 <b>{silentToday.length} chuồng chưa có tin hôm nay.</b> Các bạn ấy mở app mỗi ngày chỉ để xem đàn mình thế nào —
          một tấm ảnh của cô/chú là đủ.
        </div>
      )}

      {/* ---------- Hộp việc ---------- */}
      <div className="flex items-end justify-between gap-2 mt-4">
        <div>
          <div className="font-bold text-[15px]">Hộp việc {unseen > 0 && <span className="text-[11px] font-bold rounded-full px-1.5 py-0.5 align-middle" style={{ background: "var(--yolk)", color: "#3a2a08" }}>{unseen} mới</span>}</div>
          <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>Việc do chính chủ chuồng giao qua app</div>
        </div>
        {unseen > 0 && (
          <ActionButton action={markTasksSeen} className="btn btn-ghost btn-sm flex-none" pendingLabel="…">Đã đọc</ActionButton>
        )}
      </div>

      {vm.length === 0 ? (
        <div className="soft text-center py-7 mt-2">
          <div className="text-[30px]">☕</div>
          <div className="font-semibold text-[14.5px] mt-1.5">Hết việc rồi!</div>
          <p className="text-[12.8px] mt-1 px-3" style={{ color: "var(--ink-soft)" }}>
            Chưa có yêu cầu nào từ các chủ chuồng. Nhưng đừng quên gửi ảnh cập nhật hằng ngày ở dưới nhé.
          </p>
        </div>
      ) : (
        vm.map((t) => <WorkerTaskCard key={t.id} task={t} />)
      )}

      {/* ---------- Cập nhật hằng ngày ---------- */}
      <div className="card mt-4">
        <div className="font-bold text-[14px]">📷 Gửi cập nhật hôm nay</div>
        <p className="text-[12.2px] mb-2.5 mt-0.5" style={{ color: "var(--ink-soft)" }}>
          Không cần ai giao việc — đây là thứ chủ chuồng mong nhất mỗi ngày.
        </p>
        <DailyUpdateForm barns={barns.map((b) => ({ slug: b.slug, label: b.label }))} />
      </div>

      {/* ---------- Chuồng phụ trách ---------- */}
      <div className="label">Chuồng tôi phụ trách ({barns.length})</div>
      {barns.length === 0 ? (
        <div className="soft text-[13px]" style={{ color: "var(--ink-soft)" }}>
          Chưa có chuồng nào được giao cho bạn.
        </div>
      ) : (
        <div className="grid gap-2.5 mt-1">
          {barns.map((b) => {
            const fresh = b.media[0] && isToday(b.media[0].capturedAt);
            return (
              <Link key={b.id} href={`/nong-trai/chuong/${b.slug}`} className="card flex items-center gap-3 no-underline">
                <div className="flex-none rounded-[11px] overflow-hidden"
                  style={{ width: 68, background: "linear-gradient(180deg,#EAF1E3,#DCE8D2)", border: "1px solid var(--line)" }}>
                  <Coop
                    label={b.label.replace(/^Chuồng\s*/i, "").replace(/["“”]/g, "")}
                    outside={b.outside}
                    decor={b.decor.map((d) => ({ svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped }))}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] truncate" style={{ color: "var(--ink)" }}>{b.label}</div>
                  <div className="text-[12px] truncate" style={{ color: "var(--ink-soft)" }}>
                    {b.owner ? `Chủ: ${b.owner.name ?? b.owner.email}` : "Chưa có chủ — đang ở nông trại"}
                  </div>
                  <div className="text-[11.6px] mt-0.5" style={{ color: fresh ? "var(--paddy)" : "#B4472F" }}>
                    {fresh ? "🟢 Đã gửi tin hôm nay" : b.media[0] ? `⚠️ Tin gần nhất ${timeAgo(b.media[0].capturedAt)}` : "⚠️ Chưa gửi tin nào"}
                  </div>
                </div>
                <span className="flex-none font-semibold text-[14px]" style={{ color: "var(--paddy)" }}>›</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* ---------- Việc vừa xong ---------- */}
      {recentDone.length > 0 && (
        <div className="card mt-3.5">
          <div className="font-bold text-[14px] mb-1">Vừa hoàn thành</div>
          {recentDone.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <span className="flex-none text-[15px]">{TASK_META[t.kind as TaskKind].emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.9px] truncate">{t.title} · {t.barn.label}</div>
                <div className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>
                  {t.status === "DONE" ? "✓ đã gửi minh chứng" : "đã báo không làm được"} · {t.doneAt ? timeAgo(t.doneAt) : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11.6px] mt-5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Mỗi chuồng thuộc về đúng một cô/chú nông dân, và mỗi người nhận tối đa {w.maxBarns} chuồng —
        để còn nhớ được tên từng đàn. Việc chỉ được tính là xong khi có ảnh hoặc video chụp sau khi làm.
      </p>
    </div>
  );
}
