"use client";
// Bàn hoàn tiền của người trực nông trại. Mọi luật nằm ở `app/refund-actions.ts`;
// file này chỉ sắp xếp cho dễ đọc và bắt gõ đủ thứ cần gõ.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideRefund, markRefundPaid } from "@/app/refund-actions";
import { useToast } from "@/components/Toast";
import MediaUpload from "@/components/MediaUpload";
import { fmtVnd } from "@/lib/pricing";
import { MAX_REFUND_REASON, REFUND_KIND_VI, type RefundKind } from "@/lib/refund";

const CLS = "rounded-[11px] px-3 py-2.5 text-[13.7px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

export type RefundRow = {
  id: string;
  kind: RefundKind;
  status: "REQUESTED" | "APPROVED";
  amountVnd: number;
  who: string;
  barnLabel: string | null;
  reason: string | null;
  createdAt: string;
  /** Tài khoản nhận tiền, hoặc null nếu người ta chưa điền. */
  bank: string | null;
  /**
   * Chỉ có ở khoản `MARKET`: người bán đã được chi tiền chưa. Người trực **phải** thấy
   * cái này trước khi bấm - hoàn cho người mua sau khi đã chi cho người bán nghĩa là
   * nông trại chịu trọn khoản đó, và đó là một quyết định chứ không phải một cái nút.
   */
  payoutState: "none" | "PENDING" | "PAID" | "FAILED" | null;
};

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return {
    pending,
    run: (fn: () => Promise<{ ok: boolean; message: string }>) =>
      start(async () => {
        try {
          const r = await fn();
          toast(r.message, r.ok ? "ok" : "warn");
          if (r.ok) router.refresh();
        } catch {
          toast("Không gửi được - thử lại nhé.", "err");
        }
      }),
  };
}

export default function RefundQueue({ rows }: { rows: RefundRow[] }) {
  const { pending, run } = useRun();
  /** Ô đang mở: `${id}:duyet` hoặc `${id}:chuyen`. Một lúc chỉ một ô. */
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [tien, setTien] = useState("");
  const [url, setUrl] = useState("");

  const dong = () => { setOpen(null); setNote(""); setTien(""); setUrl(""); };

  return (
    <div className="card mt-3" id="hoan-tien">
      <div className="font-bold text-[14px]">↩️ Hoàn tiền ({rows.length})</div>
      <p className="text-[12.2px] mt-0.5 mb-2" style={{ color: "var(--ink-soft)" }}>
        Sinh ra khi ai đó <b>hoàn trả chuồng</b> (phần tiền nuôi của những ngày chưa nuôi)
        hoặc <b>báo hàng chợ không đúng</b>. Số app đề xuất chỉ là đề xuất - số thật đã
        chuyển thì gõ vào lúc đóng sổ.
      </p>

      {rows.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--ink-soft)" }}>Không có khoản nào đang chờ.</div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13.4px] font-semibold">
                  {r.status === "APPROVED" && <span title="Đã duyệt, chờ chuyển khoản">✅ </span>}
                  {r.who} · {REFUND_KIND_VI[r.kind]}
                </div>
                <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                  {r.barnLabel ? `${r.barnLabel} · ` : ""}
                  {new Date(r.createdAt).toLocaleDateString("vi-VN")}
                  {" · "}
                  {r.bank ?? "⚠️ chưa có tài khoản nhận tiền"}
                </div>
              </div>
              <b className="flex-none text-[14px]">{fmtVnd(r.amountVnd)}</b>
            </div>

            {r.reason && (
              <div className="soft mt-1.5 text-[12.3px]" style={{ color: "var(--ink-soft)" }}>{r.reason}</div>
            )}

            {/* Cảnh báo về người bán - chỉ với đơn chợ, và chỉ khi thật sự có rủi ro. */}
            {r.kind === "MARKET" && (r.payoutState === "PAID" || r.payoutState === "PENDING") && (
              <div className="text-[12.2px] mt-1.5 font-semibold" style={{ color: "#B4472F" }}>
                {r.payoutState === "PAID"
                  ? "⚠️ Người bán ĐÃ được chuyển tiền cho lô này - hoàn cho người mua thì nông trại chịu khoản này."
                  : "⚠️ Lô đã giao, người bán đang chờ được chi. Xử lý khoản chi đó trước khi hoàn."}
              </div>
            )}
            {r.kind === "CARE" && (
              <div className="text-[12.2px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
                §9.32 - hoàn tiền nuôi dưỡng <b>không</b> kéo theo hậu quả nào lên đàn gà. Đồng ý
                hoàn thì đàn vẫn ở nông trại và vẫn được chăm.
              </div>
            )}

            {open === `${r.id}:duyet` ? (
              <div className="mt-2">
                <textarea className={CLS} style={BORDER} rows={2} value={note} maxLength={MAX_REFUND_REASON}
                  autoFocus disabled={pending} aria-label="Ghi chú / lý do"
                  placeholder="Từ chối thì bắt buộc ghi lý do - người ta sẽ đọc câu này."
                  onChange={(e) => setNote(e.target.value)} />
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary btn-sm flex-1" disabled={pending}
                    onClick={() => run(async () => {
                      const x = await decideRefund(r.id, true, note);
                      if (x.ok) dong();
                      return x;
                    })}>Duyệt</button>
                  <button className="btn btn-sm flex-1" disabled={pending || note.trim().length < 5}
                    style={{ background: "#F7E7E2", color: "#B4472F" }}
                    onClick={() => run(async () => {
                      const x = await decideRefund(r.id, false, note);
                      if (x.ok) dong();
                      return x;
                    })}>Từ chối</button>
                  <button className="btn btn-ghost btn-sm flex-none" disabled={pending} onClick={dong}>Thôi</button>
                </div>
              </div>
            ) : open === `${r.id}:chuyen` ? (
              <div className="mt-2">
                <input className={CLS} style={BORDER} inputMode="numeric" value={tien} autoFocus disabled={pending}
                  aria-label="Số tiền đã chuyển"
                  placeholder={`Số đã chuyển (đề xuất ${r.amountVnd})`}
                  onChange={(e) => setTien(e.target.value.replace(/[^0-9]/g, ""))} />
                <div className="mt-2">
                  {url
                    ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[12.4px] flex-1 truncate">Đã có ảnh biên lai</span>
                        <button className="btn btn-ghost btn-sm flex-none" onClick={() => setUrl("")}>Đổi</button>
                      </div>
                    )
                    : <MediaUpload folder="quan-tri" kind="PHOTO" onUploaded={setUrl} label="📸 Ảnh biên lai chuyển khoản" />}
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary btn-sm flex-1" disabled={pending || !tien}
                    onClick={() => run(async () => {
                      const x = await markRefundPaid(r.id, Number(tien), note, url);
                      if (x.ok) dong();
                      return x;
                    })}>{pending ? "Đang ghi…" : "Đã chuyển xong"}</button>
                  <button className="btn btn-ghost btn-sm flex-none" disabled={pending} onClick={dong}>Thôi</button>
                </div>
              </div>
            ) : r.status === "REQUESTED" ? (
              <button className="btn btn-yolk btn-sm w-full mt-1.5"
                onClick={() => { dong(); setOpen(`${r.id}:duyet`); }}>Xem và quyết</button>
            ) : (
              <button className="btn btn-yolk btn-sm w-full mt-1.5"
                onClick={() => { dong(); setTien(String(r.amountVnd)); setOpen(`${r.id}:chuyen`); }}>
                Ghi nhận đã chuyển
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
