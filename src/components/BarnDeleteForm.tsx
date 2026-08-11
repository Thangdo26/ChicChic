"use client";
// XOÁ HẲN MỘT CHUỒNG - nút phá huỷ duy nhất trong cả sản phẩm (§11.42).
//
// Mọi nút khác ở `/admin` đều đổi trạng thái và sửa lại được. Cái này thì không: bấm
// xong là ảnh, video, việc đã làm, sổ thu hoạch và hộp thư của chuồng đó không còn tra
// lại được nữa. Vì thế giao diện ở đây cố ý **chậm và xấu**:
//
//  · nút thu nhỏ, màu chữ chứ không phải khối đỏ - để không ai bấm nhầm lúc lướt danh sách;
//  · mở ra thì liệt kê ĐÍCH DANH số thứ sắp mất, không nói chung chung "dữ liệu liên quan";
//  · phải gõ lại slug. Server kiểm lại chuỗi đó (§9.6) nên không lách được bằng devtools.
//
// Luật tiền nằm trong `admin-actions.deleteBarn`, không nằm ở đây: khoản hoàn cho chủ
// chuồng, đơn cọc và sổ nợ đều do server quyết. Chỗ này chỉ nói trước cho người trực biết.
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

      {/* Nói đích danh cái sắp mất. "Xoá dữ liệu liên quan" là câu ai cũng bấm qua. */}
      <ul className="mt-1 mb-1.5 pl-4 leading-relaxed" style={{ color: "var(--ink-soft)", listStyle: "disc" }}>
        <li><b>{barn.media}</b> ảnh/video, <b>{barn.lots}</b> lô thu hoạch, <b>{barn.messages}</b> tin nhắn - mất hẳn.</li>
        <li><b>{barn.invoices}</b> hoá đơn tiền nuôi cũng mất; đơn cọc thì giữ lại và chuyển sang huỷ.</li>
        {barn.ownerName
          ? <li style={{ color: "#8A3A26" }}>
              Chuồng <b>đang có chủ</b> ({barn.ownerName}). Họ sẽ nhận thông báo, và phần
              tiền nuôi những ngày chưa nuôi được ghi nợ vào khối ↩️ Hoàn tiền.
            </li>
          : <li>Chuồng chưa có chủ.</li>}
        {barn.workerName && <li>{barn.workerName} sẽ không còn thấy chuồng này.</li>}
      </ul>

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
