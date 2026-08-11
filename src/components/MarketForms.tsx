"use client";
// Chợ nông trại - các nút bấm. Mọi luật nằm ở `app/market-actions.ts`, đây chỉ ẩn/hiện
// cho đỡ bấm hụt và nói cho rõ tiền đi đâu.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  listLot, cancelListing, themVaoGio, boKhoiGio, chotGio, baoDaChuyenKhoan, huyDon,
  savePayoutAccount, traCuuChuTaiKhoan, requestPayout,
} from "@/app/market-actions";
import { BANKS, donSoTaiKhoan } from "@/lib/banks";
import { useToast } from "@/components/Toast";
import PayQR from "@/components/PayQR";
import { usePayWatch } from "@/components/usePayWatch";
import { fmtVnd } from "@/lib/pricing";
import { MARKET_FEE_PERCENT, type TrangThaiRao } from "@/lib/market";
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
        // Bị hàng rào tần suất chặn thì nói đúng là bị chặn (§11.50). Gộp vào câu "chưa
        // tra được" là đổ lỗi cho ngân hàng về một việc do mình chặn - người dùng sẽ bấm
        // lại thêm chục lần nữa vì tưởng là trục trặc đường truyền.
        else if (r.ly === "qua-nhieu") toast("Bạn tra hơi nhiều lần rồi - nghỉ một lát nhé. Cứ gõ tay tên chủ tài khoản, không sao cả.", "warn");
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

// ---------------- Giỏ hàng ----------------

/**
 * Bỏ một lô vào giỏ (§11.45).
 *
 * Chữ trên nút cố ý là **"Bỏ vào giỏ"** chứ không phải "Mua": bấm xong chưa mất đồng nào,
 * và hứa "Mua" rồi đưa người ta sang một màn chốt nữa là nói sai một nhịp. Nhưng lô **bị
 * giữ chỗ thật** ngay lúc bấm, nên dòng chữ dưới nút phải nói ra điều đó - người bán mất
 * một lô khỏi chợ vì hành động này.
 */
export function BuyButton({
  listingId, priceVnd, trang, conLai, vuongMac,
}: {
  listingId: string; priceVnd: number;
  /** Lô này dưới mắt người đang xem - tính ở server bằng `market.trangThaiRao` (§9.34). */
  trang: TrangThaiRao;
  /** "còn 2 giờ 14 phút" - chỉ có nghĩa khi đang bị giữ chỗ. */
  conLai: string;
  /**
   * Vì sao người này chưa đặt hàng được (thiếu địa chỉ / chưa chọn vùng / vùng đã tắt).
   * `null` = không vướng gì.
   *
   * Đây chỉ là **mỹ quan** - luật nằm ở `themVaoGio` (§9.6). Nhưng cái mỹ quan này là
   * thứ đáng làm: bản trước cho bấm thoải mái rồi mới in một dòng cảnh báo ở thẻ giỏ,
   * nên người ta rút lô khỏi chợ xong mới biết mình không mua được.
   */
  vuongMac?: string | null;
}) {
  const { pending, run } = useRun();

  // Lô ĐANG trong giỏ thì luôn bỏ ra được, kể cả khi địa chỉ vừa hỏng - khoá đường lùi
  // là nhốt lô của người bán lại trong một cái giỏ không ai chốt được.
  if (trang === "trong-gio") {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <div className="flex-1 min-w-0 text-[12.4px] font-semibold" style={{ color: "var(--paddy-deep)" }}>
          ✓ Đang trong giỏ của bạn
          <span className="font-normal" style={{ color: "var(--ink-soft)" }}> · {conLai}</span>
        </div>
        <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
          onClick={() => run(() => boKhoiGio(listingId))}>
          {pending ? "Đang bỏ…" : "Bỏ ra"}
        </button>
      </div>
    );
  }

  // Chính tôi đã chốt đơn này rồi - việc còn lại là đi chuyển khoản, không phải bấm mua
  // lại. KHÔNG cho "Bỏ ra": mã chuyển khoản đã sinh và mang số tiền của cả đơn.
  if (trang === "cho-toi-tra") {
    return (
      <Link href="/cho/gio" className="flex items-center gap-1.5 mt-2 no-underline">
        <div className="flex-1 min-w-0 text-[12.4px] font-semibold" style={{ color: "var(--yolk-deep)" }}>
          ⏳ Bạn đã chốt đơn này · {conLai}
        </div>
        <span className="flex-none text-[12.4px] font-semibold" style={{ color: "var(--paddy)" }}>
          Chuyển khoản ›
        </span>
      </Link>
    );
  }

  /**
   * NGƯỜI KHÁC ĐANG GIỮ CHỖ.
   *
   * ⚠️ Trước Đợt 15 lô này **biến mất hẳn** khỏi chợ: câu truy vấn chỉ lấy `LISTED`.
   * Hai người cùng thiệt vì chuyện đó - người bán thấy lô mình không còn trên chợ và
   * không có chỗ nào giải thích vì sao, còn người mua quay lại tưởng hàng đã bán hết
   * rồi đi mất. Nay nó đứng nguyên chỗ cũ, có nhãn, và **có đồng hồ**: hết giờ là mua
   * được ngay, không chờ việc nền nào cả.
   */
  if (trang === "nguoi-khac-giu") {
    return (
      <div className="rounded-[11px] px-3 py-2 mt-2 text-[12.4px] font-semibold"
        style={{ background: "var(--paper2)", color: "var(--ink-soft)" }}>
        🔒 Có người đang giữ chỗ · {conLai}
        <div className="font-normal text-[11.6px] mt-0.5">
          Chưa chuyển khoản đúng hạn thì lô quay lại chợ - ghé lại sau nhé.
        </div>
      </div>
    );
  }

  // Chưa đặt được thì nói ra NGAY TRÊN NÚT, kèm đường đi tới chỗ sửa. Một nút bấm được
  // rồi báo lỗi là bắt người ta trả tiền bằng một lần bấm hụt để biết một thứ đáng lẽ
  // hiện sẵn - và trước Đợt 14 thì ô địa chỉ còn nằm trong sổ thu hoạch của một chuồng,
  // tức người mua không có chuồng thì đọc xong câu cảnh báo cũng không có chỗ nào để đi.
  if (vuongMac) {
    return (
      <div className="soft mt-2">
        <div className="font-semibold text-[12.4px]" style={{ color: "var(--yolk-deep)" }}>⚠️ {vuongMac}</div>
        <Link href="/cho/gio" className="btn btn-ghost btn-sm w-full mt-1.5 no-underline">
          🏠 Điền địa chỉ nhận hàng
        </Link>
      </div>
    );
  }

  return (
    <button className="btn btn-primary btn-sm w-full mt-2" disabled={pending}
      onClick={() => run(() => themVaoGio(listingId))}>
      {pending ? "Đang giữ chỗ…" : `Bỏ vào giỏ · ${fmtVnd(priceVnd)}`}
    </button>
  );
}

/**
 * Thẻ giỏ hàng - liệt kê lô đang giữ, tiền hàng, phí giao, tổng, rồi một nút chốt.
 *
 * Ba con số hiện đủ trước khi bấm, không giấu phí tới bước cuối. Đây là chỗ người ta
 * quyết định có tiêu tiền hay không, và một khoản phí xuất hiện sau khi đã đồng ý là
 * cách chắc chắn nhất để mất niềm tin ở một cái chợ.
 *
 * Từ Đợt 14 thẻ này sống ở **`/cho/gio`**, ngay dưới ô địa chỉ - `/cho` chỉ còn một dòng
 * tóm tắt bấm sang. Hai nút "Chốt đơn" ở hai trang là hai chỗ phải sửa cho một luật.
 */
export function GioHang({
  lo, goodsVnd, shipVnd, totalVnd, zoneName, vuongMac, conLai,
}: {
  lo: { id: string; tomTat: string; barnLabel: string; priceVnd: number }[];
  goodsVnd: number; shipVnd: number; totalVnd: number;
  zoneName: string | null;
  /** Câu chặn nếu chưa đặt được (thiếu địa chỉ / chưa chọn vùng / vùng đã tắt). */
  vuongMac: string | null;
  /** "còn 2 giờ 14 phút" của lô SẮP HẾT HẠN NHẤT trong giỏ. */
  conLai: string | null;
}) {
  const { pending, run } = useRun();
  if (lo.length === 0) return null;

  return (
    <div className="card mt-3" style={{ borderColor: "var(--paddy)" }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <div className="font-bold text-[14px]">🧺 Giỏ của bạn ({lo.length} lô)</div>
        {/* Đồng hồ đứng ngay cạnh tiêu đề, không giấu dưới đáy: bỏ vào giỏ là RÚT LÔ
            KHỎI CHỢ THẬT, và người ta có quyền biết mình đang giữ của người khác bao
            lâu nữa. Đây cũng là câu duy nhất giải thích vì sao giỏ tự rỗng đi. */}
        {conLai && (
          <span className="text-[11.8px] font-semibold ml-auto" style={{ color: "var(--yolk-deep)" }}>
            ⏳ giữ chỗ {conLai}
          </span>
        )}
      </div>

      {lo.map((l) => (
        <div key={l.id} className="flex items-center gap-2 py-1.5 text-[12.8px]"
          style={{ borderTop: "1px solid var(--line-soft)" }}>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{l.tomTat}</div>
            <div className="text-[11.4px] truncate" style={{ color: "var(--ink-soft)" }}>{l.barnLabel}</div>
          </div>
          <span className="flex-none">{fmtVnd(l.priceVnd)}</span>
          <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
            onClick={() => run(() => boKhoiGio(l.id))} aria-label={`Bỏ ${l.tomTat} khỏi giỏ`}>Bỏ</button>
        </div>
      ))}

      <div className="soft mt-2 text-[12.6px]">
        <div className="flex justify-between"><span>Tiền hàng</span><span>{fmtVnd(goodsVnd)}</span></div>
        <div className="flex justify-between" style={{ color: shipVnd > 0 ? "var(--ink-soft)" : "var(--paddy-deep)" }}>
          <span>Phí giao{zoneName ? ` · ${zoneName}` : ""}</span>
          <span>{shipVnd > 0 ? fmtVnd(shipVnd) : "miễn phí"}</span>
        </div>
        <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: "1px dashed var(--line)" }}>
          <span>Phải chuyển</span><b style={{ color: "var(--paddy-deep)" }}>{fmtVnd(totalVnd)}</b>
        </div>
      </div>

      {shipVnd > 0 && (
        <p className="text-[11.6px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
          Phí giao tính <b>một lần cho cả chuyến</b> - bỏ thêm lô vào giỏ không tốn thêm phí.
        </p>
      )}

      {vuongMac ? (
        // Ô địa chỉ nằm NGAY TRÊN thẻ này ở `/cho/gio`, nên câu cảnh báo chỉ được lên
        // đường: nói "thiếu địa chỉ" mà không nói điền ở đâu là một ngõ cụt.
        <p className="text-[12.4px] mt-2 font-semibold" style={{ color: "var(--yolk-deep)" }}>
          ⚠️ {vuongMac} <span className="font-normal" style={{ color: "var(--ink-soft)" }}>
            Ô địa chỉ ở ngay phía trên.
          </span>
        </p>
      ) : (
        <button className="btn btn-primary w-full mt-2.5" disabled={pending}
          onClick={() => run(() => chotGio())}>
          {pending ? "Đang chốt…" : `Chốt đơn · ${fmtVnd(totalVnd)}`}
        </button>
      )}
    </div>
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

/**
 * Ô chuyển khoản cho đơn chợ - dùng lại đúng ô QR của cọc chuồng và decor.
 *
 * Từ Đợt 15 nó có **nút "Tôi đã chuyển khoản"**, cùng khuôn với `PaymentBanner` của cọc.
 * Nút đó không xác nhận tiền (chỉ webhook hoặc người trực làm được việc đó) - nó làm hai
 * việc khác: đưa đơn vào bàn đối soát ở `/admin`, và **đóng băng chỗ giữ** để không ai
 * đoạt lô của người đang chờ ngân hàng (§9.34).
 */
export function MarketPayBox({
  orderId, payCode, priceVnd, daBao, conLai,
}: {
  orderId: string; payCode: string; priceVnd: number;
  /** Đơn đang ở `REPORTED` - người mua đã bấm nút, đang chờ nông trại đối soát. */
  daBao: boolean;
  /** "còn 2 giờ 14 phút", hoặc `null` khi đã báo chuyển (lúc đó đồng hồ hết nghĩa). */
  conLai: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const { pending, run } = useRun();
  /** Ô xác nhận huỷ đơn - cố ý bắt bấm hai nhịp, xem chú thích ở chỗ dùng. */
  const [mo, setMo] = useState(false);

  // ⭐ Ngóng tiền về. Trước Đợt 15 vòng hỏi này **chết câm**: `/api/thanh-toan` nhánh chợ
  // tra `MarketListing.payCode`, mà từ Đợt 13 mã nằm ở `MarketOrder` - nên mọi lần hỏi
  // đều 404 và `usePayWatch` nuốt im lặng. Webhook xác nhận xong, nông dân đã nhận việc
  // giao, mà màn hình người mua vẫn bảo đang chờ (§11.47).
  usePayWatch(payCode, true, () => {
    toast("Đã nhận được tiền - lô này là của bạn, nông trại sẽ giao tận tay! 🎉", "ok");
    router.refresh();
  });

  if (daBao) {
    return (
      <div className="rounded-[13px] p-3 mt-2" style={{ background: "#EAF1F6", border: "1px solid #C9DCE9" }}>
        <div className="flex items-center gap-2.5">
          <span className="flex-none grid place-items-center rounded-full" style={{ width: 30, height: 30, background: "#D6E6F0" }}>
            <span className="pulse-dot" />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-[13.6px]" style={{ color: "#2A5674" }}>Đang chờ nông trại đối soát</div>
            <div className="text-[12.2px] mt-0.5" style={{ color: "#4A7391" }}>
              Thường xong trong vài giờ làm việc. Trang này <b>tự cập nhật</b> khi tiền được
              xác nhận. <b>Lô của bạn được giữ nguyên</b> trong lúc chờ - không ai đoạt được nữa.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[13px] p-3 mt-2" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-semibold text-[13.2px]" style={{ color: "var(--yolk-deep)" }}>
          Chuyển {fmtVnd(priceVnd)} để nhận đơn này
        </div>
        {conLai && (
          <span className="text-[11.8px] font-semibold ml-auto" style={{ color: "var(--yolk-deep)" }}>
            ⏳ {conLai}
          </span>
        )}
      </div>
      <PayQR amountVnd={priceVnd} code={payCode} label="Quét mã để trả tiền đơn này" />
      <p className="text-[11.6px] mt-2" style={{ color: "var(--ink-soft)" }}>
        Nội dung chuyển khoản: <b className="tabular-nums">{payCode}</b>. Chuyển xong bấm nút
        bên dưới - nông trại đối soát rồi giao tận tay bạn và gửi ảnh lúc trao.
      </p>
      <button className="btn btn-primary w-full mt-2" disabled={pending}
        onClick={() => run(() => baoDaChuyenKhoan(orderId))}>
        {pending ? "Đang ghi nhận…" : "✓ Tôi đã chuyển khoản"}
      </button>

      {/* Đường lùi (§11.49). Trước Đợt 16 lối ra duy nhất là ngồi đợi hết hạn giữ chỗ -
          trong lúc đó lô nằm ngoài chợ và người bán mất lượt bán, chỉ vì người mua đổi ý
          mà không có nút nào để nói ra. Đặt DƯỚI nút chính và ở dạng chữ, không phải nút
          to: đây là lối ra, không phải lựa chọn ngang hàng. */}
      {!mo ? (
        <button className="text-[12px] font-semibold mt-2 mx-auto block"
          style={{ color: "var(--ink-soft)", background: "none" }}
          onClick={() => setMo(true)} disabled={pending}>
          Đổi ý? Huỷ đơn này
        </button>
      ) : (
        <div className="rounded-[11px] p-2.5 mt-2 text-[12.2px]"
          style={{ background: "#fff", border: "1px solid var(--line)" }}>
          <b>Huỷ đơn này?</b> Các lô sẽ quay lại chợ cho người khác, và mã{" "}
          <b className="tabular-nums">{payCode}</b> không dùng được nữa.
          <div className="text-[11.6px] mt-1" style={{ color: "#B4472F" }}>
            ⚠️ Chỉ huỷ khi bạn <b>chưa chuyển tiền</b>. Đã chuyển rồi thì bấm nút xanh ở trên.
          </div>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-ghost btn-sm flex-1" disabled={pending}
              style={{ color: "#B4472F", borderColor: "#F0CFC6" }}
              onClick={() => run(() => huyDon(orderId))}>
              {pending ? "Đang huỷ…" : "Huỷ đơn"}
            </button>
            <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
              onClick={() => setMo(false)}>Thôi</button>
          </div>
        </div>
      )}
      {/* Nói TRƯỚC hậu quả của việc không bấm. Tự huỷ mà không báo trước là kiểu làm
          mất lòng tin nhanh nhất - cùng bài học với hoá đơn trang trí (§9.27). */}
      <p className="text-[11.4px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
        Quá hạn giữ chỗ mà chưa bấm thì đơn tự huỷ và lô quay lại chợ. Bấm rồi thì lô được
        giữ cho tới khi nông trại đối soát xong, dù ngân hàng có chậm.
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
export function RutTienButton({ conRut, dangCho }: { conRut: boolean; dangCho?: string }) {
  const { pending, run } = useRun();
  if (!conRut) {
    return (
      // ⚠️ Nói ĐÃ CHỜ BAO LÂU, không chỉ "đang chờ" (§11.49). Bản trước dừng ở "nông
      // trại đang xếp lịch" - đúng nhưng vô nghĩa với người sang ngày thứ năm: câu đó
      // đọc y hệt nhau ở giờ thứ nhất và ở tuần thứ hai, nên nó không nói được điều duy
      // nhất họ muốn biết. Hệ thống thừa nhận thời gian đã trôi thì người ta còn tin;
      // im lặng đều đều mới là thứ làm người ta nghĩ mình bị quên.
      <div className="text-[12.4px] mt-2" style={{ color: "var(--paddy-deep)" }}>
        ⏳ {dangCho ?? "Đã gửi yêu cầu - nông trại đang xếp lịch chuyển khoản."}
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
