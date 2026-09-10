"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { acceptLifecycleTask, completeTask, declineTask, postDailyUpdate, logHarvest, logWeighIn } from "@/app/worker-actions";
import { useRouter } from "next/navigation";
import { LIFECYCLE_STATUS_VI } from "@/lib/lifecycle";
import { useToast } from "@/components/Toast";
import { WEIGH_GAM_MAX, WEIGH_GAM_MIN, WEIGH_MAU_TOI_THIEU } from "@/lib/weighin";
import MediaUpload from "@/components/MediaUpload";
import { TASK_META, isOverdue, type TaskKind, type TaskStatus } from "@/lib/tasks";
import { hhmm, timeAgo } from "@/lib/decor";
import { nhanChoViec } from "@/lib/van-hanh-meta";
import {
  MAX_BIRDS_PER_LOG, MAX_EGGS_PER_LOG, WEIGHT_MAX, WEIGHT_MIN, type LotType,
} from "@/lib/harvest";

const CLS = "rounded-[11px] px-3 py-2.5 text-[13.7px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

/**
 * Ảnh/video minh chứng đã tải lên - hiện lại để cô chú biết mình vừa gửi đúng cái gì.
 * KHÔNG có nút "ảnh mẫu" nào ở đây: minh chứng phải là ảnh chụp thật ngoài chuồng,
 * cho chọn ảnh dựng sẵn là phá thẳng bất biến "không minh chứng thì không xong".
 */
function ProofPreview({ url, kind, onClear }: { url: string; kind: "PHOTO" | "VIDEO"; onClear: () => void }) {
  if (!url) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-[11px] p-2" style={{ background: "var(--paper2)", border: "1px solid var(--line)" }}>
      <div className="w-12 h-12 flex-none rounded-[9px] overflow-hidden grid place-items-center" style={{ background: "#fff" }}>
        {kind === "PHOTO"
          ? <img src={url} alt="Ảnh minh chứng vừa tải lên" className="w-full h-full object-cover" />
          : <span className="text-[20px]">🎬</span>}
      </div>
      <div className="flex-1 min-w-0 text-[12.3px]">
        <b>{kind === "VIDEO" ? "Đã có video" : "Đã có ảnh"}</b>
        <div className="truncate" style={{ color: "var(--ink-soft)" }}>{url.split("/").pop()}</div>
      </div>
      <button type="button" onClick={onClear} className="btn btn-ghost btn-sm flex-none">Đổi</button>
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
  decorSnapshot?: string;
  gearTargets?: { id: string; status: string; label: string }[];
  lifecycleRequest?: { flockId: string; expectedCount: number; status: keyof typeof LIFECYCLE_STATUS_VI } | null;
};

export function WorkerTaskCard({ task }: { task: WorkerTaskVM }) {
  const router = useRouter();
  const [confirmedCount, setConfirmedCount] = useState("");
  const meta = TASK_META[task.kind];
  const late = isOverdue({ status: task.status, dueAt: task.dueAt });
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"PHOTO" | "VIDEO">("PHOTO");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  // Nhãn một chạm (Epic 7 · §18.3). `""` = cô chú không chọn gì, và đó là mặc định - nhãn
  // **không bao giờ** được chọn sẵn giùm, vì một nhãn chọn sẵn là một câu nói thay người khác.
  const [nhan, setNhan] = useState("");
  const [reason, setReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  const finish = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("url", url); fd.set("type", type); fd.set("note", note);
      if (task.lifecycleRequest) fd.set("confirmedCount", confirmedCount);
      if (task.kind === "DECOR") fd.set("decorSnapshot", task.decorSnapshot ?? "");
      if (task.kind === "GEAR") fd.set("gearSnapshot", JSON.stringify((task.gearTargets ?? []).map(({ id, status }) => ({ id, status }))));
      if (nhan) fd.set("nhan", nhan);
      try {
        const r = await completeTask(task.id, fd);
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setUrl(""); setNote(""); setNhan(""); setOpen(false); }
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
          {task.kind === "GEAR" && <div className="soft mt-2 text-sm">
            <b>Yếm cần xử lý</b>
            {(task.gearTargets ?? []).map((g) => <p key={g.id}>{g.status === "PENDING_ON" ? "Mặc" : "Tháo"} · {g.label}</p>)}
            <p className="text-xs mt-1">Minh chứng cần nhìn rõ các con trong danh sách. Danh sách thay đổi thì tải lại trước khi xác nhận.</p>
          </div>}
          {task.lifecycleRequest && <div className="text-[12px] mt-2">
            Đàn: <code>{task.lifecycleRequest.flockId}</code> · {task.lifecycleRequest.expectedCount} con cần đối soát.
            <p>{LIFECYCLE_STATUS_VI[task.lifecycleRequest.status]}</p>
          </div>}

          <div className="text-[11.6px] mt-1" style={{ color: late ? "#B4472F" : "var(--ink-soft)" }}>
            {task.dueAt ? `⏰ Hẹn ${hhmm(task.dueAt)} · ${new Date(task.dueAt).toLocaleDateString("vi-VN")}` : `Giao ${timeAgo(task.createdAt)}`}
          </div>
        </div>
      </div>

      <div className="soft mt-2.5 text-[12.4px]" style={{ color: "var(--ink-soft)" }}>
        <b style={{ color: "var(--ink)" }}>Cần làm:</b> {meta.doing}
        <br /><b style={{ color: "var(--ink)" }}>Cần gửi:</b> {meta.proof}
      </div>

      {task.lifecycleRequest?.status === "REQUESTED" && (
        <button className="btn btn-primary btn-sm mt-2" disabled={pending} onClick={() => start(async () => {
          try {
            const r = await acceptLifecycleTask(task.id);
            toast(r.message, r.ok ? "ok" : "warn"); if (r.ok) router.refresh();
          } catch { toast("Chưa nhận được việc. Kiểm tra mạng rồi thử lại.", "err"); }
        })}>{pending ? "Đang nhận…" : task.kind === "RETIRE" ? "Nhận việc · xác nhận farm tiếp tục chăm đàn" : "Nhận việc thu hoạch đàn này"}</button>
      )}
      {!open ? (
        <div className="flex gap-2 mt-2.5">
          <button className="btn btn-primary btn-sm flex-1" style={{ width: "100%" }}
            disabled={pending || task.lifecycleRequest?.status === "REQUESTED"} onClick={() => setOpen(true)}>
            📸 Đã làm xong - gửi ảnh
          </button>
          <button className="btn btn-ghost btn-sm flex-none" onClick={() => setShowDecline((v) => !v)}>Không làm được</button>
        </div>
      ) : (
        <div className="grid gap-2 mt-2.5">
          {task.lifecycleRequest && <label className="text-[13px]">
            Số con thực tế đã đối soát (yêu cầu: {task.lifecycleRequest.expectedCount})
            <input className={CLS} style={BORDER} type="number" min={1} step={1} inputMode="numeric"
              value={confirmedCount} onChange={(e) => setConfirmedCount(e.target.value)} />
          </label>}
          <div className="seg" style={{ background: "var(--paper2)" }}>
            <button className={type === "PHOTO" ? "on" : ""} onClick={() => setType("PHOTO")}>🖼️ Ảnh</button>
            <button className={type === "VIDEO" ? "on" : ""} onClick={() => setType("VIDEO")}>🎬 Video</button>
          </div>
          {url
            ? <ProofPreview url={url} kind={type} onClear={() => setUrl("")} />
            : <MediaUpload folder="viec" kind={type} onUploaded={setUrl} />}
          <details>
            <summary className="text-[11.8px] cursor-pointer" style={{ color: "var(--ink-soft)" }}>
              Hoặc dán đường dẫn có sẵn (YouTube, ảnh trên mạng…)
            </summary>
            <input className={`${CLS} mt-1.5`} style={BORDER} value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder={type === "VIDEO" ? "https://youtu.be/…  hoặc  https://…/clip.mp4" : "https://…/anh.jpg"} />
          </details>
          {/*
            NHÃN MỘT CHẠM (Epic 7 · spec §18.3 · FL-D24).

            ⚠️ **Không bắt buộc, và không được phép thành bắt buộc.** Nút "Hoàn thành" bên
            dưới không hề nhìn tới `nhan` - mục tiêu §4 là nông dân tăng tải ≤30 phút/tuần, và
            một trường bắt buộc trên đường "báo xong" là thứ đứng chắn giữa một người đang
            đứng ngoài chuồng và việc họ vừa làm.

            Bấm một cái thì được gì: nhãn **thay** câu ghi chú mặc định, nên nó bớt gõ chứ
            không thêm việc. Loại việc không có nhãn nào ⟹ cả khối biến mất.
          */}
          {nhanChoViec(task.kind).length > 0 && (
            <div>
              <div className="text-[11.8px] mb-1" style={{ color: "var(--ink-soft)" }}>
                Vừa làm gì? (bấm một cái cho nhanh - không bấm cũng được)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {nhanChoViec(task.kind).map((n) => (
                  <button key={n.khoa} type="button"
                    onClick={() => setNhan((v) => (v === n.khoa ? "" : n.khoa))}
                    className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
                    style={nhan === n.khoa
                      ? { background: "var(--paddy)", color: "#fff" }
                      : { background: "var(--paper2)", color: "var(--ink-soft)" }}>
                    {n.emoji} {n.nhan}
                  </button>
                ))}
              </div>
            </div>
          )}
          <textarea className={CLS} style={BORDER} rows={2} maxLength={300} value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nhắn gì cho chủ chuồng? VD: đàn ăn hết cữ, con Nâu ăn khoẻ lại rồi" />
          <button className="btn btn-primary" onClick={finish} disabled={pending || !url.trim()}>
            {pending ? "Đang gửi…" : "Hoàn thành việc này ✓"}
          </button>
          {!url.trim() && (
            <p className="text-[11.4px] text-center" style={{ color: "var(--ink-soft)" }}>
              Phải có ảnh hoặc video mới tích xong được - đó là bằng chứng gửi tới chủ chuồng.
            </p>
          )}
          <button className="btn btn-ghost btn-sm mx-auto" onClick={() => setOpen(false)} disabled={pending}>Để lát nữa</button>
        </div>
      )}

      {showDecline && (
        <div className="grid gap-2 mt-2.5">
          <textarea className={CLS} style={BORDER} rows={2} maxLength={300} value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do - VD: trời mưa to, thả vườn nay không an toàn cho đàn" />
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
  const [url, setUrl] = useState("");
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
              setUrl("");
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
      {/* Giá trị thật gửi lên server; ô này ẩn vì đường dẫn do nút tải lên điền. */}
      <input type="hidden" name="url" value={url} readOnly />
      {url
        ? <ProofPreview url={url} kind={type} onClear={() => setUrl("")} />
        : <MediaUpload folder="nhat-ky" kind={type} onUploaded={setUrl}
            label={type === "VIDEO" ? "🎬 Quay/chọn video (tuỳ chọn)" : "📸 Chụp/chọn ảnh (tuỳ chọn)"} />}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Đang gửi…" : "Gửi cập nhật hôm nay"}
      </button>
    </form>
  );
}

// ---------------- Sổ thu hoạch ----------------

/**
 * Nông dân ghi lô vừa thu - trứng nhặt được hôm nay, hoặc gà vừa mổ.
 *
 * Ảnh là BẮT BUỘC (khác `DailyUpdateForm` để ảnh tuỳ chọn): lô hàng là tài sản có
 * chủ và sau này bán lại được, nên phải có bằng chứng nó tồn tại thật (§9.1).
 *
 * Ô cân chỉ hiện với gà thịt. Đó là con số nhân thẳng vào tiền người mua trả trên
 * chợ, nên nhắc ngay tại chỗ là phải cân thật - server còn chặn khoảng một lần nữa.
 */
export function HarvestForm({
  barns,
}: {
  /** Chuồng cô/chú phụ trách, kèm loại đàn để biết mặc định thu trứng hay thu thịt. */
  barns: { slug: string; label: string; isLayer: boolean; flockId: string; meatRequestId: string | null }[];
}) {
  const [barnSlug, setBarnSlug] = useState(barns[0]?.slug ?? "");
  const barn = barns.find((b) => b.slug === barnSlug) ?? barns[0];
  const [type, setType] = useState<LotType>(barns[0]?.meatRequestId ? "MEAT" : "EGG");
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  if (barns.length === 0) return null;
  if (!barn.isLayer && !barn.meatRequestId) return <p className="text-[13px]">Chưa có yêu cầu thu hoạch đã nhận cho đàn này.</p>;

  // Nhận/rút request có thể refresh props mà vẫn giữ state của form hiện tại.
  const selectedType = !barn.isLayer ? "MEAT" : type === "MEAT" && !barn.meatRequestId ? "EGG" : type;
  const isEgg = selectedType === "EGG";

  // Đổi chuồng thì đoán lại loại thu hoạch theo đàn của chuồng đó - cô chú không phải
  // nhớ chuồng nào là gà đẻ, chuồng nào là gà thịt.
  const pickBarn = (slug: string) => {
    setBarnSlug(slug);
    const b = barns.find((x) => x.slug === slug);
    if (b) setType(b.meatRequestId ? "MEAT" : "EGG");
  };

  return (
    <form
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        start(async () => {
          try {
            const r = await logHarvest(data);
            toast(r.message, r.ok ? "ok" : "warn");
            if (r.ok) { form.reset(); setUrl(""); }
          } catch {
            toast("Không gửi được. Thử lại giúp mình nhé.", "err");
          }
        });
      }}
    >
      <select name="barn" className={CLS} style={BORDER} required
        value={barnSlug} onChange={(e) => pickBarn(e.target.value)}>
        {barns.map((b) => <option key={b.slug} value={b.slug}>{b.label}</option>)}
      </select>
      <input type="hidden" name="flockId" value={barn.flockId} readOnly />
      <input type="hidden" name="lifecycleRequestId" value={barn.meatRequestId ?? ""} readOnly />

      <div className="grid grid-cols-2 gap-2">
        <select name="type" className={CLS} style={BORDER}
          value={selectedType} onChange={(e) => setType(e.target.value as LotType)}>
          {barn.isLayer && <option value="EGG">🥚 Trứng</option>}
          {barn.meatRequestId && <option value="MEAT">🍗 Gà thịt · đúng yêu cầu đã nhận</option>}
        </select>
        <input name="qty" type="number" inputMode="numeric" className={CLS} style={BORDER}
          min={1} max={isEgg ? MAX_EGGS_PER_LOG : MAX_BIRDS_PER_LOG} required
          placeholder={isEgg ? "Mấy quả?" : "Mấy con?"} />
      </div>

      {!isEgg && (
        <div>
          <input name="weightKg" type="number" inputMode="decimal" step="0.1" className={CLS} style={BORDER}
            min={WEIGHT_MIN} max={WEIGHT_MAX * MAX_BIRDS_PER_LOG} required
            placeholder="Tổng số cân (kg) - cân thật giúp mình" />
          <p className="text-[11.4px] mt-1" style={{ color: "#8A5A1A" }}>
            ⚖️ Số cân này <b>nhân thẳng vào tiền</b> nếu chủ chuồng bán lại. Cân rồi ghi đúng nhé -
            một con gà ta thường {WEIGHT_MIN}–{WEIGHT_MAX}kg.
          </p>
        </div>
      )}

      <select name="storage" className={CLS} style={BORDER} defaultValue={isEgg ? "CHILLED" : "FROZEN"}>
        <option value="CHILLED">Để ngăn mát</option>
        <option value="FROZEN">Đã cấp đông</option>
      </select>

      <textarea name="note" rows={2} className={CLS} style={BORDER} maxLength={300}
        placeholder="Ghi chú (tuỳ chọn) - VD: trứng to đều, một quả hơi nhỏ." />

      <input type="hidden" name="url" value={url} readOnly />
      <input type="hidden" name="mediaType" value="PHOTO" readOnly />
      {url
        ? <ProofPreview url={url} kind="PHOTO" onClear={() => setUrl("")} />
        : <MediaUpload folder="thu-hoach" kind="PHOTO" onUploaded={setUrl}
            label={isEgg ? "📸 Chụp giỏ trứng (bắt buộc)" : "📸 Chụp gà lúc cân (bắt buộc)"} />}

      <button className="btn btn-primary" type="submit" disabled={pending || !url}>
        {pending ? "Đang ghi…" : url ? "Ghi vào sổ thu hoạch" : "Cần ảnh trước đã"}
      </button>
    </form>
  );
}

/**
 * SỔ LỚN - ô ghi cân nặng tuần này, chỉ hiện với chuồng gà thịt.
 *
 * Đây là ô nhập tạo ra con số **duy nhất đổi mỗi tuần** trong đời một lứa gà thịt.
 * Chủ chuồng gà đẻ ngày nào cũng có quả trứng để nhìn; chủ chuồng gà thịt thì trước
 * bản này chỉ có một thanh tiến độ nhích một vạch.
 *
 * Cô chú gõ theo **gam** chứ không phải kg: gà con tuần đầu ~150g, bắt gõ "0.15" là
 * mời gõ nhầm dấu chấm. Ô cũng hỏi **cân mấy con** - "trung bình 1,8kg" của 3 con và
 * của 20 con là hai mức tin cậy khác hẳn nhau, và chủ chuồng có quyền biết.
 */
export function WeighInForm({ barnSlug, tuan }: { barnSlug: string; tuan: number }) {
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <form
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        start(async () => {
          try {
            const r = await logWeighIn(data);
            toast(r.message, r.ok ? "ok" : "warn");
            if (r.ok) { form.reset(); setUrl(""); }
          } catch {
            toast("Không gửi được. Thử lại giúp mình nhé.", "err");
          }
        });
      }}
    >
      <input type="hidden" name="barn" value={barnSlug} readOnly />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11.8px] font-semibold" style={{ color: "var(--ink-soft)" }}>
            Cân trung bình (gam)
          </label>
          <input name="avgGram" type="number" className={`${CLS} mt-1`} style={BORDER}
            inputMode="numeric" min={WEIGH_GAM_MIN} max={WEIGH_GAM_MAX} required
            placeholder="VD: 1800" />
        </div>
        <div>
          <label className="text-[11.8px] font-semibold" style={{ color: "var(--ink-soft)" }}>
            Cân mấy con?
          </label>
          <input name="sample" type="number" className={`${CLS} mt-1`} style={BORDER}
            inputMode="numeric" min={1} max={50} defaultValue={WEIGH_MAU_TOI_THIEU} />
        </div>
      </div>
      <p className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>
        Bắt <b>{WEIGH_MAU_TOI_THIEU}–5 con bất kỳ</b>, cân từng con rồi lấy số trung bình.
        Ghi theo <b>gam</b> nhé - 1,8kg thì gõ <b>1800</b>.
      </p>

      <textarea name="note" rows={2} className={CLS} style={BORDER} maxLength={300}
        placeholder="Ghi chú (tuỳ chọn) - VD: đàn ăn khoẻ, có một con nhỏ hơn hẳn." />

      <input type="hidden" name="url" value={url} readOnly />
      {url
        ? <ProofPreview url={url} kind="PHOTO" onClear={() => setUrl("")} />
        : <MediaUpload folder="thu-hoach" kind="PHOTO" onUploaded={setUrl}
            label="📸 Chụp con gà đang đứng trên cân (bắt buộc)" />}

      <button className="btn btn-primary" type="submit" disabled={pending || !url}>
        {pending ? "Đang ghi…" : url ? `Ghi cân nặng tuần ${tuan}` : "Cần ảnh cái cân trước đã"}
      </button>
    </form>
  );
}
