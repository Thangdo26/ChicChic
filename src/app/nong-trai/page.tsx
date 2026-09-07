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
import { unreadByBarn } from "@/lib/messages";
import { barnDisplayName, isToday, timeAgo } from "@/lib/decor";

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export default async function WorkerHome() {
  const w = await requireWorker();

  // ⚠️ `ownerId: { not: null }` LẶP LẠI Ở CẢ BỐN TRUY VẤN, cố ý (§11.41).
  //
  // Chuồng bị chủ hoàn trả vẫn giữ nguyên `workerId` - không ai gỡ cột đó, và đúng vậy:
  // giao lại cho một chủ mới thì chuồng về đúng cô/chú đang quen nó. Nhưng trong lúc
  // chưa có chủ, nó không có việc, không có tin, không có ai đọc ảnh gửi lên - để nó
  // nằm trong danh sách chỉ là rác che mất mấy chuồng đang thật sự cần chăm.
  //
  // Lọc chứ KHÔNG xoá `workerId`: thao tác này phải tự đảo ngược được. Chuồng có chủ
  // trở lại là hiện lại ngay, không cần ai nhớ bàn giao lại lần nữa.
  const coChu = { barn: { ownerId: { not: null } } };
  const [openTasks, recentDone, barns, doneTodayRows, introCount, danSums] = await Promise.all([
    prisma.barnTask.findMany({
      where: { workerId: w.workerId, status: "OPEN", ...coChu },
      include: { lifecycleRequest: true, barn: { select: { slug: true, label: true, owner: { select: { name: true, email: true } } } } },
    }),
    prisma.barnTask.findMany({
      where: { workerId: w.workerId, status: { in: ["DONE", "DECLINED"] }, ...coChu },
      orderBy: { doneAt: "desc" }, take: 5,
      include: { barn: { select: { slug: true, label: true } } },
    }),
    prisma.barn.findMany({
      where: { workerId: w.workerId, ownerId: { not: null } },
      orderBy: { createdAt: "asc" },
      include: {
        owner: { select: { name: true, email: true } },
        decor: { include: { item: { select: { svgKey: true } } }, orderBy: { z: "asc" } },
        flock: { select: { id: true, productLine: true, size: true, stage: true } },
        media: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
      },
    }),
    // Việc xong hôm nay, đếm theo từng chuồng. groupBy thay cho _count có filter (CODEMAP §10).
    prisma.barnTask.groupBy({
      by: ["barnId"],
      where: { workerId: w.workerId, status: "DONE", doneAt: { gte: startOfToday() }, ...coChu },
      _count: { _all: true },
    }),
    prisma.workerMedia.count({ where: { workerId: w.workerId } }),
    // Số con đang sống của từng đàn - ảnh nhỏ vẽ đúng số con (§9.43). Một groupBy cho
    // cả danh sách, không phải một câu mỗi chuồng (§10).
    prisma.bird.groupBy({
      by: ["flockId"],
      where: { flock: { barn: { workerId: w.workerId, ownerId: { not: null } } }, status: "ALIVE" },
      _count: true,
    }),
  ]);
  const danBy = new Map(danSums.map((r) => [r.flockId, r._count]));

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
    lifecycleRequest: t.lifecycleRequest ? {
      flockId: t.lifecycleRequest.flockId, expectedCount: t.lifecycleRequest.expectedCount, status: t.lifecycleRequest.status,
    } : null,
  }));

  const doneTodayBy = new Map(doneTodayRows.map((r) => [r.barnId, r._count._all]));
  const doneToday = doneTodayRows.reduce((s, r) => s + r._count._all, 0);

  // Tin chưa đọc của từng chuồng - một groupBy cho cả 15 chuồng, không N+1 (§10).
  const unreadMsgBy = await unreadByBarn(barns.map((b) => b.id), w.user.id);
  const unreadMsgTotal = Array.from(unreadMsgBy.values()).reduce((s, n) => s + n, 0);

  /** Trạng thái việc của từng chuồng - quyết định icon cảnh báo và thứ tự hiển thị. */
  const rows = barns.map((b) => {
    const mine = openTasks.filter((t) => t.barnId === b.id);
    const overdue = mine.filter((t) => isOverdue({ status: "OPEN", dueAt: t.dueAt })).length;
    return {
      barn: b,
      open: mine.length,
      overdue,
      unseen: mine.filter((t) => !t.seenAt).length,
      msgs: unreadMsgBy.get(b.id) ?? 0,
      done: doneTodayBy.get(b.id) ?? 0,
      fresh: !!b.media[0] && isToday(b.media[0].capturedAt),
      kinds: Array.from(new Set(mine.map((t) => t.kind as TaskKind))),
    };
  });

  // Quá hạn trước, rồi tin nhắn chưa đọc (có người đang chờ trả lời), rồi chuồng còn
  // việc, rồi chuồng chưa gửi tin hôm nay.
  rows.sort((a, b) =>
    (b.overdue - a.overdue) || (b.msgs - a.msgs) || (b.open - a.open) || (Number(a.fresh) - Number(b.fresh)));

  const owned = barns.filter((b) => b.ownerId);
  const silentToday = owned.filter((b) => !b.media[0] || !isToday(b.media[0].capturedAt));
  const unseen = openTasks.filter((t) => !t.seenAt).length;
  const barnsWithWork = rows.filter((r) => r.open > 0).length;
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

      <Link href="/nong-trai/ho-so" className="card flex items-center gap-3 mt-3 no-underline">
        <span className="flex-none text-[18px]">🪪</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[13.6px]" style={{ color: "var(--ink)" }}>Hồ sơ của tôi</div>
          <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
            {introCount > 0
              ? `${introCount} ảnh/video giới thiệu · khách xem trước khi chọn người chăm`
              : "⚠️ Chưa có ảnh giới thiệu - thêm vài tấm để khách yên tâm chọn cô/chú"}
          </div>
        </div>
        <span className="flex-none font-semibold text-[14px]" style={{ color: "var(--paddy)" }}>›</span>
      </Link>

      <div className="statusband mt-3.5">
        <div><div className="sb-k">Việc đang chờ</div><div className="sb-v">{openTasks.length}</div></div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Xong hôm nay</div><div className="sb-v">{doneToday}</div></div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Chưa gửi tin</div><div className="sb-v">{silentToday.length}</div></div>
      </div>

      {unreadMsgTotal > 0 && (
        <div className="rounded-[14px] p-3 mt-3 text-[12.7px]"
          style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE", color: "var(--yolk-deep)" }}>
          💬 <b>{unreadMsgTotal} tin nhắn chưa đọc</b> từ các chủ chuồng. Bấm vào chuồng để đọc -
          trả lời bằng nút có sẵn cũng được, họ chỉ cần biết cô/chú đã xem.
        </div>
      )}

      {/* ---------- Chuồng phụ trách: chuồng nào còn việc thì lên đầu ---------- */}
      <div className="flex items-end justify-between gap-2 mt-4">
        <div>
          <div className="font-bold text-[15px]">Chuồng tôi phụ trách ({barns.length})</div>
          <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
            {barnsWithWork > 0
              ? <>⚠️ <b>{barnsWithWork} chuồng</b> còn việc chưa xong - bấm vào để làm</>
              : "Mọi chuồng đều xong việc 🎉"}
          </div>
        </div>
        {unseen > 0 && (
          <ActionButton action={markTasksSeen} className="btn btn-ghost btn-sm flex-none" pendingLabel="…">Đã đọc</ActionButton>
        )}
      </div>

      {barns.length === 0 ? (
        <div className="soft text-[13px] mt-2" style={{ color: "var(--ink-soft)" }}>
          Chưa có chuồng nào được giao cho bạn.
        </div>
      ) : (
        <div className="grid gap-2.5 mt-2">
          {rows.map(({ barn: b, open, overdue, unseen: nNew, msgs, done, fresh, kinds }) => (
            <Link
              key={b.id}
              href={`/nong-trai/chuong/${b.slug}`}
              className="card flex items-center gap-3 no-underline"
              style={overdue > 0 ? { borderColor: "#E2B4A6", background: "#FFFBFA" }
                : open > 0 ? { borderColor: "#EBD8AE" } : undefined}
            >
              <div className="flex-none rounded-[11px] overflow-hidden relative"
                style={{ width: 68, background: "linear-gradient(180deg,#EAF1E3,#DCE8D2)", border: "1px solid var(--line)" }}>
                <Coop
                  label={barnDisplayName(b.label)}
                  outside={b.outside}
                  soCon={b.flock ? (danBy.get(b.flock.id) ?? 0) : 0}
                  decor={b.decor.map((d) => ({ id: d.id, svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped, text: d.text }))}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {open > 0 && (
                    <span className="flex-none text-[14px]" aria-label={`Còn ${open} việc chưa xong`}>
                      {overdue > 0 ? "🔴" : "⚠️"}
                    </span>
                  )}
                  <span className="font-semibold text-[14px] truncate" style={{ color: "var(--ink)" }}>{b.label}</span>
                </div>
                <div className="text-[12px] truncate" style={{ color: "var(--ink-soft)" }}>
                  {b.owner ? `Chủ: ${b.owner.name ?? b.owner.email}` : "Chưa có chủ - đang ở nông trại"}
                </div>

                {/* Trạng thái việc của chuồng này */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  {open > 0 ? (
                    <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
                      style={overdue > 0
                        ? { background: "#FBE7E1", color: "#8A3A26" }
                        : { background: "var(--yolk-tint)", color: "var(--yolk-deep)" }}>
                      {overdue > 0 ? `${overdue} việc QUÁ HẠN · ` : ""}{open} việc chưa xong
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
                      style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                      ✓ Xong hết việc
                    </span>
                  )}
                  {done > 0 && (
                    <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                      style={{ background: "var(--paper2)", color: "var(--ink-soft)" }}>
                      ✅ {done} xong hôm nay
                    </span>
                  )}
                  {nNew > 0 && (
                    <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
                      style={{ background: "var(--yolk)", color: "#3a2a08" }}>{nNew} mới</span>
                  )}
                  {msgs > 0 && (
                    <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
                      style={{ background: "var(--yolk)", color: "#3a2a08" }}>💬 {msgs} tin chưa đọc</span>
                  )}
                </div>

                {kinds.length > 0 && (
                  <div className="text-[11.6px] mt-1 truncate" style={{ color: "var(--ink-soft)" }}>
                    Cần làm: {kinds.map((k) => `${TASK_META[k].emoji} ${TASK_META[k].label}`).join(" · ")}
                  </div>
                )}
                <div className="text-[11.6px] mt-0.5" style={{ color: fresh ? "var(--paddy)" : "#B4472F" }}>
                  {fresh ? "🟢 Đã gửi tin hôm nay" : b.media[0] ? `⚠️ Tin gần nhất ${timeAgo(b.media[0].capturedAt)}` : "⚠️ Chưa gửi tin nào"}
                </div>
              </div>

              <span className="flex-none font-semibold text-[14px]" style={{ color: "var(--paddy)" }}>›</span>
            </Link>
          ))}
        </div>
      )}

      {silentToday.length > 0 && (
        <div className="rounded-[14px] p-3 mt-3 text-[12.7px]"
          style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE", color: "var(--yolk-deep)" }}>
          📷 <b>{silentToday.length} chuồng chưa có tin hôm nay.</b> Các bạn ấy mở app mỗi ngày chỉ để xem đàn mình thế nào -
          một tấm ảnh của cô/chú là đủ.
        </div>
      )}

      {/* ---------- Hộp việc: tất cả việc, gộp từ mọi chuồng ---------- */}
      <div className="flex items-end justify-between gap-2 mt-4">
        <div>
          <div className="font-bold text-[15px]">
            Hộp việc {unseen > 0 && <span className="text-[11px] font-bold rounded-full px-1.5 py-0.5 align-middle" style={{ background: "var(--yolk)", color: "#3a2a08" }}>{unseen} mới</span>}
          </div>
          <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>Toàn bộ việc đang chờ, quá hạn xếp trước</div>
        </div>
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
          Không cần ai giao việc - đây là thứ chủ chuồng mong nhất mỗi ngày.
        </p>
        <DailyUpdateForm barns={barns.map((b) => ({ slug: b.slug, label: b.label }))} />
      </div>

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
        Mỗi chuồng thuộc về đúng một cô/chú nông dân, và mỗi người nhận tối đa {w.maxBarns} chuồng -
        để còn nhớ được tên từng đàn. Việc chỉ được tính là xong khi có ảnh hoặc video chụp sau khi làm.
      </p>
    </div>
  );
}
