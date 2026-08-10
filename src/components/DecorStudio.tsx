"use client";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CoopBackdrop, DecorSprite, DecorFigure, COOP_VIEWBOX } from "@/components/Illustrations";
import {
  installDecor, removeDecor, resetDecorLayout, saveDecorLayout, setDecorText, setDecorStyle,
  type DecorPlacement,
} from "@/app/actions";
import { cancelDecorOrder, createDecorOrder, reportDecorTransfer } from "@/app/decor-actions";
import {
  DECOR_BOUNDS, DECOR_TEXT, DECOR_COLORS, DECOR_VARIANTS,
  MAX_PER_ITEM, SCALE_STEP, clampPlacement, DECOR_ORDER_EXPIRE_HOURS,
} from "@/lib/decor";
import { useToast } from "@/components/Toast";
import PayQR from "@/components/PayQR";
import { usePayWatch } from "@/components/usePayWatch";
import { fmtVnd } from "@/lib/pricing";

/** Một CÁI đang nằm trong chuồng. `id` là BarnDecor.id - một chuồng có nhiều bản cùng loại. */
export type Placed = {
  id: string; itemSlug: string; name: string; svgKey: string; priceVnd: number;
  text: string | null;
  /** Màu & kiểu của RIÊNG cái này - 5 đoạn hàng rào có thể khác nhau hoàn toàn. */
  colorHex: string | null;
  variant: string | null;
  x: number; y: number; scale: number; z: number; flipped: boolean;
};
export type CatalogItem = {
  slug: string; name: string; svgKey: string; priceVnd: number; category: string; blurb: string | null;
  /** Món MẶC LÊN GÀ (yếm) - mua ở đây nhưng mặc ở /chuong/<slug>/dan-ga. */
  wearable: boolean;
  /** Màu yếm, để vẽ sprite đúng màu trong lưới catalog. */
  colorHex: string | null;
  /**
   * Số cái NÔNG TRẠI còn trên kệ. Đây là hàng thật, hết là hết.
   * Chỉ để hiển thị - cổng thật nằm ở `decor-actions.createDecorOrder` (§9.6).
   */
  stockQty: number;
};
/** Tồn kho một loại món trong chuồng này (lib/decor-store.Stock). */
export type Stock = { owned: number; installed: number; worn: number; free: number };
type Category = { id: string; label: string; hint: string };

/** Hoá đơn trang trí đang chờ thanh toán - cùng hình dạng với lib/decor-store. */
export type PendingOrder = {
  id: string;
  payCode: string;
  totalVnd: number;
  paymentStatus: "UNPAID" | "REPORTED";
  items: { slug: string; name: string; priceVnd: number; qty: number }[];
};

/**
 * Vân tay của bố cục, dùng cho CẢ hai việc: biết có thay đổi chưa lưu không, và biết
 * dữ liệu server vừa đổi để đồng bộ lại state.
 *
 * `text` PHẢI có trong này. Thiếu nó thì khắc chữ xong vân tay không đổi → khối đồng bộ
 * không chạy → hình vẫn vẽ chữ cũ tới khi người dùng tự tải lại trang.
 */
const sig = (list: Placed[]) =>
  list.map((p) => `${p.id}:${p.x}:${p.y}:${p.scale}:${p.z}:${p.flipped}:${p.text ?? ""}`).sort().join("|");

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
  const router = useRouter();
  // ⭐ Ngóng tiền về cho hoá đơn trang trí.
  //
  // Trước bản này KHÔNG có gì ở đây cả: webhook ngân hàng xác nhận xong thì hoá đơn đã
  // CONFIRMED, món đã vào chuồng, nông dân đã có việc lắp - nhưng màn hình vẫn ngồi hiện
  // "chuyển khoản đúng số tiền…" cho tới khi người dùng tự bấm F5. Đúng thứ người dùng
  // báo là hỏng.
  usePayWatch(pendingOrder?.payCode, !!pendingOrder, () => {
    toast("Nông trại đã nhận được tiền - các món đã vào chuồng, xếp đặt thôi! 🎉", "ok");
    router.refresh();
  });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  // Server là nguồn sự thật: khi dữ liệu mới về (lắp/gỡ/reset) thì đồng bộ lại state ngay
  // trong lúc render - đúng pattern "điều chỉnh state khi prop đổi" của React.
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
  /** Bảng màu / danh sách kiểu của món đang chọn - undefined = món này không đổi được. */
  const selColors = sel ? DECOR_COLORS[sel.svgKey] : undefined;
  const selVariants = sel ? DECOR_VARIANTS[sel.svgKey] : undefined;

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

  /**
   * Còn mua thêm được bao nhiêu cái nữa của món này.
   *
   * HAI trần khác nhau, lấy cái nhỏ hơn:
   *  · trần MỖI CHUỒNG (`MAX_PER_ITEM`) - khung vẽ chỉ chứa được bấy nhiêu;
   *  · KHO NÔNG TRẠI (`stockQty`)      - hàng thật, hết là hết.
   */
  const roomFor = (slug: string) => {
    const c = catalog.find((x) => x.slug === slug);
    const byBarn = MAX_PER_ITEM - (stock[slug]?.owned ?? 0) - (cart[slug] ?? 0);
    const byStock = (c?.stockQty ?? 0) - (cart[slug] ?? 0);
    return Math.max(0, Math.min(byBarn, byStock));
  };

  const addToCart = (slug: string, d: 1 | -1) => {
    // Kiểm tra và báo lỗi NGOÀI updater. Hàm cập nhật state phải thuần: React gọi nó
    // hai lần ở chế độ dev, nên toast đặt bên trong sẽ bắn hai lần - và `roomFor`
    // đọc `cart` từ closure chứ không phải `cur`, đặt trong updater là tự lừa mình.
    if (d > 0 && roomFor(slug) === 0) {
      const c = catalog.find((x) => x.slug === slug);
      const hetKho = (c?.stockQty ?? 0) - (cart[slug] ?? 0) <= 0;
      toast(
        hetKho
          ? "Nông trại hết món này rồi - chờ nhập thêm giúp mình nhé."
          : `Một chuồng chỉ mua tối đa ${MAX_PER_ITEM} cái cùng một món.`,
        "warn",
      );
      return;
    }
    setCart((cur) => {
      const next = Math.max(0, (cur[slug] ?? 0) + d);
      const out = { ...cur, [slug]: next };
      if (next === 0) delete out[slug];
      return out;
    });
  };

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

  /**
   * Đổi màu / kiểu của một cái. Vẽ lại NGAY ở client rồi mới gọi server: người ta đang
   * chọn màu, chờ một lượt đi–về mới thấy đổi thì không còn là "thử màu" nữa.
   *
   * Server vẫn là cổng thật (`setDecorStyle` kiểm màu/kiểu có trong danh sách đóng);
   * nó từ chối thì toast báo và `router.refresh` của lần tải sau trả lại giá trị đúng.
   */
  const doStyle = (id: string, next: { colorHex?: string | null; variant?: string | null }) => {
    patch(id, next);
    run(() => setDecorStyle(barnSlug, id, next));
  };

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
  /**
   * Món đã mua mà đang để trong kho (đã gỡ ra) - gom lại thành một khu riêng.
   *
   * LOẠI yếm ra: nút ở đây gọi `installDecor`, mà yếm thì mặc lên gà chứ không lắp
   * vào chuồng - action sẽ từ chối, nên hiện nút ra chỉ để người ta bấm hụt.
   * Yếm còn trong kho hiện ở trang Đàn gà.
   */
  const inStore = catalog
    .filter((c) => !c.wearable)
    .map((c) => ({ item: c, free: stock[c.slug]?.free ?? 0 }))
    .filter((r) => r.free > 0);
  /** Yếm đã mua nhưng chưa mặc cho con nào - nhắc sang trang Đàn gà. */
  const gearFree = catalog
    .filter((c) => c.wearable)
    .reduce((n, c) => n + (stock[c.slug]?.free ?? 0), 0);

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
                    <DecorSprite svgKey={it.svgKey} label={barnLabel} text={it.text}
                      color={it.colorHex} variant={it.variant} />
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
          ? "Chưa có món nào - chọn bên dưới để bắt đầu trang trí."
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

          {/* ---------- Kiểu dáng (hàng rào) ----------
              Mỗi ĐOẠN một kiểu: ghép rào thẳng + cổng + rào thấp lại là ra cái sân
              riêng của người chơi. Lưu thẳng lên server vì kiểu là việc nông dân phải
              làm thật, không phải thứ chỉnh chơi rồi bấm "Lưu bố cục". */}
          {selVariants && (
            <div className="mt-2.5">
              <div className="text-[12px] font-semibold mb-1">Kiểu dáng</div>
              <div className="flex flex-wrap gap-1.5">
                {selVariants.map((v, i) => {
                  const on = (sel.variant ?? selVariants[0].id) === v.id;
                  return (
                    <button key={v.id} type="button" disabled={pending}
                      onClick={() => doStyle(sel.id, { variant: i === 0 ? null : v.id })}
                      className="text-[12.2px] font-semibold rounded-full px-3 py-1.5"
                      style={on
                        ? { background: "var(--paddy)", color: "#F7FBF4" }
                        : { background: "var(--card)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}>
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---------- Màu sơn ----------
              Bảng màu ĐÓNG, không phải ô chọn màu tự do: nông trại phải sơn thật, và
              hứa một màu không có sẵn là hứa suông (§9.11). */}
          {selColors && (
            <div className="mt-2.5">
              <div className="text-[12px] font-semibold mb-1">Màu sơn</div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selColors.map((c) => (
                  <button key={c} type="button" disabled={pending}
                    aria-label={`Sơn màu ${c}`}
                    onClick={() => doStyle(sel.id, { colorHex: c })}
                    className="rounded-full"
                    style={{
                      width: 30, height: 30, background: c,
                      border: sel.colorHex === c ? "3px solid var(--paddy)" : "1px solid var(--line)",
                    }} />
                ))}
                {sel.colorHex && (
                  <button type="button" disabled={pending}
                    onClick={() => doStyle(sel.id, { colorHex: null })}
                    className="text-[12px] font-semibold rounded-full px-3 py-1.5"
                    style={{ background: "var(--card)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}>
                    Màu gốc
                  </button>
                )}
              </div>
            </div>
          )}

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
          Bố cục đang thay đổi chưa lưu - bấm “Lưu bố cục này” để cô Lan lắp đúng như bạn xếp.
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
                <b style={{ color: "var(--paddy-deep)" }}>{pendingOrder.payCode}</b> - nông trại
                đối soát theo mã này.
              </div>
              {/* Nói TRƯỚC chuyện tự huỷ. Hoá đơn này đang giữ hàng thật trên kệ nông trại
                  (§9.27) nên nó không thể treo mãi - nhưng hàng biến mất mà không báo
                  trước là cách làm mất lòng tin nhanh nhất. */}
              <p className="text-[11.4px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
                Hoá đơn giữ hàng trong {DECOR_ORDER_EXPIRE_HOURS} giờ. Quá hạn mà chưa
                chuyển khoản thì hàng trả về kho cho người khác mua - bạn đặt lại lúc nào cũng được.
              </p>
              {/* Hoá đơn trang trí trước nay KHÔNG hiện số tài khoản ở đâu cả - người dùng
                  phải quay lại banner cọc mà tìm. QR vá luôn chỗ đó: quét là có đủ số tài
                  khoản, số tiền và nội dung. */}
              <PayQR amountVnd={pendingOrder.totalVnd} code={pendingOrder.payCode} />
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
            Món chỉ vào chuồng sau khi nông trại xác nhận đã nhận tiền - cùng luật với cọc chuồng.
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
            Đặt mua xong bạn nhận hoá đơn kèm mã chuyển khoản. Nông trại xác nhận tiền thì
            {cartLines.some((r) => !r.item.wearable) && " món mới vào chuồng và cô chú mới nhận việc lắp"}
            {cartLines.some((r) => !r.item.wearable) && cartLines.some((r) => r.item.wearable) && ","}
            {cartLines.some((r) => r.item.wearable) && " yếm mới vào kho để bạn chọn con mặc"}.
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

      {/* Yếm mua ở đây nhưng MẶC ở trang khác - không nói ra thì người ta trả tiền
          xong đứng nhìn hình chuồng chờ nó hiện lên. */}
      {gearFree > 0 && (
        <a href={`/chuong/${barnSlug}/dan-ga`}
          className="flex items-center gap-2 rounded-[12px] px-3 py-2.5 mt-2 no-underline"
          style={{ background: "var(--paddy-tint)", border: "1px solid var(--paddy)" }}>
          <span className="flex-none">🧣</span>
          <span className="text-[12.6px] flex-1" style={{ color: "var(--paddy-deep)" }}>
            Bạn còn <b>{gearFree} yếm</b> chưa mặc cho con nào.
          </span>
          <span className="flex-none font-semibold text-[13px]" style={{ color: "var(--paddy)" }}>
            Chọn con ›
          </span>
        </a>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 mt-2.5">
        {shown.map((d) => {
          const s = stock[d.slug];
          const owned = s?.owned ?? 0;
          const inCart = cart[d.slug] ?? 0;
          const inBill = pendingOrder?.items.find((i) => i.slug === d.slug) ?? null;
          const full = roomFor(d.slug) === 0;
          return (
            <div key={d.slug} className="card text-center"
              style={owned > 0 ? { borderColor: "var(--paddy)" } : inCart > 0 ? { borderColor: "var(--yolk)" } : undefined}>
              <div className="h-16 grid place-items-center"><DecorFigure svgKey={d.svgKey} color={d.colorHex} /></div>
              <div className="font-semibold text-[13.5px]">{d.name}</div>
              {d.blurb && <div className="text-[11.6px] mt-0.5 leading-snug" style={{ color: "var(--ink-soft)" }}>{d.blurb}</div>}
              <div className="text-[12px] mt-1" style={{ color: "var(--ink-soft)" }}>{fmtVnd(d.priceVnd)}</div>

              {/* Đang có bao nhiêu cái - con số này là thứ trước đây thiếu hẳn. */}
              <div className="text-[11.4px] mt-0.5 h-4" style={{ color: "var(--paddy-deep)" }}>
                {owned > 0 && `Đang có ${owned} cái${s && s.free > 0 ? ` · ${s.free} trong kho` : ""}`}
              </div>

              {/* Kho NÔNG TRẠI - nói thật là hàng có thật và có lúc hết. Không có dòng
                  này thì người ta bấm mua rồi mới bị từ chối, mất lòng tin ngay. */}
              <div className="text-[11.2px] mb-2 h-4" style={{ color: d.stockQty === 0 ? "#B4472F" : "var(--ink-soft)" }}>
                {d.stockQty === 0
                  ? "Nông trại đang hết hàng"
                  : d.stockQty <= 3 ? `Nông trại chỉ còn ${d.stockQty} cái` : ""}
              </div>

              {d.stockQty === 0 && !inBill ? (
                <button className="btn btn-ghost btn-sm w-full" disabled
                  title="Nông trại sẽ nhập thêm - quay lại sau nhé">
                  Hết hàng · chờ bổ sung
                </button>
              ) : inBill ? (
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
                // "Đầy" vì hai lý do khác hẳn nhau - nói đúng lý do, vì cách xử lý
                // của người dùng khác nhau: một bên là gỡ bớt, một bên là chờ nhập hàng.
                <button className="btn btn-ghost btn-sm w-full" disabled>
                  {owned + (cart[d.slug] ?? 0) >= MAX_PER_ITEM ? `Đủ ${MAX_PER_ITEM} cái` : "Hết hàng ở nông trại"}
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
