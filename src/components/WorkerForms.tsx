"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { completeTask, declineTask, postDailyUpdate } from "@/app/worker-actions";
import { useToast } from "@/components/Toast";
import { TASK_META, isOverdue, type TaskKind, type TaskStatus } from "@/lib/tasks";
import { hhmm, timeAgo } from "@/lib/decor";

const CLS = "rounded-[11px] px-3 py-2.5 text-[13.7px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

/**
 * Ảnh/video mẫu sẵn có trong repo — bấm một cái là điền đường dẫn.
 * Bản PoC dán URL (Supabase Storage / YouTube); nút này để demo chạy được ngay
 * khi chưa có chỗ upload.
 */
const SAMPLES: { url: string; label: string; type: "PHOTO" | "VIDEO" }[] = [
  { url: "/demo/photo-sang.svg", label: "Cữ ăn sáng", type: "PHOTO" },
  { url: "/demo/photo-vuon.svg", label: "Ngoài vườn", type: "PHOTO" },
  { url: "/demo/photo-trung.svg", label: "Mẻ trứng", type: "PHOTO" },
  { url: "/demo/photo-decor.svg", label: "Góc decor", type: "PHOTO" },
  { url: "/demo/photo-chieu.svg", label: "Chạng vạng", type: "PHOTO" },
  { url: "/demo/video-cho-an.svg", label: "Clip cho ăn", type: "VIDEO" },
  { url: "/demo/video-tha-vuon.svg", label: "Clip thả vườn", type: "VIDEO" },
];

function SampleRow({ onPick }: { onPick: (s: (typeof SAMPLES)[number]) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {SAMPLES.map((s) => (
        <button key={s.url} type="button" onClick={() => onPick(s)}
          className="text-[11.8px] font-semibold rounded-full px-2.5 py-1"
          style={{ background: "var(--paper2)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}>
          {s.type === "VIDEO" ? "🎬" : "🖼️"} {s.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Một việc trong hộp việc ----------------

export type WorkerTaskVM = {
  id: string;
  kind: TaskKind;
  title: string;
  note: string | null;
  dueAt: string | null;
  status: TaskStatus;
  createdAt: string;
  seen: boolean;
  barnSlug: string;
  barnLabel: string;
  ownerName: string | null;
};

export function WorkerTaskCard({ task }: { task: WorkerTaskVM }) {
  const meta = TASK_META[task.kind];
  const late = isOverdue({ status: task.status, dueAt: task.dueAt });
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"PHOTO" | "VIDEO">("PHOTO");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  const finish = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("url", url); fd.set("type", type); fd.set("note", note);
      try {
        const r = await completeTask(task.id, fd);
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setUrl(""); setNote(""); setOpen(false); }
      } catch {
        toast("Không gửi được. Kiểm tra mạng rồi thử lại.", "err");
      }
    });

  const refuse = () =>
    start(async () => {
      try {
        const r = await declineTask(task.id, reason);
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setReason(""); setShowDecline(false); }
      } catch {
        toast("Không gửi được. Thử lại nhé.", "err");
      }
    });

  return (
    <div className="card mt-2.5" style={late ? { borderColor: "#EBBFAE" } : undefined}>
      <div className="flex gap-2.5">
        <div className="w-9 h-9 flex-none rounded-[11px] grid place-items-center text-[17px]"
          style={{ background: "var(--paddy-tint)" }}>{meta.emoji}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[14px]">{task.title}</span>
            {!task.seen && (
              <span className="text-[10.5px] font-bold rounded-full px-1.5 py-0.5"
                style={{ background: "var(--yolk)", color: "#3a2a08" }}>MỚI</span>
            )}
            {late && (
              <span className="text-[10.5px] font-bold rounded-full px-1.5 py-0.5"
                style={{ background: "#FBE7E1", color: "#8A3A26" }}>QUÁ GIỜ</span>
            )}
          </div>

          <Link href={`/nong-trai/chuong/${task.barnSlug}`} className="text-[12.4px] font-semibold no-underline"
            style={{ color: "var(--paddy)" }}>{task.barnLabel} ›</Link>
          <span className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
            {task.ownerName ? ` · chủ chuồng: ${task.ownerName}` : ""}
          </span>

          {task.note && <div className="text-[12.8px] mt-1">“{task.note}”</div>}

          <div className="text-[11.6px] mt-1" style={{ color: late ? "#B4472F" : "var(--ink-soft)" }}>
            {task.dueAt ? `⏰ Hẹn ${hhmm(task.dueAt)} · ${new Date(task.dueAt).toLocaleDateString("vi-VN")}` : `Giao ${timeAgo(task.createdAt)}`}
          </div>
        </div>
      </div>

      <div className="soft mt-2.5 text-[12.4px]" style={{ color: "var(--ink-soft)" }}>
        <b style={{ color: "var(--ink)" }}>Cần làm:</b> {meta.doing}
        <br /><b style={{ color: "var(--ink)" }}>Cần gửi:</b> {meta.proof}
      </div>

      {!open ? (
        <div className="flex gap-2 mt-2.5">
          <button className="btn btn-primary btn-sm flex-1" style={{ width: "100%" }} onClick={() => setOpen(true)}>
            📸 Đã làm xong — gửi ảnh
          </button>
          <button className="btn btn-ghost btn-sm flex-none" onClick={() => setShowDecline((v) => !v)}>Không làm được</button>
        </div>
      ) : (
        <div className="grid gap-2 mt-2.5">
          <div className="seg" style={{ background: "var(--paper2)" }}>
            <button className={type === "PHOTO" ? "on" : ""} onClick={() => setType("PHOTO")}>🖼️ Ảnh</button>
            <button className={type === "VIDEO" ? "on" : ""} onClick={() => setType("VIDEO")}>🎬 Video</button>
          </div>
          <input className={CLS} style={BORDER} value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder={type === "VIDEO" ? "https://youtu.be/…  hoặc  https://…/clip.mp4" : "https://…/anh.jpg"} />
          <SampleRow onPick={(s) => { setUrl(s.url); setType(s.type); }} />
          <textarea className={CLS} style={BORDER} rows={2} maxLength={300} value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nhắn gì cho chủ chuồng? VD: đàn ăn hết cữ, con Nâu ăn khoẻ lại rồi" />
          <button className="btn btn-primary" onClick={finish} disabled={pending || !url.trim()}>
            {pending ? "Đang gửi…" : "Hoàn thành việc này ✓"}
          </button>
          {!url.trim() && (
            <p className="text-[11.4px] text-center" style={{ color: "var(--ink-soft)" }}>
              Phải có ảnh hoặc video mới tích xong được — đó là bằng chứng gửi tới chủ chuồng.
            </p>
          )}
          <button className="btn btn-ghost btn-sm mx-auto" onClick={() => setOpen(false)} disabled={pending}>Để lát nữa</button>
        </div>
      )}

      {showDecline && (
        <div className="grid gap-2 mt-2.5">
          <textarea className={CLS} style={BORDER} rows={2} maxLength={300} value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do — VD: trời mưa to, thả vườn nay không an toàn cho đàn" />
          <button className="btn btn-ghost" onClick={refuse} disabled={pending || reason.trim().length < 5}
            style={{ color: "#B4472F", borderColor: "#F0CFC6" }}>
            {pending ? "Đang gửi…" : "Báo lại cho chủ chuồng"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------- Cập nhật hằng ngày (không cần ai giao việc) ----------------

export function DailyUpdateForm({ barns }: { barns: { slug: string; label: string }[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<"PHOTO" | "VIDEO">("PHOTO");
  const [pending, start] = useTransition();
  const toast = useToast();

  if (barns.length === 0) return null;

  return (
    <form
      ref={ref}
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        start(async () => {
          try {
            const r = await postDailyUpdate(data);
            toast(r.message, r.ok ? "ok" : "warn");
            if (r.ok) {
              // giữ chuồng đang chọn, xoá nội dung để gửi tiếp chuồng khác cho nhanh
              const barn = (form.elements.namedItem("barn") as HTMLSelectElement | null)?.value;
              form.reset();
              const sel = form.elements.namedItem("barn") as HTMLSelectElement | null;
              if (sel && barn) sel.value = barn;
            }
          } catch {
            toast("Không gửi được. Thử lại giúp mình nhé.", "err");
          }
        });
      }}
    >
      <select name="barn" className={CLS} style={BORDER} required>
        {barns.map((b) => <option key={b.slug} value={b.slug}>{b.label}</option>)}
      </select>
      <textarea name="text" rows={3} className={CLS} style={BORDER} maxLength={1000}
        placeholder="Hôm nay ở chuồng thế nào? VD: đàn dậy sớm, ăn hết cữ sáng, trời nắng đẹp." />
      <select name="type" className={CLS} style={BORDER} value={type}
        onChange={(e) => setType(e.target.value as "PHOTO" | "VIDEO")}>
        <option value="PHOTO">Kèm ảnh</option>
        <option value="VIDEO">Kèm video</option>
      </select>
      <input name="url" className={CLS} style={BORDER}
        placeholder={type === "VIDEO" ? "Đường dẫn video (tuỳ chọn)" : "Đường dẫn ảnh (tuỳ chọn)"} />
      <SampleRow onPick={(s) => {
        const form = ref.current;
        if (!form) return;
        (form.elements.namedItem("url") as HTMLInputElement).value = s.url;
        (form.elements.namedItem("type") as HTMLSelectElement).value = s.type;
        setType(s.type);
      }} />
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Đang gửi…" : "Gửi cập nhật hôm nay"}
      </button>
    </form>
  );
}
