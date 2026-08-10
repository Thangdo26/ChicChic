"use client";
// Quản trị chợ: niêm yết giá và chi trả cho người bán.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMarketPrice, markPayoutPaid } from "@/app/admin-actions";
import { useToast } from "@/components/Toast";
import MediaUpload from "@/components/MediaUpload";
import { fmtVnd } from "@/lib/pricing";

const CLS = "rounded-[11px] px-3 py-2.5 text-[13.7px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

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
          toast("Không gửi được — thử lại nhé.", "err");
        }
      }),
  };
}

export type LivePrice = { type: string; breedSlug: string | null; unitVnd: number };

export function MarketPriceForm({
  live, breeds,
}: {
  live: LivePrice[];
  breeds: { slug: string; name: string }[];
}) {
  const { pending, run } = useRun();
  const [type, setType] = useState<"EGG" | "MEAT">("EGG");

  return (
    <div className="card mt-3">
      <div className="font-bold text-[14px]">💰 Giá niêm yết trên chợ</div>
      <p className="text-[12.2px] mt-0.5 mb-2" style={{ color: "var(--ink-soft)" }}>
        Người bán <b>không tự đặt giá</b> — giá lấy từ đây. Đổi giá là <b>thêm dòng mới</b>,
        tin đăng cũ giữ nguyên giá lúc đăng.
      </p>

      {live.length === 0 ? (
        <div className="soft text-[12.6px]" style={{ color: "#8A3A26" }}>
          ⚠️ Chưa niêm yết giá nào — <b>chợ không đăng bán được</b> cho tới khi có giá.
        </div>
      ) : (
        <div className="mb-2">
          {live.map((p) => (
            <div key={`${p.type}-${p.breedSlug ?? "all"}`} className="kv">
              <span style={{ color: "var(--ink-soft)" }}>
                {p.type === "EGG" ? "🥚 Trứng" : "🍗 Gà thịt"}
                {p.breedSlug ? ` · ${breeds.find((b) => b.slug === p.breedSlug)?.name ?? p.breedSlug}` : " · mọi giống"}
              </span>
              <span className="font-semibold">
                {fmtVnd(p.unitVnd)}/{p.type === "EGG" ? "quả" : "kg"}
              </span>
            </div>
          ))}
        </div>
      )}

      <form
        className="grid gap-2 mt-1"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          run(async () => {
            const r = await setMarketPrice({
              type: String(f.get("type")) === "MEAT" ? "MEAT" : "EGG",
              breedSlug: String(f.get("breedSlug") ?? ""),
              unitVnd: Number(f.get("unitVnd")),
              note: String(f.get("note") ?? ""),
            });
            if (r.ok) form.reset();
            return r;
          });
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <select name="type" className={CLS} style={BORDER} value={type}
            onChange={(e) => setType(e.target.value as "EGG" | "MEAT")}>
            <option value="EGG">🥚 Trứng (đ/quả)</option>
            <option value="MEAT">🍗 Gà thịt (đ/kg)</option>
          </select>
          <input name="unitVnd" type="number" min={1} className={CLS} style={BORDER} required
            placeholder={type === "EGG" ? "đồng / quả" : "đồng / kg"} />
        </div>
        {/* Trứng cùng giá mọi giống nên khoá ô giống lại — hiện ra chỉ để người trực
            phân vân rồi chọn nhầm. */}
        <select name="breedSlug" className={CLS} style={BORDER} disabled={type === "EGG"}>
          <option value="">Áp cho mọi giống</option>
          {breeds.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
        </select>
        <input name="note" className={CLS} style={BORDER} maxLength={200}
          placeholder="Ghi chú (tuỳ chọn) — VD: giá tăng theo mùa" />
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Đang lưu…" : "Niêm yết giá mới"}
        </button>
      </form>

      <p className="text-[11.4px] mt-2" style={{ color: "#8A5A1A" }}>
        ⚠️ Đổi giá ở đây mà quên <b>BASE_PRICES</b> (giá nhận nuôi) là mở lại lỗ chênh
        lệch: nếu bán lại lời hơn nuôi thì sản phẩm thành kênh đầu tư.
      </p>
    </div>
  );
}

export type PayoutRow = {
  id: string;
  amountVnd: number;
  sellerName: string | null;
  bank: string;
  lotLabel: string;
  createdAt: string;
  /** Người bán đã bấm "rút tiền" lúc nào. `null` = họ chưa lên tiếng. */
  requestedAt: string | null;
};

export function PayoutQueue({ rows }: { rows: PayoutRow[] }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  return (
    <div className="card mt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-[14px]">💸 Chờ chuyển tiền cho người bán ({rows.length})</div>
      </div>
      <p className="text-[12.2px] mt-0.5 mb-2" style={{ color: "var(--ink-soft)" }}>
        Chỉ sinh ra khi lô <b>đã giao và có ảnh trao tay</b>. Chuyển khoản xong thì dán
        ảnh biên lai vào đây — không có biên lai thì khoản chi chỉ là lời nói.
      </p>

      {rows.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--ink-soft)" }}>Không có khoản nào đang chờ.</div>
      ) : (
        rows.map((p) => (
          <div key={p.id} className="py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-[13.4px] font-semibold">
                  {/* Người đã bấm rút được đánh dấu: họ đang ngồi đợi và BIẾT mình đợi.
                      Không có dấu này thì người trực phải đoán ai cần trước. */}
                  {p.requestedAt && <span title="Người bán đã bấm rút tiền">🙋 </span>}
                  {p.sellerName ?? "Người bán"} · {p.lotLabel}
                </div>
                <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                  {p.bank}
                  {p.requestedAt && ` · đã xin rút ${new Date(p.requestedAt).toLocaleDateString("vi-VN")}`}
                </div>
              </div>
              <b className="flex-none text-[14px]">{fmtVnd(p.amountVnd)}</b>
            </div>

            {open === p.id ? (
              <div className="mt-2">
                {url
                  ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[12.4px] flex-1 truncate">Đã có ảnh biên lai</span>
                      <button className="btn btn-ghost btn-sm flex-none" onClick={() => setUrl("")}>Đổi</button>
                    </div>
                  )
                  : <MediaUpload folder="quan-tri" kind="PHOTO" onUploaded={setUrl} label="📸 Ảnh biên lai chuyển khoản" />}
                <div className="flex gap-2 mt-2">
                  <button className="btn btn-primary btn-sm flex-1" disabled={pending || !url}
                    onClick={() => run(async () => {
                      const r = await markPayoutPaid(p.id, url);
                      if (r.ok) { setOpen(null); setUrl(""); }
                      return r;
                    })}>
                    {pending ? "Đang ghi…" : url ? "Đã chuyển xong" : "Cần ảnh biên lai"}
                  </button>
                  <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
                    onClick={() => { setOpen(null); setUrl(""); }}>Thôi</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-yolk btn-sm w-full mt-1.5" onClick={() => setOpen(p.id)}>
                Ghi nhận đã chuyển
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
