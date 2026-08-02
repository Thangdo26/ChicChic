"use client";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { CoopBackdrop, DecorSprite, DecorFigure, COOP_VIEWBOX } from "@/components/Illustrations";
import { installDecor, removeDecor, resetDecorLayout, saveDecorLayout, type DecorPlacement } from "@/app/actions";
import { cancelDecorOrder, createDecorOrder, reportDecorTransfer } from "@/app/decor-actions";
import { DECOR_BOUNDS, SCALE_STEP, clampPlacement, decorCode } from "@/lib/decor";
import { useToast } from "@/components/Toast";
import { fmtVnd } from "@/lib/pricing";

export type Placed = {
  itemSlug: string; name: string; svgKey: string; priceVnd: number;
  x: number; y: number; scale: number; z: number; flipped: boolean;
};
export type CatalogItem = {
  slug: string; name: string; svgKey: string; priceVnd: number; category: string; blurb: string | null;
};
type Category = { id: string; label: string; hint: string };

/** Hoá đơn trang trí đang chờ thanh toán — cùng hình dạng với lib/decor-store. */
export type PendingOrder = {
  id: string;
  totalVnd: number;
  paymentStatus: "UNPAID" | "REPORTED";
  items: { slug: string; name: string; priceVnd: number }[];
};

const sig = (list: Placed[]) =>
  list.map((p) => `${p.itemSlug}:${p.x}:${p.y}:${p.scale}:${p.z}:${p.flipped}`).sort().join("|");

export default function DecorStudio({
  barnSlug, barnLabel, outside, placed, catalog, categories, paidSlugs, pendingOrder,
}: {
  barnSlug: string; barnLabel: string; outside: boolean;
  placed: Placed[]; catalog: CatalogItem[]; categories: Category[];
  /** Món chuồng này ĐÃ TRẢ TIỀN — chỉ những món này mới lắp/gỡ/lắp lại được. */
  paidSlugs: string[];
  /** Hoá đơn đang chờ thanh toán (nhiều nhất một cái). */
  pendingOrder: PendingOrder | null;
}) {
  const [items, setItems] = useState<Placed[]>(placed);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState(categories[0]?.id ?? "");
  /** Giỏ hàng: món đang định mua, chưa gửi hoá đơn. */
  const [cart, setCart] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ slug: string; dx: number; dy: number } | null>(null);

  // Server là nguồn sự thật: khi dữ liệu mới về (lắp/gỡ/reset) thì đồng bộ lại state ngay
  // trong lúc render — đúng pattern "điều chỉnh state khi prop đổi" của React.
  const serverSig = sig(placed);
  const syncedSig = useRef(serverSig);
  if (syncedSig.current !== serverSig) {
    syncedSig.current = serverSig;
    setItems(placed);
  }

  const dirty = sig(items) !== serverSig;
  const installedSlugs = useMemo(() => new Set(items.map((i) => i.itemSlug)), [items]);
  const paid = useMemo(() => new Set(paidSlugs), [paidSlugs]);
  const totalVnd = items.reduce((s, i) => s + i.priceVnd, 0);
  const sel = items.find((i) => i.itemSlug === selected) ?? null;

  const cartItems = useMemo(
    () => cart.map((s) => catalog.find((c) => c.slug === s)).filter((c): c is CatalogItem => !!c),
    [cart, catalog],
  );
  const cartTotal = cartItems.reduce((s, i) => s + i.priceVnd, 0);
  const toggleCart = (slug: string) =>
    setCart((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]));

  /** Đổi toạ độ con trỏ sang hệ toạ độ SVG (khung bọc giữ đúng tỉ lệ 4:3 nên map thẳng được). */
  const toSvg = useCallback((clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * COOP_VIEWBOX.w,
      y: ((clientY - r.top) / r.height) * COOP_VIEWBOX.h,
    };
  }, []);

  const patch = (slug: string, next: Partial<Placed>) =>
    setItems((cur) => cur.map((i) => (i.itemSlug === slug ? { ...i, ...i, ...next } : i)));

  const onPointerDown = (e: React.PointerEvent, it: Placed) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    dragRef.current = { slug: it.itemSlug, dx: p.x - it.x, dy: p.y - it.y };
    setSelected(it.itemSlug);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const p = toSvg(e.clientX, e.clientY);
    const cur = items.find((i) => i.itemSlug === d.slug);
    if (!cur) return;
    patch(d.slug, clampPlacement({ x: p.x - d.dx, y: p.y - d.dy, scale: cur.scale }));
  };

  const endDrag = () => { dragRef.current = null; };

  const bringToFront = (slug: string) =>
    patch(slug, { z: Math.max(0, ...items.map((i) => i.z)) + 1 });

  const nudgeScale = (slug: string, dir: 1 | -1) => {
    const cur = items.find((i) => i.itemSlug === slug);
    if (!cur) return;
    patch(slug, clampPlacement({ x: cur.x, y: cur.y, scale: cur.scale + dir * SCALE_STEP }));
  };

  const layoutOf = (list: Placed[]): DecorPlacement[] =>
    list.map(({ itemSlug, x, y, scale, z, flipped }) => ({ itemSlug, x, y, scale, z, flipped }));

  /** Chạy một server action, luôn báo kết quả cho người dùng. */
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    startTransition(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "warn");
        after?.();
      } catch {
        toast("Không lưu được. Kiểm tra kết nối rồi thử lại.", "err");
      }
    });

  const save = () => run(() => saveDecorLayout(barnSlug, layoutOf(items)));

  const doInstall = (slug: string) =>
    run(
      async () => {
        // Lưu bố cục đang sửa trước, để không mất công kéo khi trang tải lại dữ liệu mới.
        if (dirty) await saveDecorLayout(barnSlug, layoutOf(items));
        return installDecor(barnSlug, slug);
      },
      () => setSelected(slug),
    );

  const doRemove = (slug: string) => run(() => removeDecor(barnSlug, slug), () => setSelected(null));

  const doReset = () => run(() => resetDecorLayout(barnSlug), () => setSelected(null));

  // ---------- Mua & thanh toán ----------
  const doOrder = () => run(() => createDecorOrder(barnSlug, cart), () => setCart([]));
  const doReport = (orderId: string) => run(() => reportDecorTransfer(orderId));
  const doCancelOrder = (orderId: string) => run(() => cancelDecorOrder(orderId));

  const ordered = [...items].sort((a, b) => a.z - b.z);
  const shown = catalog.filter((c) => c.category === tab);

  return (
    <>
      {/* ---------- Khung sắp xếp ---------- */}
      <div className="coopwrap mt-3" style={{ padding: 10 }}>
        <div style={{ aspectRatio: "4 / 3", width: "100%" }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${COOP_VIEWBOX.w} ${COOP_VIEWBOX.h}`}
            width="100%" height="100%"
            style={{ touchAction: "none", display: "block" }}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onPointerDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}
          >
            <CoopBackdrop outside={outside} />
            {ordered.map((it) => {
              const on = it.itemSlug === selected;
              return (
                <g
                  key={it.itemSlug}
                  transform={`translate(${it.x},${it.y})`}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => onPointerDown(e, it)}
                >
                  {on && (
                    <circle r={26 * it.scale} fill="rgba(47,93,58,.10)" stroke="var(--paddy)"
                      strokeWidth="1.4" strokeDasharray="4 3" />
                  )}
                  <g transform={`scale(${(it.flipped ? -1 : 1) * it.scale},${it.scale})`}>
                    <DecorSprite svgKey={it.svgKey} label={barnLabel} />
                  </g>
                  {/* vùng bắt chạm rộng hơn hình vẽ cho dễ kéo trên điện thoại */}
                  <circle r={24 * it.scale} fill="transparent" />
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <p className="text-[12.2px] mt-2 text-center" style={{ color: "var(--ink-soft)" }}>
        {items.length === 0
          ? "Chưa có món nào — chọn bên dưới để bắt đầu trang trí."
          : sel ? "Kéo để đổi chỗ. Dùng thanh công cụ bên dưới để chỉnh."
          : "Chạm vào một món trên hình để chọn và kéo đi."}
      </p>

      {/* ---------- Thanh công cụ cho món đang chọn ---------- */}
      {sel && (
        <div className="card mt-2.5" style={{ padding: 12 }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 flex-none grid place-items-center rounded-[10px]" style={{ background: "var(--paper2)" }}>
              <DecorFigure svgKey={sel.svgKey} size={30} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13.8px] truncate">{sel.name}</div>
              <div className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>Cỡ {Math.round(sel.scale * 100)}%</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => doRemove(sel.itemSlug)} disabled={pending}
              style={{ color: "#B4472F", borderColor: "#F0CFC6" }}>Gỡ</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-2.5">
            <button className="btn btn-ghost btn-sm !w-full" onClick={() => nudgeScale(sel.itemSlug, -1)}
              disabled={sel.scale <= DECOR_BOUNDS.minScale + 0.001}>− Nhỏ</button>
            <button className="btn btn-ghost btn-sm !w-full" onClick={() => nudgeScale(sel.itemSlug, 1)}
              disabled={sel.scale >= DECOR_BOUNDS.maxScale - 0.001}>+ To</button>
            <button className="btn btn-ghost btn-sm !w-full" onClick={() => patch(sel.itemSlug, { flipped: !sel.flipped })}>⇋ Lật</button>
            <button className="btn btn-ghost btn-sm !w-full" onClick={() => bringToFront(sel.itemSlug)}>↑ Trước</button>
          </div>
        </div>
      )}

      {/* ---------- Lưu / hoàn tác ---------- */}
      <div className="flex items-center gap-2 mt-2.5">
        <button className="btn btn-primary flex-1" onClick={save} disabled={!dirty || pending}>
          {pending ? "Đang lưu…" : dirty ? "Lưu bố cục này" : "Đã lưu ✓"}
        </button>
        {items.length > 0 && (
          <button className="btn btn-ghost btn-sm flex-none" disabled={pending} onClick={doReset}>
            Xếp lại mặc định
          </button>
        )}
      </div>
      {dirty && (
        <p className="text-[11.8px] mt-1.5" style={{ color: "var(--yolk-deep)" }}>
          Bố cục đang thay đổi chưa lưu — bấm “Lưu bố cục này” để cô Lan lắp đúng như bạn xếp.
        </p>
      )}

      {items.length > 0 && (
        <div className="soft mt-3 flex justify-between items-center text-[13px]">
          <span style={{ color: "var(--ink-soft)" }}>{items.length} món đã lắp</span>
          <b>{fmtVnd(totalVnd)}</b>
        </div>
      )}

      {/* ---------- Hoá đơn đang chờ thanh toán ----------
          Đặt NGAY trên catalog: người ta vừa bấm mua thì phải thấy ngay phải làm gì tiếp,
          chứ không đi tìm trong thông báo. */}
      {pendingOrder && (
        <div className="card mt-3" style={{ borderColor: "#EBD8AE", background: "#FFFDF6" }}>
          <div className="font-bold text-[14px]">
            🧾 Hoá đơn trang trí · {fmtVnd(pendingOrder.totalVnd)}
          </div>
          <div className="text-[12.2px] mt-1" style={{ color: "var(--ink-soft)" }}>
            {pendingOrder.items.map((i) => i.name).join(" · ")}
          </div>

          {pendingOrder.paymentStatus === "REPORTED" ? (
            <div className="flex items-center gap-2 mt-2.5">
              <span className="pulse-dot flex-none" aria-hidden />
              <span className="text-[12.8px]" style={{ color: "var(--ink-soft)" }}>
                Đang chờ nông trại đối soát. Xong là các món hiện ra trong chuồng để bạn xếp đặt.
              </span>
            </div>
          ) : (
            <>
              <div className="soft mt-2.5 text-[12.8px]">
                Chuyển khoản đúng số tiền, <b>nội dung ghi</b>{" "}
                <b style={{ color: "var(--paddy-deep)" }}>{decorCode(pendingOrder.id)}</b> — nông trại
                đối soát theo mã này.
              </div>
              <div className="flex gap-2 mt-2.5">
                <button className="btn btn-primary flex-1" disabled={pending}
                  onClick={() => doReport(pendingOrder.id)}>
                  Tôi đã chuyển khoản
                </button>
                <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
                  onClick={() => doCancelOrder(pendingOrder.id)}>
                  Huỷ
                </button>
              </div>
            </>
          )}
          <p className="text-[11.4px] mt-2" style={{ color: "var(--ink-soft)" }}>
            Món chỉ vào chuồng sau khi nông trại xác nhận đã nhận tiền — cùng luật với cọc chuồng.
          </p>
        </div>
      )}

      {/* ---------- Giỏ hàng ---------- */}
      {cart.length > 0 && !pendingOrder && (
        <div className="card mt-3" style={{ borderColor: "var(--paddy)" }}>
          <div className="font-bold text-[14px]">🛒 {cart.length} món đang chọn · {fmtVnd(cartTotal)}</div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {cartItems.map((i) => (
              <button key={i.slug} type="button" onClick={() => toggleCart(i.slug)}
                className="text-[11.8px] font-semibold rounded-full px-2.5 py-1"
                style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                {i.name} ×
              </button>
            ))}
          </div>
          <button className="btn btn-primary mt-2.5" disabled={pending} onClick={doOrder}>
            {pending ? "Đang tạo hoá đơn…" : `Đặt mua ${cart.length} món · ${fmtVnd(cartTotal)}`}
          </button>
          <p className="text-[11.4px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
            Đặt mua xong bạn nhận hoá đơn kèm mã chuyển khoản. Nông trại xác nhận tiền thì món
            mới vào chuồng và cô chú mới nhận việc lắp.
          </p>
        </div>
      )}

      {/* ---------- Catalog ---------- */}
      <div className="label">Thêm món mới</div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {categories.map((c) => (
          <button key={c.id} onClick={() => setTab(c.id)}
            className="flex-none font-semibold text-[12.8px] rounded-full px-3 py-1.5 whitespace-nowrap"
            style={tab === c.id
              ? { background: "var(--paddy)", color: "#F7FBF4" }
              : { background: "var(--card)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="text-[12.2px] mt-2" style={{ color: "var(--ink-soft)" }}>
        {categories.find((c) => c.id === tab)?.hint}
      </p>

      <div className="grid grid-cols-2 gap-2.5 mt-2.5">
        {shown.map((d) => {
          const on = installedSlugs.has(d.slug);       // đang nằm trong chuồng
          const bought = paid.has(d.slug);             // đã trả tiền (có thể đã gỡ ra)
          const inCart = cart.includes(d.slug);
          const inBill = pendingOrder?.items.some((i) => i.slug === d.slug) ?? false;
          return (
            <div key={d.slug} className="card text-center"
              style={on ? { borderColor: "var(--paddy)" } : inCart ? { borderColor: "var(--yolk)" } : undefined}>
              <div className="h-16 grid place-items-center"><DecorFigure svgKey={d.svgKey} /></div>
              <div className="font-semibold text-[13.5px]">{d.name}</div>
              {d.blurb && <div className="text-[11.6px] mt-0.5 leading-snug" style={{ color: "var(--ink-soft)" }}>{d.blurb}</div>}
              <div className="text-[12px] mt-1 mb-2.5" style={{ color: "var(--ink-soft)" }}>{fmtVnd(d.priceVnd)}</div>

              {on ? (
                <button className="btn btn-ghost btn-sm w-full" onClick={() => setSelected(d.slug)}>✓ Đã lắp · Chỉnh</button>
              ) : bought ? (
                /* Đã mua nhưng đang gỡ ra — lắp lại không mất tiền lần hai. */
                <button className="btn btn-ghost btn-sm w-full" onClick={() => doInstall(d.slug)} disabled={pending}>
                  ↺ Lắp lại
                </button>
              ) : inBill ? (
                <button className="btn btn-ghost btn-sm w-full" disabled>🧾 Đang chờ thanh toán</button>
              ) : pendingOrder ? (
                <button className="btn btn-ghost btn-sm w-full" disabled title="Xong hoá đơn đang treo rồi mua tiếp nhé">
                  Chờ hoá đơn trước
                </button>
              ) : (
                <button className={`btn btn-sm w-full ${inCart ? "btn-ghost" : "btn-yolk"}`}
                  onClick={() => toggleCart(d.slug)} disabled={pending}>
                  {inCart ? "✓ Đang chọn" : "＋ Chọn mua"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
