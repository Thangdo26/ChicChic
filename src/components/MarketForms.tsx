"use client";
// Chợ nông trại - các nút bấm. Mọi luật nằm ở `app/market-actions.ts`, đây chỉ ẩn/hiện
// cho đỡ bấm hụt và nói cho rõ tiền đi đâu.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  listLot, cancelListing, reserveListing, savePayoutAccount, traCuuChuTaiKhoan, requestPayout,
} from "@/app/market-actions";
import { BANKS, donSoTaiKhoan } from "@/lib/banks";
import { useToast } from "@/components/Toast";
import PayQR from "@/components/PayQR";
import { usePayWatch } from "@/components/usePayWatch";
import { fmtVnd } from "@/lib/pricing";
import { MARKET_FEE_PERCENT } from "@/lib/market";
import { requestMarketRefund } from "@/app/refund-actions";
import { MAX_REFUND_REASON } from "@/lib/refund";

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
        toast("Không gửi được - kiểm tra mạng rồi thử lại.", "err");
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
export function PayoutAccountForm({
  account, coTraTen = false, onSaved,
}: {
  account: PayoutAccountVM;
  /** Nông trại đã cấu hình khoá VietQR chưa - chưa thì KHÔNG bày nút tra tên. */
  coTraTen?: boolean;
  /** Gọi khi lưu xong. Ô nhập nhúng trong sổ thu hoạch dùng để mở lại nút đăng bán. */
  onSaved?: () => void;
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(!account);
  const [bank, setBank] = useState(account?.bankName ?? "");
  const [soTk, setSoTk] = useState(account?.accountNo ?? "");
  const [ten, setTen] = useState(account?.holderName ?? "");
  const [dangTra, setDangTra] = useState(false);
  const toast = useToast();

  // Tài khoản lưu từ TRƯỚC bản này mang tên ngân hàng người dùng tự gõ, có thể không
  // khớp danh sách. Giữ lại thành một mục riêng thay vì âm thầm bỏ - mất dòng đó là
  // người ta phải nhớ lại mình đã điền gì, mà đây là dòng tiền của họ.
  const laCu = !!account?.bankName && !BANKS.some((b) => b.ten === account.bankName);

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

  const traTen = () => {
    setDangTra(true);
    void (async () => {
      try {
        const r = await traCuuChuTaiKhoan(bank, soTk);
        if (r.ok) { setTen(r.ten); toast(`Tên chủ tài khoản: ${r.ten}`, "ok"); }
        else toast("Chưa tra được tên - gõ tay giúp mình nhé.", "warn");
      } catch {
        toast("Chưa tra được tên - gõ tay giúp mình nhé.", "warn");
      } finally { setDangTra(false); }
    })();
  };

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await savePayoutAccount({ bankName: bank, accountNo: soTk, holderName: ten });
          if (r.ok) { setOpen(false); onSaved?.(); }
          return r;
        });
      }}
    >
      {/* Ô CHỌN, không phải ô gõ. Đây là chỗ sai một chữ thì tiền của người bán không
          về được, mà tên ngân hàng thì mười người viết mười kiểu ("VCB", "Vietcom",
          "ngoại thương") - người trực nông trại phải đoán đúng lúc ngồi chuyển tiền. */}
      <select name="bankName" className={CLS} style={BORDER} required
        value={bank} onChange={(e) => setBank(e.target.value)}>
        <option value="">- Chọn ngân hàng -</option>
        {laCu && <option value={account!.bankName}>{account!.bankName} (đã lưu trước đây)</option>}
        {BANKS.map((b) => <option key={b.bin} value={b.ten}>{b.ten}</option>)}
      </select>

      <input name="accountNo" className={CLS} style={BORDER} required inputMode="numeric"
        value={soTk} onChange={(e) => setSoTk(donSoTaiKhoan(e.target.value))}
        placeholder="Số tài khoản" />

      <div className="flex gap-2">
        <input name="holderName" className={CLS} style={BORDER} required maxLength={60}
          value={ten} onChange={(e) => setTen(e.target.value)}
          placeholder="Tên chủ tài khoản (không dấu)" />
        {/* Chỉ hiện khi nông trại ĐÃ cấu hình khoá tra cứu. Một cái nút bấm vào không
            ra gì còn tệ hơn hẳn không có nút. */}
        {coTraTen && (
          <button type="button" className="btn btn-ghost btn-sm flex-none whitespace-nowrap"
            disabled={dangTra || !bank || soTk.length < 6} onClick={traTen}>
            {dangTra ? "Đang tra…" : "Tra tên"}
          </button>
        )}
      </div>

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Đang lưu…" : "Lưu tài khoản nhận tiền"}
      </button>
    </form>
  );
}

// ---------------- Đăng bán một lô ----------------

export function ListLotButton({
  lotId, priceVnd, netVnd, disabledReason, account, coTraTen = false,
}: {
  lotId: string;
  /** Giá niêm yết đã tính sẵn ở server - chỉ để HIỆN, server tính lại lúc đăng (§9.6). */
  priceVnd: number | null;
  netVnd: number | null;
  disabledReason?: string | null;
  /** Tài khoản nhận tiền hiện có. `null` = chưa điền ⟹ mở thẳng ô điền tại đây. */
  account?: PayoutAccountVM;
  coTraTen?: boolean;
}) {
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  /** Vừa điền xong tài khoản ngay tại chỗ - khỏi phải tải lại trang mới bán được. */
  const [vuaLuu, setVuaLuu] = useState(false);
  const [moTaiKhoan, setMoTaiKhoan] = useState(false);

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

  /**
   * CHƯA CÓ TÀI KHOẢN NHẬN TIỀN.
   *
   * Trước bản này người bán bấm "Bán lại trên chợ" → xem đủ ba con số → bấm "Đăng bán"
   * → và lúc đó mới nhận một dòng đỏ *"Điền tài khoản nhận tiền trước rồi mới đăng bán
   * được nhé"*, không kèm đường đi. Ô điền nằm ở `/cho/cua-toi`, một trang họ chưa từng
   * mở. Nói cho người ta biết họ thiếu gì mà không nói thiếu ở đâu là một ngõ cụt.
   *
   * Nay ô điền mở ra **ngay tại đây**, ngay dưới cái lô họ đang muốn bán - điền xong là
   * bán được luôn, không rời trang, không mất chỗ đang đứng.
   */
  const chuaCoTk = account === null && !vuaLuu;
  if (chuaCoTk) {
    return moTaiKhoan ? (
      <div className="soft mt-2">
        <div className="font-semibold text-[12.8px] mb-1">🏦 Tiền bán được chuyển về đâu?</div>
        <p className="text-[11.8px] mb-2" style={{ color: "var(--ink-soft)" }}>
          Điền một lần, dùng cho mọi lô sau này. Nông trại chuyển tiền về đây sau khi lô
          của bạn được giao tận tay người mua.
        </p>
        <PayoutAccountForm account={null} coTraTen={coTraTen} onSaved={() => setVuaLuu(true)} />
        <button className="btn btn-ghost btn-sm w-full mt-2" onClick={() => setMoTaiKhoan(false)}>Thôi</button>
      </div>
    ) : (
      <button className="btn btn-ghost btn-sm w-full mt-2" onClick={() => setMoTaiKhoan(true)}>
        🏪 Bán lại trên chợ · cần số tài khoản
      </button>
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
        <b> Không có cam kết chắc chắn bán được</b> - hết hạn giữ hộ thì lô về lại với bạn.
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

/**
 * Người mua báo hàng không đúng.
 *
 * Cố ý là một **ô mở ra bắt viết lý do**, không phải một nút bấm phát ăn ngay: ở đầu kia
 * là một người bán thật sẽ bị giữ lại tiền, và câu người mua viết chính là thứ người
 * trực đọc để quyết. Một nút "xin hoàn tiền" bấm cái xong sẽ được bấm cho vui.
 */
export function XinHoanTienButton({ listingId }: { listingId: string }) {
  const { pending, run } = useRun();
  const [mo, setMo] = useState(false);
  const [ly, setLy] = useState("");
  const du = ly.trim().length >= 10;

  if (!mo) {
    return (
      <button className="text-[12.2px] font-semibold mt-2" onClick={() => setMo(true)}
        style={{ color: "#B4472F", background: "none" }}>
        Hàng không đúng? Báo nông trại ›
      </button>
    );
  }

  return (
    <div className="rounded-[13px] p-3 mt-2" style={{ background: "var(--paper2)", border: "1px solid var(--line)" }}>
      <div className="font-semibold text-[13px]">Hàng không đúng ở chỗ nào?</div>
      <p className="text-[11.6px] mt-1" style={{ color: "var(--ink-soft)" }}>
        Người trực nông trại sẽ đọc, hỏi lại nông dân rồi trả lời bạn. Nếu đúng là lô có vấn đề,
        nông trại hoàn <b>trọn số tiền</b> bạn đã chuyển, kể cả phần phí.
      </p>
      <textarea
        className="inp mt-2" rows={3} value={ly} maxLength={MAX_REFUND_REASON} autoFocus disabled={pending}
        aria-label="Lý do xin hoàn tiền"
        placeholder="Ví dụ: nhận được 8 quả bị vỡ, đã chụp ảnh gửi cô Lan…"
        onChange={(e) => setLy(e.target.value)}
      />
      <button className="btn btn-primary btn-sm mt-2" disabled={!du || pending}
        onClick={() => run(() => requestMarketRefund(listingId, ly))}>
        {pending ? "Đang gửi…" : "Gửi cho nông trại"}
      </button>
      <button className="btn btn-ghost btn-sm mt-1.5" disabled={pending} onClick={() => { setMo(false); setLy(""); }}>
        Thôi
      </button>
    </div>
  );
}

/** Ô chuyển khoản cho đơn mình vừa đặt - dùng lại đúng ô QR của cọc chuồng và decor. */
export function MarketPayBox({ payCode, priceVnd }: { payCode: string; priceVnd: number }) {
  const toast = useToast();
  const router = useRouter();

  // ⭐ Ngóng tiền về. Trước bản này ô chợ cũng không có gì: webhook xác nhận xong thì lô
  // đã sang "đã bán" và nông dân đã nhận việc giao, nhưng người mua vẫn ngồi nhìn mã QR
  // như chưa trả tiền. Cùng lỗi với hoá đơn trang trí.
  usePayWatch(payCode, true, () => {
    toast("Đã nhận được tiền - lô này là của bạn, nông trại sẽ giao tận tay! 🎉", "ok");
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

// ---------------- Ví của người bán ----------------

/**
 * Nút "Rút tiền về tài khoản".
 *
 * Nó **không** chuyển tiền - §9.29: chi trả luôn làm tay kèm ảnh biên lai. Nó chỉ đóng
 * dấu "tôi đang chờ" lên các khoản đang treo, để người bán có tiếng nói và để hàng đợi
 * ở /admin biết ai cần trước. Nói thẳng điều đó ngay trên nút thay vì để người ta bấm
 * xong rồi ngồi đợi tiền về trong 5 giây.
 */
export function RutTienButton({ conRut }: { conRut: boolean }) {
  const { pending, run } = useRun();
  if (!conRut) {
    return (
      <div className="text-[12.4px] mt-2" style={{ color: "var(--paddy-deep)" }}>
        ⏳ Đã gửi yêu cầu - nông trại đang xếp lịch chuyển khoản.
      </div>
    );
  }
  return (
    <button className="btn btn-primary btn-sm w-full mt-2.5" disabled={pending}
      onClick={() => run(() => requestPayout())}>
      {pending ? "Đang gửi…" : "💸 Rút tiền về tài khoản"}
    </button>
  );
}
