"use client";
// Chợ nông trại — các nút bấm. Mọi luật nằm ở `app/market-actions.ts`, đây chỉ ẩn/hiện
// cho đỡ bấm hụt và nói cho rõ tiền đi đâu.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { listLot, cancelListing, reserveListing, savePayoutAccount } from "@/app/market-actions";
import { useToast } from "@/components/Toast";
import PayQR from "@/components/PayQR";
import { usePayWatch } from "@/components/usePayWatch";
import { fmtVnd } from "@/lib/pricing";
import { MARKET_FEE_PERCENT } from "@/lib/market";

const CLS = "rounded-[11px] px-3 py-2.5 text-[13.7px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) router.refresh();
      } catch {
        toast("Không gửi được — kiểm tra mạng rồi thử lại.", "err");
      }
    });
  return { pending, run };
}

// ---------------- Tài khoản nhận tiền ----------------

export type PayoutAccountVM = { bankName: string; accountNo: string; holderName: string } | null;

/**
 * Bắt buộc điền trước khi đăng bán. Nói thẳng lý do: thiếu nó thì tiền người mua về mà
 * nông trại không biết chuyển cho ai.
 */
export function PayoutAccountForm({ account }: { account: PayoutAccountVM }) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(!account);

  if (!open && account) {
    return (
      <div className="flex items-center gap-2.5">
        <span className="flex-none">🏦</span>
        <div className="flex-1 min-w-0 text-[12.8px]">
          <b>{account.bankName}</b> · {account.accountNo}
          <div style={{ color: "var(--ink-soft)" }}>{account.holderName}</div>
        </div>
        <button className="btn btn-ghost btn-sm flex-none" onClick={() => setOpen(true)}>Sửa</button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        run(async () => {
          const r = await savePayoutAccount({
            bankName: String(f.get("bankName") ?? ""),
            accountNo: String(f.get("accountNo") ?? ""),
            holderName: String(f.get("holderName") ?? ""),
          });
          if (r.ok) setOpen(false);
          return r;
        });
      }}
    >
      <input name="bankName" className={CLS} style={BORDER} required maxLength={60}
        defaultValue={account?.bankName ?? ""} placeholder="Ngân hàng — VD: MB Bank" />
      <input name="accountNo" className={CLS} style={BORDER} required inputMode="numeric"
        defaultValue={account?.accountNo ?? ""} placeholder="Số tài khoản" />
      <input name="holderName" className={CLS} style={BORDER} required maxLength={60}
        defaultValue={account?.holderName ?? ""} placeholder="Tên chủ tài khoản (không dấu)" />
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Đang lưu…" : "Lưu tài khoản nhận tiền"}
      </button>
    </form>
  );
}

// ---------------- Đăng bán một lô ----------------

export function ListLotButton({
  lotId, priceVnd, netVnd, disabledReason,
}: {
  lotId: string;
  /** Giá niêm yết đã tính sẵn ở server — chỉ để HIỆN, server tính lại lúc đăng (§9.6). */
  priceVnd: number | null;
  netVnd: number | null;
  disabledReason?: string | null;
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);

  if (disabledReason) {
    return <div className="text-[11.8px] mt-1.5" style={{ color: "var(--ink-soft)" }}>{disabledReason}</div>;
  }
  if (priceVnd == null || netVnd == null) {
    return (
      <div className="text-[11.8px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
        Nông trại chưa niêm yết giá cho loại này.
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm w-full mt-2" onClick={() => setOpen(true)} disabled={pending}>
        🏪 Bán lại trên chợ
      </button>
    );
  }

  return (
    <div className="soft mt-2 text-[12.6px]">
      {/* Ba con số hiện ĐỦ trước khi bấm. Chợ nào giấu phí là chợ mất niềm tin. */}
      <div className="flex justify-between"><span>Giá niêm yết</span><b>{fmtVnd(priceVnd)}</b></div>
      <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
        <span>Phí nông trại ({MARKET_FEE_PERCENT}%)</span><span>−{fmtVnd(priceVnd - netVnd)}</span>
      </div>
      <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: "1px dashed var(--line)" }}>
        <span>Bạn nhận</span><b style={{ color: "var(--paddy-deep)" }}>{fmtVnd(netVnd)}</b>
      </div>
      <p className="text-[11.4px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
        Phí gồm bảo quản, đóng gói, giao tận tay và nông trại đứng ra bảo đảm.
        <b> Không có cam kết chắc chắn bán được</b> — hết hạn giữ hộ thì lô về lại với bạn.
      </p>
      <div className="flex gap-2 mt-2">
        <button className="btn btn-primary btn-sm flex-1" disabled={pending}
          onClick={() => run(() => listLot(lotId))}>
          {pending ? "Đang đăng…" : "Đăng bán"}
        </button>
        <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
          onClick={() => setOpen(false)}>Thôi</button>
      </div>
    </div>
  );
}

// ---------------- Mua / huỷ ----------------

export function BuyButton({ listingId, priceVnd }: { listingId: string; priceVnd: number }) {
  const { pending, run } = useRun();
  return (
    <button className="btn btn-primary btn-sm w-full mt-2" disabled={pending}
      onClick={() => run(() => reserveListing(listingId))}>
      {pending ? "Đang giữ chỗ…" : `Mua · ${fmtVnd(priceVnd)}`}
    </button>
  );
}

export function CancelListingButton({ listingId }: { listingId: string }) {
  const { pending, run } = useRun();
  return (
    <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
      onClick={() => run(() => cancelListing(listingId))}
      style={{ color: "#B4472F", borderColor: "#F0CFC6" }}>
      Rút tin
    </button>
  );
}

/** Ô chuyển khoản cho đơn mình vừa đặt — dùng lại đúng ô QR của cọc chuồng và decor. */
export function MarketPayBox({ payCode, priceVnd }: { payCode: string; priceVnd: number }) {
  const toast = useToast();
  const router = useRouter();

  // ⭐ Ngóng tiền về. Trước bản này ô chợ cũng không có gì: webhook xác nhận xong thì lô
  // đã sang "đã bán" và nông dân đã nhận việc giao, nhưng người mua vẫn ngồi nhìn mã QR
  // như chưa trả tiền. Cùng lỗi với hoá đơn trang trí.
  usePayWatch(payCode, true, () => {
    toast("Đã nhận được tiền — lô này là của bạn, nông trại sẽ giao tận tay! 🎉", "ok");
    router.refresh();
  });

  return (
    <div className="rounded-[13px] p-3 mt-2" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE" }}>
      <div className="font-semibold text-[13.2px]" style={{ color: "var(--yolk-deep)" }}>
        Chuyển {fmtVnd(priceVnd)} để nhận lô này
      </div>
      <PayQR amountVnd={priceVnd} code={payCode} label="Quét mã để trả tiền lô này" />
      <p className="text-[11.6px] mt-2" style={{ color: "var(--ink-soft)" }}>
        Nội dung chuyển khoản: <b className="tabular-nums">{payCode}</b>. Tiền về là nông
        trại giao tận tay bạn và gửi ảnh lúc trao.
      </p>
    </div>
  );
}
