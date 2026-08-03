"use client";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { CoopBackdrop, DecorSprite, DecorFigure, COOP_VIEWBOX } from "@/components/Illustrations";
import {
  installDecor, removeDecor, resetDecorLayout, saveDecorLayout, setDecorText,
  type DecorPlacement,
} from "@/app/actions";
import { cancelDecorOrder, createDecorOrder, reportDecorTransfer } from "@/app/decor-actions";
import {
  DECOR_BOUNDS, DECOR_TEXT, MAX_PER_ITEM, SCALE_STEP, clampPlacement, decorCode,
} from "@/lib/decor";
import { useToast } from "@/components/Toast";
import { fmtVnd } from "@/lib/pricing";

/** Một CÁI đang nằm trong chuồng. `id` là BarnDecor.id — một chuồng có nhiều bản cùng loại. */
export type Placed = {
  id: string; itemSlug: string; name: string; svgKey: string; priceVnd: number;
  text: string | null;
  x: number; y: number; scale: number; z: number; flipped: boolean;
};
export type CatalogItem = {
  slug: string; name: string; svgKey: string; priceVnd: number; category: string; blurb: string | null;
};
/** Tồn kho một loại món trong chuồng này (lib/decor-store.Stock). */
export type Stock = { owned: number; installed: number; free: number };
type Category = { id: string; label: string; hint: string };

/** Hoá đơn trang trí đang chờ thanh toán — cùng hình dạng với lib/decor-store. */
export type PendingOrder = {
  id: string;
  totalVnd: number;
  paymentStatus: "UNPAID" | "REPORTED";
  items: { slug: string; name: string; priceVnd: number; qty: number }[];
};

const sig = (list: Placed[]) =>
  list.map((p) => `${p.id}:${p.x}:${p.y}:${p.scale}:${p.z}:${p.flipped}`).sort().join("|");

export default function DecorStudio({
  barnSlug, barnLabel, outside, placed, catalog, categories, stock, pendingOrder,
}: {
  barnSlug: string; barnLabel: string; outside: boolean;
  placed: Placed[]; catalog: CatalogItem[]; categories: Category[];
  /** Tồn kho theo slug: đã mua bao nhiêu cái, đang lắp bao nhiêu, còn bao nhiêu. */
  stock: Record<string, Stock>;
  /** Hoá đơn đang chờ thanh toán (nhiều nhất một cái). */
  pendingOrder: PendingOrder | null;
}) {
  const [items, setItems] = useState<Placed[]>(placed);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState(categories[0]?.id ?? "");
  /** Giỏ hàng: slug → số cái đang định mua, chưa gửi hoá đơn. */
  const [cart, setCart] = useState<Record<string, number>>({});
  /** Ô sửa chữ đang mở cho món nào (BarnDecor.id), và nội dung đang gõ. */
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  // Server là nguồn sự thật: khi dữ liệu mới về (lắp/gỡ/reset) thì đồng bộ lại state ngay
  // trong lúc render — đúng pattern "điều chỉnh state khi prop đổi" của React.
  const serverSig = sig(placed);
  const syncedSig = useRef(serverSig);
  if (syncedSig.current !== serverSig) {
    syncedSig.current = serverSig;
    setItems(placed);
    setEditing(null);
  }

  const dirty = sig(items) !== serverSig;
  const totalVnd = items.reduce((s, i) => s + i.priceVnd, 0);
  const sel = items.find((i) => i.id === selected) ?? null;
  /** Món đang chọn có mặt chữ để khắc không. */
  const selTextMax = sel ? DECOR_TEXT[sel.svgKey] : undefined;

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, n]) => n > 0)
        .map(([slug, qty]) => ({ item: catalog.find((c) => c.slug === slug), qty }))
        .filter((r): r is { item: CatalogItem; qty: number } => !!r.item),
    [cart, catalog],
  );
  const cartTotal = cartLines.reduce((s, r) => s + r.item.priceVnd * r.qty, 0);
  const cartPieces = cartLines.reduce((s, r) => s + r.qty, 0);

  /** Còn mua thêm được bao nhiêu cái nữa của món này (tính cả số đã sở hữu). */
  const roomFor = (slug: string) =>
    Math.max(0, MAX_PER_ITEM - (stock[slug]?.owned ?? 0) - (cart[slug] ?? 0));

  const addToCart = (slug: string, d: 1 | -1) =>
    setCart((cur) => {
      const next = Math.max(0, (cur[slug] ?? 0) + d);
      if (d > 0 && roomFor(slug) === 0) {
        toast(`Một chuồng chỉ lắp tối đa ${MAX_PER_ITEM} cái cùng một món.`, "warn");
        return cur;
      }
      const out = { ...cur, [slug]: next };
      if (next === 0) delete out[slug];
      return out;
    });

  /** Đổi toạ độ con trỏ sang hệ toạ độ SVG (khung bọc giữ đúng tỉ lệ 4:3 nên map thẳng được). */
  const toSvg = useCallback((clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * COOP_VIEWBOX.w,
      y: ((clientY - r.top) / r.height) * COOP_VIEWBOX.h,
    };
  }, []);

  const patch = (id: string, next: Partial<Placed>) =>
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...next } : i)));

  const onPointerDown = (e: React.PointerEvent, it: Placed) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    dragRef.current = { id: it.id, dx: p.x - it.x, dy: p.y - it.y };
    setSelected(it.id);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const p = toSvg(e.clientX, e.clientY);
    const cur = items.find((i) => i.id === d.id);
    if (!cur) return;
    patch(d.id, clampPlacement({ x: p.x - d.dx, y: p.y - d.dy, scale: cur.scale }));
  };

  const endDrag = () => { dragRef.current = null; };

  const bringToFront = (id: string) => patch(id, { z: Math.max(0, ...items.map((i) => i.z)) + 1 });

  const nudgeScale = (id: string, dir: 1 | -1) => {
    const cur = items.find((i) => i.id === id);
    if (!cur) return;
    patch(id, clampPlacement({ x: cur.x, y: cur.y, scale: cur.scale + dir * SCALE_STEP }));
  };

  const layoutOf = (list: Placed[]): DecorPlacement[] =>
    list.map(({ id, x, y, scale, z, flipped }) => ({ id, x, y, scale, z, flipped }));

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
    run(async () => {
      // Lưu bố cục đang sửa trước, để không mất công kéo khi trang tải lại dữ liệu mới.
      if (dirty) await saveDecorLayout(barnSlug, layoutOf(items));
      return installDecor(barnSlug, slug);
    });

  const doRemove = (id: string) => run(() => removeDecor(barnSlug, id), () => setSelected(null));

  const doReset = () => run(() => resetDecorLayout(barnSlug), () => setSelected(null));

  const doSaveText = () => {
    if (!editing) return;
    const { id, value } = editing;
    run(() => setDecorText(barnSlug, id, value), () => setEditing(null));
  };

  // ---------- Mua & thanh toán ----------
  const doOrder = () =>
    run(
      () => createDecorOrder(barnSlug, cartLines.map((r) => ({ slug: r.item.slug, qty: r.qty }))),
      () => setCart({}),
    );
  const doReport = (orderId: string) => run(() => reportDecorTransfer(orderId));
  const doCancelOrder = (orderId: string) => run(() => cancelDecorOrder(orderId));

  const ordered = [...items].sort((a, b) => a.z - b.z);
  const shown = catalog.filter((c) => c.category === tab);
  /** Món đã mua mà đang để trong kho (đã gỡ ra) — gom lại thành một khu riêng. */
  const inStore = catalog
    .map((c) => ({ item: c, free: stock[c.slug]?.free ?? 0 }))
    .filter((r) => r.free > 0);

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
              const on = it.id === selected;
              return (
                <g
                  key={it.id}
                  transform={`translate(${it.x},${it.y})`}
                  style={{ cursor: "grab" }}
                  onPointerDown={(e) => onPointerDown(e, it)}
                >
                  {on && (
                    <circle r={26 * it.scale} fill="rgba(47,93,58,.10)" stroke="var(--paddy)"
                      strokeWidth="1.4" strokeDasharray="4 3" />
                  )}
                  <g transform={`scale(${(it.flipped ? -1 : 1) * it.scale},${it.scale})`}>
                    <DecorSprite svgKey={it.svgKey} label={barnLabel} text={it.text} />
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
            <button className="btn btn-ghost btn-sm" onClick={() => doRemove(sel.id)} disabled={pending}
              style={{ color: "#B4472F", borderColor: "#F0CFC6" }}>Gỡ</button>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-2.5">
            <button className="btn btn-ghost btn-sm !w-full" onClick={() => nudgeScale(sel.id, -1)}
              disabled={sel.scale <= DECOR_BOUNDS.minScale + 0.001}>− Nhỏ</button>
            <button className="btn btn-ghost btn-sm !w-full" onClick={() => nudgeScale(sel.id, 1)}
              disabled={sel.scale >= DECOR_BOUNDS.maxScale - 0.001}>+ To</button>
            <button className="btn btn-ghost btn-sm !w-full" onClick={() => patch(sel.id, { flipped: !sel.flipped })}>⇋ Lật</button>
            <button className="btn btn-ghost btn-sm !w-full" onClick={() => bringToFront(sel.id)}>↑ Trước</button>
          </div>

          {/* ---------- Khắc chữ (chỉ món có mặt chữ) ---------- */}
          {selTextMax && (
            editing?.id === sel.id ? (
              <div className="mt-2.5">
                <label className="text-[12px] font-semibold block mb-1" htmlFor="decor-text">
                  Chữ khắc trên {sel.name.toLowerCase()}
                </label>
                <input
                  id="decor-text"
                  className="inp"
                  value={editing.value}
                  maxLength={selTextMax}
                  autoFocus
                  placeholder={barnLabel}
                  onChange={(e) => setEditing({ id: sel.id, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") doSaveText(); if (e.key === "Escape") setEditing(null); }}
                />
                <div className="flex items-center gap-2 mt-1.5">
                  <button className="btn btn-primary btn-sm flex-1" onClick={doSaveText} disabled={pending}>
                    {pending ? "Đang lưu…" : "Lưu chữ"}
                  </button>
                  <button className="btn btn-ghost btn-sm flex-none" onClick={() => setEditing(null)} disabled={pending}>
                    Huỷ
                  </button>
                  <span className="text-[11.4px] tabular-nums ml-auto" style={{ color: "var(--ink-soft)" }}>
                    {Array.from(editing.value).length}/{selTextMax}
                  </span>
                </div>
                <p className="text-[11.4px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
                  Để trống là quay về tên chuồng. Nông dân sẽ khắc đúng chữ này ở chuồng thật rồi gửi ảnh.
                </p>
              </div>
            ) : (
              <button
                className="btn btn-ghost btn-sm w-full mt-2"
                onClick={() => setEditing({ id: sel.id, value: sel.text ?? "" })}
                disabled={pending}
              >
                ✎ Sửa chữ · <b>{sel.text ?? barnLabel}</b>
              </button>
            )
          )}
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

      {/* ---------- Kho món đã mua nhưng đang để ngoài ---------- */}
      {inStore.length > 0 && (
        <div className="card mt-3">
          <div className="font-bold text-[14px]">📦 Trong kho của bạn</div>
          <p className="text-[12.2px] mt-0.5 mb-2" style={{ color: "var(--ink-soft)" }}>
            Món đã trả tiền nhưng đang gỡ ra. Lắp lại lúc nào cũng được, không thu tiền lần hai.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {inStore.map(({ item, free }) => (
              <button key={item.slug} type="button" disabled={pending}
                onClick={() => doInstall(item.slug)}
                className="text-[12.2px] font-semibold rounded-full px-3 py-1.5"
                style={{ background: "var(--paper2)", border: "1px solid var(--line)" }}>
                ↺ {item.name}{free > 1 ? ` ×${free}` : ""}
              </button>
            ))}
          </div>
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
            {pendingOrder.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(" · ")}
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
      {cartLines.length > 0 && !pendingOrder && (
        <div className="card mt-3" style={{ borderColor: "var(--paddy)" }}>
          <div className="font-bold text-[14px]">🛒 {cartPieces} món đang chọn · {fmtVnd(cartTotal)}</div>
          <div className="mt-1.5">
            {cartLines.map(({ item, qty }) => (
              <div key={item.slug} className="flex items-center gap-2 py-1.5"
                style={{ borderTop: "1px solid var(--line-soft)" }}>
                <span className="text-[12.8px] flex-1 min-w-0 truncate">{item.name}</span>
                <button type="button" className="qtybtn qtybtn-sm" aria-label={`Bớt một ${item.name}`}
                  onClick={() => addToCart(item.slug, -1)}>−</button>
                <span className="text-[13px] font-bold tabular-nums w-5 text-center">{qty}</span>
                <button type="button" className="qtybtn qtybtn-sm" aria-label={`Thêm một ${item.name}`}
                  onClick={() => addToCart(item.slug, 1)} disabled={roomFor(item.slug) === 0}>+</button>
                <b className="text-[12.6px] tabular-nums w-16 text-right">{fmtVnd(item.priceVnd * qty)}</b>
              </div>
            ))}
          </div>
          <button className="btn btn-primary mt-2.5" disabled={pending} onClick={doOrder}>
            {pending ? "Đang tạo hoá đơn…" : `Đặt mua ${cartPieces} món · ${fmtVnd(cartTotal)}`}
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
          const s = stock[d.slug];
          const owned = s?.owned ?? 0;
          const inCart = cart[d.slug] ?? 0;
          const inBill = pendingOrder?.items.find((i) => i.slug === d.slug) ?? null;
          const full = roomFor(d.slug) === 0;
          return (
            <div key={d.slug} className="card text-center"
              style={owned > 0 ? { borderColor: "var(--paddy)" } : inCart > 0 ? { borderColor: "var(--yolk)" } : undefined}>
              <div className="h-16 grid place-items-center"><DecorFigure svgKey={d.svgKey} /></div>
              <div className="font-semibold text-[13.5px]">{d.name}</div>
              {d.blurb && <div className="text-[11.6px] mt-0.5 leading-snug" style={{ color: "var(--ink-soft)" }}>{d.blurb}</div>}
              <div className="text-[12px] mt-1" style={{ color: "var(--ink-soft)" }}>{fmtVnd(d.priceVnd)}</div>

              {/* Đang có bao nhiêu cái — con số này là thứ trước đây thiếu hẳn. */}
              <div className="text-[11.4px] mt-0.5 mb-2 h-4" style={{ color: "var(--paddy-deep)" }}>
                {owned > 0 && `Đang có ${owned} cái${s && s.free > 0 ? ` · ${s.free} trong kho` : ""}`}
              </div>

              {inBill ? (
                <button className="btn btn-ghost btn-sm w-full" disabled>
                  🧾 Chờ thanh toán{inBill.qty > 1 ? ` ×${inBill.qty}` : ""}
                </button>
              ) : pendingOrder ? (
                <button className="btn btn-ghost btn-sm w-full" disabled title="Xong hoá đơn đang treo rồi mua tiếp nhé">
                  Chờ hoá đơn trước
                </button>
              ) : inCart > 0 ? (
                <div className="flex items-center gap-1.5">
                  <button type="button" className="qtybtn qtybtn-sm" aria-label={`Bớt một ${d.name}`}
                    onClick={() => addToCart(d.slug, -1)}>−</button>
                  <span className="flex-1 text-[13px] font-bold tabular-nums">{inCart}</span>
                  <button type="button" className="qtybtn qtybtn-sm" aria-label={`Thêm một ${d.name}`}
                    onClick={() => addToCart(d.slug, 1)} disabled={full}>+</button>
                </div>
              ) : full ? (
                <button className="btn btn-ghost btn-sm w-full" disabled>
                  Đủ {MAX_PER_ITEM} cái
                </button>
              ) : (
                <button className="btn btn-yolk btn-sm w-full" onClick={() => addToCart(d.slug, 1)} disabled={pending}>
                  {owned > 0 ? "＋ Mua thêm" : "＋ Chọn mua"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
