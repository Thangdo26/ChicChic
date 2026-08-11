"use client";
// NHẬN HÀNG TẬN NHÀ - địa chỉ + nút xin nhận từng lô, đặt ngay trong sổ thu hoạch.
//
// Cùng khuôn với `PayoutAccountForm` ở `/cho/cua-toi`: form địa chỉ nằm ở CHÍNH chỗ
// người ta cần nó, không đẩy sang một trang cài đặt riêng. Người dùng đang nhìn lô
// trứng của mình và muốn lấy về - bắt họ đi tìm màn "hồ sơ" là chỗ rơi rụng.
import { useState, useTransition } from "react";
import { cancelClaim, claimLot, requestFreeze, saveAddress } from "@/app/harvest-actions";
import { useToast } from "@/components/Toast";
import { nhanPhiGiao, type VungGiao } from "@/lib/delivery";
import { fmtVnd } from "@/lib/pricing";

export type AddressVM = {
  fullName: string; phone: string; line: string; note: string | null;
  /** null = địa chỉ có từ trước Đợt 13, chưa chọn khu vực ⟹ chưa đặt hàng được. */
  zoneId: string | null;
  zoneName?: string | null;
  zoneFeeVnd?: number | null;
};

/**
 * Ô địa chỉ. `initial = null` ⟹ chưa có, và đó là lý do nút "Nhận về nhà" bị khoá.
 *
 * Từ Đợt 13 ô này còn giữ **khu vực giao** - và nó tự bung ra khi địa chỉ cũ chưa có khu
 * vực (`initial.zoneId === null`), vì lúc đó người dùng đang cầm một địa chỉ **không đặt
 * hàng được** mà nhìn vào thì thấy đầy đủ. Đóng lại rồi để họ tự phát hiện lúc bấm mua là
 * đẩy một việc phải-sửa vào đúng lúc họ đang muốn trả tiền.
 */
export function AddressForm({ initial, zones }: { initial: AddressVM | null; zones: VungGiao[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const thieuVung = !!initial && !initial.zoneId;
  const [open, setOpen] = useState(!initial || thieuVung);
  const [f, setF] = useState({
    fullName: initial?.fullName ?? "",
    phone: initial?.phone ?? "",
    line: initial?.line ?? "",
    note: initial?.note ?? "",
    // Chỉ MỘT vùng thì chọn sẵn - bắt bấm vào ô chọn một-lựa-chọn là bắt làm việc thừa.
    zoneId: initial?.zoneId ?? (zones.length === 1 ? zones[0].id : ""),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((cur) => ({ ...cur, [k]: e.target.value }));

  const vungDangChon = zones.find((z) => z.id === f.zoneId) ?? null;

  if (!open && initial) {
    return (
      <div className="card mt-3">
        <div className="flex items-center gap-2">
          <span className="flex-none text-[17px]">🏠</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[13.4px] truncate">{initial.fullName} · {initial.phone}</div>
            <div className="text-[11.8px] truncate" style={{ color: "var(--ink-soft)" }}>{initial.line}</div>
            {initial.zoneName && (
              <div className="text-[11.4px]" style={{ color: "var(--paddy-deep)" }}>
                🚚 {nhanPhiGiao({ id: "", name: initial.zoneName, feeVnd: initial.zoneFeeVnd ?? 0 })}
              </div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm flex-none" onClick={() => setOpen(true)}>Sửa</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card mt-3" style={initial && !thieuVung ? undefined : { borderColor: "#EBD8AE" }}>
      <div className="font-bold text-[14px] mb-0.5">🏠 Địa chỉ nhận hàng</div>
      {thieuVung ? (
        <p className="text-[12.2px] mb-2" style={{ color: "var(--yolk-deep)" }}>
          Địa chỉ của bạn có từ trước khi nông trại chia khu vực giao. <b>Chọn khu vực</b> rồi
          lưu lại là đặt hàng được tiếp.
        </p>
      ) : (
        <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
          Cô chú giao tận nơi và <b>gọi trước khi tới</b>. Điền một lần, dùng cho mọi lô sau này -
          đổi địa chỉ sau cũng không ảnh hưởng lô đang trên đường.
        </p>
      )}
      <input className="input" placeholder="Tên người nhận" value={f.fullName} onChange={set("fullName")} />
      <input className="input mt-2" placeholder="Số điện thoại" inputMode="tel" value={f.phone} onChange={set("phone")} />
      <input className="input mt-2" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh" value={f.line} onChange={set("line")} />

      {/* Ô CHỌN, không phải ô gõ - cùng lý do với ô ngân hàng ở Đợt 9. Đoán khu vực từ
          dòng địa chỉ người dùng tự gõ là đoán mò, và đoán sai ở đây nghĩa là thu nhầm
          tiền hoặc hứa giao tới một nơi không ai đi tới. */}
      {zones.length === 0 ? (
        <p className="text-[12.2px] mt-2" style={{ color: "#B4472F" }}>
          ⚠️ Nông trại chưa khai khu vực giao nào - liên hệ nông trại giúp mình nhé.
        </p>
      ) : (
        <>
          <select
            className="input mt-2" value={f.zoneId} disabled={pending}
            aria-label="Khu vực giao hàng"
            onChange={(e) => setF((cur) => ({ ...cur, zoneId: e.target.value }))}
          >
            <option value="">- Khu vực giao hàng -</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}{z.feeVnd > 0 ? ` · phí giao ${fmtVnd(z.feeVnd)}` : " · miễn phí giao"}
              </option>
            ))}
          </select>
          {vungDangChon && (
            <p className="text-[11.8px] mt-1" style={{ color: vungDangChon.feeVnd > 0 ? "var(--ink-soft)" : "var(--paddy-deep)" }}>
              {vungDangChon.feeVnd > 0
                ? <>Phí giao <b>{fmtVnd(vungDangChon.feeVnd)}</b> cho <b>một chuyến</b> - mua nhiều lô cùng lúc vẫn tính một lần.</>
                : <>Nông trại <b>miễn phí giao</b> tới {vungDangChon.name}.</>}
            </p>
          )}
        </>
      )}

      <input className="input mt-2" placeholder="Ghi chú cho cô chú (không bắt buộc)" value={f.note} onChange={set("note")} />
      <div className="flex items-center gap-1.5 mt-2">
        <button
          className="btn btn-primary btn-sm flex-1" disabled={pending || !f.zoneId}
          onClick={() => start(async () => {
            try {
              const r = await saveAddress(f);
              toast(r.message, r.ok ? "ok" : "warn");
              if (r.ok) setOpen(false);
            } catch { toast("Không lưu được - kiểm tra mạng rồi thử lại.", "err"); }
          })}
        >{pending ? "Đang lưu…" : "Lưu địa chỉ"}</button>
        {initial && !thieuVung && (
          <button className="btn btn-ghost btn-sm flex-none" disabled={pending} onClick={() => setOpen(false)}>Huỷ</button>
        )}
      </div>
    </div>
  );
}

/**
 * Nút xin nhận một lô về nhà.
 *
 * `hasAddress = false` thì KHÔNG ẩn nút - hiện nó ở dạng khoá kèm lý do. Ẩn đi thì
 * người ta không biết tính năng tồn tại; khoá kèm lý do thì họ biết phải làm gì tiếp.
 * (Luật thật vẫn nằm ở `claimLot`, đây chỉ là mỹ quan - §9.6.)
 */
export function ClaimLotButton({
  lotId, hasAddress, summary,
}: { lotId: string; hasAddress: boolean; summary: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();

  if (!hasAddress) {
    return (
      <div className="text-[12px] mt-1.5" style={{ color: "var(--yolk-deep)" }}>
        🏠 Điền địa chỉ nhận hàng ở trên là nhận lô này về nhà được.
      </div>
    );
  }

  return (
    <button
      className="btn btn-ghost btn-sm mt-1.5" disabled={pending}
      onClick={() => {
        if (!window.confirm(`Nhận ${summary} về nhà bạn?\n\nCô chú sẽ gọi trước rồi giao tận nơi, và chụp một tấm lúc trao tay.`)) return;
        start(async () => {
          try {
            const r = await claimLot(lotId);
            toast(r.message, r.ok ? "ok" : "warn");
          } catch { toast("Không gửi được - kiểm tra mạng rồi thử lại.", "err"); }
        });
      }}
    >{pending ? "Đang gửi…" : "🏠 Nhận về nhà"}</button>
  );
}

/** Rút một lô khỏi chuyến giao đang chờ. */
export function CancelClaimButton({ lotId }: { lotId: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      className="btn btn-ghost btn-sm mt-1.5" disabled={pending}
      onClick={() => start(async () => {
        try {
          const r = await cancelClaim(lotId);
          toast(r.message, r.ok ? "ok" : "warn");
        } catch { toast("Không gửi được - thử lại giúp mình nhé.", "err"); }
      })}
    >{pending ? "Đang rút…" : "Rút khỏi chuyến giao"}</button>
  );
}

/**
 * Nhờ nông dân cấp đông một lô đang chờ ở nông trại.
 *
 * Đặt cạnh "Nhận về nhà" và "Bán lại trên chợ" là có chủ ý: cả ba là **những việc chủ
 * lô làm được với hàng của mình**, và trước bản này chỉ có hai. Cách bảo quản do nông
 * dân chọn một lần lúc ghi sổ rồi thôi - trong khi người biết mình bao giờ mới lấy được
 * hàng về là chủ lô, không phải cô chú.
 *
 * `window.confirm` chứ không phải bấm phát ăn ngay: **một chiều, không có rã đông**
 * (rã rồi đông lại là chuyện an toàn thực phẩm, không phải một cái nút), và với trứng
 * thì cấp đông đổi hẳn món hàng nên phải hỏi lại cho chắc.
 */
export function FreezeLotButton({
  lotId, summary, isEgg,
}: { lotId: string; summary: string; isEgg: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      className="btn btn-ghost btn-sm mt-1.5" disabled={pending}
      onClick={() => {
        const them = isEgg
          ? "\n\nLưu ý: trứng cấp đông thì không còn dùng để luộc/ốp được nữa - chỉ hợp làm bánh."
          : "";
        if (!window.confirm(`Nhờ cô chú cho ${summary} vào tủ đông?${them}\n\nKhông có đường rã đông lại nhé.`)) return;
        start(async () => {
          try {
            const r = await requestFreeze(lotId);
            toast(r.message, r.ok ? "ok" : "warn");
          } catch { toast("Không gửi được - kiểm tra mạng rồi thử lại.", "err"); }
        });
      }}
    >{pending ? "Đang gửi…" : "🧊 Nhờ cấp đông"}</button>
  );
}
