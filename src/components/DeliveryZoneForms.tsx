"use client";
// KHAI VÙNG GIAO - nông trại nhận chở tới đâu, và tới đó tốn bao nhiêu (§11.43).
//
// Khối này quyết định hai thứ người mua nhìn thấy: **có đặt được hàng không**, và **phải
// chuyển bao nhiêu**. Nên nó nói thẳng cả hai hệ quả ngay trên màn, thay vì để người trực
// sửa một con số rồi đoán xem ai bị ảnh hưởng.
//
// ⚠️ Bảng RỖNG ⟹ không ai đặt hàng chợ được. Đó là mặc định đúng (thà không nhận đơn còn
// hơn nhận rồi không giao được), nhưng phải nói ra - im lặng thì người trực chỉ thấy "chợ
// tự nhiên không ai mua".
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDeliveryZone } from "@/app/admin-actions";
import { useToast } from "@/components/Toast";
import { fmtVnd } from "@/lib/pricing";

export type ZoneVM = {
  id: string; name: string; feeVnd: number; active: boolean; sortOrder: number;
  /** Bao nhiêu người đang để địa chỉ ở vùng này - tắt vùng là chặn đúng ngần ấy người. */
  soDiaChi: number;
};

export default function DeliveryZoneForms({ rows }: { rows: ZoneVM[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const [fee, setFee] = useState<Record<string, string>>({});
  const [moi, setMoi] = useState({ name: "", feeVnd: "" });

  const chay = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) router.refresh();
      } catch {
        toast("Không lưu được - kiểm tra mạng rồi thử lại.", "err");
      }
    });

  const dangMo = rows.filter((r) => r.active).length;

  return (
    <div className="card mt-3" style={dangMo === 0 ? { borderColor: "#E0B6AA" } : undefined}>
      <div className="font-bold text-[14px] mb-0.5">🚚 Vùng giao hàng ({dangMo} đang mở)</div>
      <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
        Phí là của <b>một chuyến</b>, không phải một lô - người mua gom nhiều lô vào giỏ thì
        vẫn chỉ trả một lần. Để <b>0đ</b> là miễn phí giao.
      </p>

      {dangMo === 0 && (
        <p className="text-[12.4px] mb-2 font-semibold" style={{ color: "#8A3A26" }}>
          ⚠️ Không có vùng nào đang mở - <b>không ai đặt hàng trên chợ được</b>. Mở lại một
          vùng hoặc thêm vùng mới ở dưới.
        </p>
      )}

      {rows.map((z) => {
        const dangGo = fee[z.id];
        const soMoi = dangGo === undefined ? z.feeVnd : Number(dangGo.replace(/\D/g, "") || 0);
        const doi = soMoi !== z.feeVnd;
        return (
          <div key={z.id} className="py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[13.4px]" style={{ opacity: z.active ? 1 : 0.5 }}>{z.name}</span>
              {!z.active && (
                <span className="text-[11px] rounded-full px-2 py-0.5"
                  style={{ background: "var(--paper2)", color: "var(--ink-soft)" }}>đang tắt</span>
              )}
              {z.feeVnd === 0 && z.active && (
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                  style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>miễn phí giao</span>
              )}
              <span className="text-[11.4px] ml-auto" style={{ color: "var(--ink-soft)" }}>
                {z.soDiaChi} địa chỉ
              </span>
            </div>

            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <input
                className="input flex-1 min-w-[110px]" inputMode="numeric" disabled={pending}
                aria-label={`Phí giao tới ${z.name}`}
                value={dangGo ?? String(z.feeVnd)}
                onChange={(e) => setFee((c) => ({ ...c, [z.id]: e.target.value }))}
              />
              <button
                className="btn btn-primary btn-sm flex-none" disabled={pending || !doi}
                onClick={() => chay(() => setDeliveryZone({ id: z.id, feeVnd: soMoi, sortOrder: z.sortOrder }))}
              >Lưu phí</button>
              <button
                className="btn btn-ghost btn-sm flex-none" disabled={pending}
                onClick={() => {
                  // Tắt vùng là chặn đúng ngần ấy người khỏi đặt hàng - nói con số ra
                  // trước khi bấm, đừng để người trực phát hiện qua việc chợ im ắng.
                  if (z.active && !window.confirm(
                    `Tắt vùng ${z.name}?\n\n` +
                    `• ${z.soDiaChi} người đang để địa chỉ ở vùng này sẽ KHÔNG đặt hàng được.\n` +
                    "• Đơn đã chốt không bị ảnh hưởng.\n" +
                    "• Địa chỉ của họ vẫn còn - mở lại vùng là dùng tiếp được.",
                  )) return;
                  chay(() => setDeliveryZone({ id: z.id, active: !z.active, feeVnd: z.feeVnd, sortOrder: z.sortOrder }));
                }}
              >{z.active ? "Tắt" : "Mở lại"}</button>
            </div>
          </div>
        );
      })}

      <div className="pt-2.5 mt-1" style={{ borderTop: "1px dashed var(--line)" }}>
        <div className="text-[12.6px] font-semibold mb-1.5">Thêm vùng mới</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            className="input flex-1 min-w-[140px]" placeholder="Tên tỉnh/khu vực" disabled={pending}
            value={moi.name} onChange={(e) => setMoi((c) => ({ ...c, name: e.target.value }))}
          />
          <input
            className="input flex-none w-[110px]" placeholder="Phí (đ)" inputMode="numeric" disabled={pending}
            value={moi.feeVnd} onChange={(e) => setMoi((c) => ({ ...c, feeVnd: e.target.value }))}
          />
          <button
            className="btn btn-primary btn-sm flex-none" disabled={pending || !moi.name.trim()}
            onClick={() => chay(async () => {
              const r = await setDeliveryZone({
                name: moi.name, feeVnd: Number(moi.feeVnd.replace(/\D/g, "") || 0), sortOrder: 50,
              });
              if (r.ok) setMoi({ name: "", feeVnd: "" });
              return r;
            })}
          >Thêm</button>
        </div>
        <p className="text-[11.6px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Để trống ô phí là <b>miễn phí giao</b> tới vùng đó. Sửa phí <b>không</b> đổi số tiền
          của đơn đã chốt - {fmtVnd(0)} hay {fmtVnd(30000)} thì đơn cũ vẫn giữ số cũ.
        </p>
      </div>
    </div>
  );
}
