"use client";
// Chỉ dọn chuồng chưa từng sử dụng; server khóa và kiểm tra toàn bộ lịch sử.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBarn } from "@/app/admin-actions";
import { useToast } from "@/components/Toast";

export type BarnDeleteVM = {
  slug: string;
  label: string;
  /** Tên/email chủ chuồng, null nếu chuồng chưa có chủ. */
  ownerName: string | null;
  workerName: string | null;
  hasFlock?: boolean;
  media: number;
  lots: number;
  invoices: number;
  messages: number;
};

export default function BarnDeleteForm({ barn }: { barn: BarnDeleteVM }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const khop = typed.trim() === barn.slug;

  const submit = () =>
    start(async () => {
      try {
        const r = await deleteBarn(barn.slug, typed);
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setOpen(false); setTyped(""); router.refresh(); }
      } catch {
        toast("Không xoá được lúc này - kiểm tra mạng rồi thử lại.", "err");
      }
    });

  if (barn.hasFlock || barn.ownerName || barn.media || barn.lots || barn.invoices || barn.messages) return <span className="text-xs" style={{ color: "var(--ink-soft)" }}>Giữ lịch sử · dùng bàn giao/hoàn trả</span>;

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm flex-none" style={{ color: "#B4472F" }}
        onClick={() => setOpen(true)}>Xoá</button>
    );
  }

  return (
    <div className="w-full rounded-[11px] p-2.5 mt-1.5 text-[12.4px]"
      style={{ background: "#FBF1EE", border: "1px solid #E0B6AA" }}>
      <div className="font-bold" style={{ color: "#8A3A26" }}>Xoá hẳn {barn.label}?</div>

      <p className="my-2">Chỉ chuồng trống, chưa có đàn, đơn tiền hay nhật ký mới được dọn. Server sẽ kiểm tra lại trước khi thực hiện.</p>

      <div className="mb-1" style={{ color: "var(--ink-soft)" }}>
        Gõ <b className="select-all">{barn.slug}</b> để xác nhận:
      </div>
      <input
        value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus disabled={pending}
        placeholder={barn.slug} aria-label={`Gõ lại slug để xoá ${barn.label}`}
        className="w-full rounded-[10px] px-2.5 py-2 text-[13px]"
        style={{ border: `1.5px solid ${typed && !khop ? "#E0B6AA" : khop ? "#B4472F" : "var(--line)"}`, background: "#fff" }}
      />

      <div className="flex gap-1.5 mt-2">
        <button className="btn btn-sm flex-1" disabled={!khop || pending}
          style={khop ? { background: "#B4472F", color: "#fff" } : { background: "var(--paper2)", color: "var(--ink-soft)" }}
          onClick={submit}>
          {pending ? "Đang xoá…" : "Xoá hẳn"}
        </button>
        <button className="btn btn-ghost btn-sm flex-1" disabled={pending}
          onClick={() => { setOpen(false); setTyped(""); }}>Thôi</button>
      </div>
    </div>
  );
}
