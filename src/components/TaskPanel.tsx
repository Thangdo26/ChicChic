"use client";
import { useState, useTransition } from "react";
import { requestTask, cancelTask } from "@/app/task-actions";
import { useToast } from "@/components/Toast";
import { FEED_SLOTS, TASK_META, isOverdue, nextOccurrence, type TaskKind, type TaskStatus } from "@/lib/tasks";
import { hhmm, mediaKind, timeAgo } from "@/lib/decor";

export type TaskVM = {
  id: string;
  kind: TaskKind;
  title: string;
  note: string | null;
  dueAt: string | null;
  status: TaskStatus;
  createdAt: string;
  doneAt: string | null;
  doneNote: string | null;
  proofUrl: string | null;
  proofType: "PHOTO" | "VIDEO" | null;
};

/** Việc chủ chuồng tự giao được. DECOR sinh ra từ màn trang trí, RANGE từ nút thả vườn. */
const ASKABLE: TaskKind[] = ["FEED", "CHECK"];

const STATUS_STYLE: Record<TaskStatus, React.CSSProperties> = {
  OPEN: { background: "var(--yolk-tint)", color: "var(--yolk-deep)" },
  DONE: { background: "var(--paddy-tint)", color: "var(--paddy-deep)" },
  DECLINED: { background: "#FBE7E1", color: "#8A3A26" },
};

export default function TaskPanel({
  barnSlug, workerName, tasks, canAssign,
}: {
  barnSlug: string;
  workerName: string;
  tasks: TaskVM[];
  canAssign: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TaskKind>("FEED");
  const [slot, setSlot] = useState<string>(FEED_SLOTS[0].value);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  const waiting = tasks.filter((t) => t.status === "OPEN");

  const send = () => {
    // Giờ hẹn tính ở máy người dùng rồi gửi ISO — server không phải đoán múi giờ.
    const dueAt = kind === "FEED" ? nextOccurrence(slot).toISOString() : null;
    start(async () => {
      try {
        const r = await requestTask(barnSlug, kind, note, dueAt);
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setNote(""); setOpen(false); }
      } catch {
        toast("Không gửi được việc. Thử lại giúp mình nhé.", "err");
      }
    });
  };

  const drop = (id: string) =>
    start(async () => {
      try {
        const r = await cancelTask(id);
        toast(r.message, r.ok ? "ok" : "warn");
      } catch {
        toast("Không rút lại được. Thử lại nhé.", "err");
      }
    });

  return (
    <div className="card mt-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-[14px]">Việc bạn giao cho {workerName}</div>
          <div className="text-[11.9px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
            {waiting.length > 0
              ? `${waiting.length} việc đang chờ — xong việc nào ${workerName} gửi ảnh việc đó`
              : `Chưa có việc nào chờ. ${workerName} vẫn chăm đàn theo lịch thường ngày.`}
          </div>
        </div>
        {canAssign && (
          <button className="btn btn-ghost btn-sm flex-none" onClick={() => setOpen((v) => !v)}>
            {open ? "Đóng" : "+ Giao việc"}
          </button>
        )}
      </div>

      {open && canAssign && (
        <div className="soft mt-2.5 grid gap-2.5">
          <div className="seg" style={{ background: "#fff" }}>
            {ASKABLE.map((k) => (
              <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                {TASK_META[k].emoji} {TASK_META[k].label}
              </button>
            ))}
          </div>

          {kind === "FEED" && (
            <div className="grid gap-1.5">
              <div className="text-[12.3px] font-semibold">Cho ăn vào cữ nào?</div>
              <div className="flex gap-1.5 flex-wrap">
                {FEED_SLOTS.map((s) => (
                  <button
                    key={s.value}
                    className="text-[12.5px] font-semibold rounded-full px-3 py-1.5"
                    style={slot === s.value
                      ? { background: "var(--paddy)", color: "#F7FBF4" }
                      : { background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
                    onClick={() => setSlot(s.value)}
                  >{s.label}</button>
                ))}
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
                Hẹn cho lần gần nhất: {hhmm(nextOccurrence(slot))} — {nextOccurrence(slot).toLocaleDateString("vi-VN")}
              </div>
            </div>
          )}

          <textarea
            rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
            className="rounded-[11px] px-3 py-2.5 text-[13.5px] w-full"
            style={{ border: "1.5px solid var(--line)", background: "#fff" }}
            placeholder={kind === "FEED" ? "VD: cho ăn thêm ít rau xanh giúp mình nhé" : "VD: xem giúp bạn Nâu hôm nay có ăn không"}
          />

          <button className="btn btn-primary" onClick={send} disabled={pending}>
            {pending ? "Đang gửi…" : `Gửi việc cho ${workerName} →`}
          </button>
          <p className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>
            {TASK_META[kind].doing} Làm xong, {workerName} phải đính kèm ảnh/video mới tích được hoàn thành.
          </p>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-[12.8px] mt-2.5" style={{ color: "var(--ink-soft)" }}>
          Chưa có việc nào được giao cho chuồng này.
        </div>
      ) : (
        <div className="mt-1">
          {tasks.map((t) => {
            const meta = TASK_META[t.kind];
            const late = isOverdue({ status: t.status, dueAt: t.dueAt });
            return (
              <div key={t.id} className="flex gap-2.5 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
                <div className="w-8 h-8 flex-none rounded-[10px] grid place-items-center text-[15px]"
                  style={{ background: "var(--paper2)" }}>{meta.emoji}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-[13.3px]">{t.title}</span>
                    <span className="text-[10.8px] font-semibold rounded-full px-1.5 py-0.5" style={STATUS_STYLE[t.status]}>
                      {t.status === "OPEN" ? (late ? "Quá giờ hẹn" : "Đang chờ") : t.status === "DONE" ? "✓ Đã xong" : "Không làm được"}
                    </span>
                  </div>

                  {t.note && <div className="text-[12.6px] mt-0.5" style={{ color: "var(--ink-soft)" }}>“{t.note}”</div>}

                  {t.dueAt && t.status === "OPEN" && (
                    <div className="text-[11.6px] mt-0.5" style={{ color: late ? "#B4472F" : "var(--ink-soft)" }}>
                      ⏰ Hẹn {hhmm(t.dueAt)} · {new Date(t.dueAt).toLocaleDateString("vi-VN")}
                    </div>
                  )}

                  {t.status === "DONE" && (
                    <div className="flex items-center gap-2 mt-1.5">
                      {t.proofUrl && (
                        <a href={t.proofUrl} target="_blank" rel="noreferrer"
                          className="flex-none rounded-[9px] overflow-hidden no-underline grid place-items-center"
                          style={{ width: 52, height: 40, border: "1px solid var(--line)", background: "var(--paper2)" }}>
                          {mediaKind(t.proofUrl) === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.proofUrl} alt="Minh chứng công việc"
                              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span className="text-[16px]">🎬</span>
                          )}
                        </a>
                      )}
                      <div className="text-[11.6px] min-w-0" style={{ color: "var(--ink-soft)" }}>
                        {workerName} báo xong {t.doneAt ? timeAgo(t.doneAt) : ""} · có {t.proofType === "VIDEO" ? "video" : "ảnh"} minh chứng
                      </div>
                    </div>
                  )}

                  {t.status === "DECLINED" && t.doneNote && (
                    <div className="text-[12.3px] mt-1 rounded-[10px] px-2.5 py-1.5"
                      style={{ background: "#FBE7E1", color: "#8A3A26" }}>
                      {workerName}: “{t.doneNote}”
                    </div>
                  )}
                </div>

                {t.status === "OPEN" && canAssign && (
                  <button className="btn btn-ghost btn-sm flex-none self-start" disabled={pending}
                    style={{ color: "#B4472F", borderColor: "#F0CFC6" }} onClick={() => drop(t.id)}>Rút</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
