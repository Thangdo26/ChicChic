"use client";
// Kho hàng thật của nông trại - trang trí và yếm là VẬT CÓ THẬT phải mua về, không
// phải vật phẩm ảo sinh ra vô hạn.
//
// Người trực dùng màn này để nhập hàng về kệ. Số ở đây trừ ngay khi có người đặt hoá
// đơn (giữ hàng) và cộng lại khi họ huỷ - xem `decor-actions`.
import { useState, useTransition } from "react";
import { setDecorStock } from "@/app/admin-actions";
import { useToast } from "@/components/Toast";

export type StockRow = {
  slug: string;
  name: string;
  /** Còn trên kệ nông trại. */
  stockQty: number;
  /** Đang bị hoá đơn CHƯA thanh toán giữ chỗ - đã trừ khỏi `stockQty` rồi. */
  held: number;
  wearable: boolean;
  colorHex: string | null;
};

/** Dưới ngưỡng này thì tô vàng để người trực biết mà nhập thêm trước khi hết. */
const LOW = 3;

export default function DecorStockForms({ rows }: { rows: StockRow[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  /** Ô "đặt lại" đang mở cho món nào, và số đang gõ. */
  const [editing, setEditing] = useState<{ slug: string; value: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) setEditing(null);
      } catch {
        toast("Không gửi được - kiểm tra mạng rồi thử lại.", "err");
      }
    });

  const out = rows.filter((r) => r.stockQty === 0).length;

  return (
    <div className="card mt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold text-[14px]">📦 Kho nông trại ({rows.length} món)</div>
        {out > 0 && (
          <span className="text-[11.5px] font-bold rounded-full px-2 py-0.5"
            style={{ background: "#FCEDE9", color: "#8A3A26" }}>{out} món hết hàng</span>
        )}
      </div>
      <p className="text-[12px] mt-0.5 mb-2" style={{ color: "var(--ink-soft)" }}>
        Số cái còn trên kệ. Khách đặt hoá đơn là <b>trừ ngay</b> (giữ hàng), huỷ hoá đơn
        thì cộng lại. Hết hàng thì cửa hàng tự khoá nút mua.
      </p>

      {rows.map((r) => {
        const low = r.stockQty > 0 && r.stockQty <= LOW;
        return (
          <div key={r.slug} className="py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="flex items-center gap-2">
              {r.colorHex && (
                <span className="inline-block rounded-full flex-none"
                  style={{ width: 11, height: 11, background: r.colorHex }} aria-hidden />
              )}
              <span className="text-[13px] font-semibold min-w-0 truncate flex-1">
                {r.name}{r.wearable && " 🧣"}
              </span>
              <span className="flex-none text-[12.5px] font-bold tabular-nums px-2 py-0.5 rounded-full"
                style={
                  r.stockQty === 0
                    ? { background: "#FCEDE9", color: "#8A3A26" }
                    : low
                      ? { background: "var(--yolk-tint)", color: "var(--yolk-deep)" }
                      : { background: "var(--paper2)", color: "var(--ink-soft)" }
                }>
                {r.stockQty === 0 ? "hết hàng" : `còn ${r.stockQty}`}
              </span>
            </div>

            {r.held > 0 && (
              <div className="text-[11.4px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                {r.held} cái đang bị hoá đơn chưa thanh toán giữ chỗ
              </div>
            )}

            {editing?.slug === r.slug ? (
              <div className="flex items-center gap-1.5 mt-1.5">
                <input
                  className="input flex-1" type="number" min={0} inputMode="numeric" autoFocus
                  value={editing.value}
                  onChange={(e) => setEditing({ slug: r.slug, value: e.target.value })}
                  placeholder="Số cái thật đang có"
                />
                <button className="btn btn-primary btn-sm flex-none" disabled={pending}
                  onClick={() => run(() => setDecorStock(r.slug, { set: Number(editing.value), expectedQty: r.stockQty }))}>
                  Lưu
                </button>
                <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
                  onClick={() => setEditing(null)}>Huỷ</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1.5">
                <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
                  onClick={() => run(() => setDecorStock(r.slug, { delta: -1, expectedQty: r.stockQty }))}>−1</button>
                <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
                  onClick={() => run(() => setDecorStock(r.slug, { delta: 1, expectedQty: r.stockQty }))}>+1</button>
                <button className="btn btn-yolk btn-sm flex-none" disabled={pending}
                  onClick={() => run(() => setDecorStock(r.slug, { delta: 10, expectedQty: r.stockQty }))}>Nhập +10</button>
                <button className="btn btn-ghost btn-sm flex-none ml-auto" disabled={pending}
                  onClick={() => setEditing({ slug: r.slug, value: String(r.stockQty) })}>
                  Kiểm kê…
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
