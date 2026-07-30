"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BREEDS, FEEDING_PLANS, FLOCK_QTY, BASE_PRICES } from "@/data/catalog";
import { priceBreakdown, fmtVnd } from "@/lib/pricing";
import type { ProductLine } from "@/data/catalog";
import { useToast } from "@/components/Toast";

export default function ChooseBarn() {
  const [line, setLine] = useState<ProductLine>("LAYER");
  const [breed, setBreed] = useState("ga-mia");
  const [feed, setFeed] = useState("chuan");
  const [qty, setQty] = useState<number>(FLOCK_QTY.default);
  const [hens, setHens] = useState<string[]>([]);
  const [henInput, setHenInput] = useState("");
  const [sheet, setSheet] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; barnSlug: string | null } | null>(null);
  const toast = useToast();

  // Cùng một lần giữ chỗ dùng đúng một key → bấm 2 lần cũng chỉ ra 1 đơn.
  const idemKey = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`,
  );

  const price = useMemo(() => priceBreakdown(line, feed, qty), [line, feed, qty]);
  const pct = (n: number) => Math.round((n / price.total) * 100);
  const noun = BASE_PRICES[line].noun;

  // Số gà không bao giờ ít hơn số tên đã đặt.
  const setQtySafe = (n: number) => {
    const next = Math.min(FLOCK_QTY.max, Math.max(FLOCK_QTY.min, n));
    if (next < hens.length) {
      toast(`Bạn đã đặt ${hens.length} tên rồi — bỏ bớt tên trước khi giảm đàn.`, "warn");
      return;
    }
    setQty(next);
  };

  /** Đặt thêm tên = thêm một bạn gà vào chuồng → đàn tăng, tiền tăng theo. */
  const addHen = () => {
    const v = henInput.trim();
    if (!v) return;
    if (hens.length >= FLOCK_QTY.max) {
      toast(`Một chuồng tối đa ${FLOCK_QTY.max} ${noun}.`, "warn");
      return;
    }
    const next = [...hens, v];
    setHens(next);
    setHenInput("");
    if (next.length > qty) setQty(next.length); // thêm gà → tăng đàn
  };

  const submit = async () => {
    if (sending) return;
    setSending(true); setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, productLine: line, breedSlug: breed, feedingPlanSlug: feed,
          qty, henNames: hens, idemKey: idemKey.current,
        }),
      });
      const data = await res.json();
      if (data.ok) setDone({ id: data.reservationId, barnSlug: data.barnSlug ?? null });
      else setError(data.error ?? "Có lỗi xảy ra, thử lại giúp mình nhé.");
    } catch {
      setError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally {
      setSending(false);
    }
  };

  const bank = process.env.NEXT_PUBLIC_HOLD_BANK ?? "Ngân hàng · số TK · Chủ TK";

  return (
    <>
      <div className="screen">
        <Link href="/" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Trang chủ</Link>
        <span className="eyebrow block mt-2">Bước 1</span>
        <h2 className="display text-[22px] mt-1 mb-3">Bạn muốn nuôi kiểu nào?</h2>

        <div className="seg">
          <button className={line === "LAYER" ? "on" : ""} onClick={() => { setLine("LAYER"); setBreed("ga-mia"); }}>🥚 Gà đẻ — "pet có ích"</button>
          <button className={line === "BROILER" ? "on" : ""} onClick={() => { setLine("BROILER"); setBreed("ga-mia"); }}>🍗 Gà thịt — một mùa vụ</button>
        </div>
        <p className="lede mt-2.5">
          {line === "LAYER"
            ? 'Bạn đặt tên từng con, nhận trứng đều. Cuối chu kỳ đẻ được chọn: nhận thịt, cho "nghỉ hưu", hay nuôi lứa mới.'
            : "Bạn đồng hành cả đàn từ nhỏ đến ngày thu hoạch — nhận gà sơ chế ship về. Gắn thẻ theo chuồng, thả vườn có kiểm soát."}
        </p>

        <div className="label">Chọn giống</div>
        {BREEDS.map((b) => (
          <div key={b.slug} className={`opt ${breed === b.slug ? "on" : ""}`} onClick={() => setBreed(b.slug)}>
            <div className="w-10 h-10 flex-none rounded-[10px] grid place-items-center" style={{ background: "var(--paper2)" }}>{b.slug === "ga-dong-tao" ? "🐓" : "🐔"}</div>
            <div><div className="font-semibold text-[14.5px]">{b.name}</div><div className="text-[12.3px]" style={{ color: "var(--ink-soft)" }}>{b.story}</div></div>
            <div className="ml-auto text-right text-[12.5px] whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{line === "LAYER" ? b.layerNote : b.broilerNote}</div>
            <div className="opt-check">{breed === b.slug && <span className="block w-[7px] h-[7px] rounded-full bg-white" />}</div>
          </div>
        ))}

        <div className="label">Cách cho ăn</div>
        {FEEDING_PLANS.map((f) => (
          <div key={f.slug} className={`opt ${feed === f.slug ? "on" : ""}`} onClick={() => setFeed(f.slug)}>
            <div className="w-10 h-10 flex-none rounded-[10px] grid place-items-center" style={{ background: "var(--paper2)" }}>{f.emoji}</div>
            <div><div className="font-semibold text-[14.5px]">{f.name} · {f.ratio}</div><div className="text-[12.3px]" style={{ color: "var(--ink-soft)" }}>{f.note}</div></div>
            <div className="opt-check">{feed === f.slug && <span className="block w-[7px] h-[7px] rounded-full bg-white" />}</div>
          </div>
        ))}

        {/* SỐ LƯỢNG — đổi số con là tiền đổi theo */}
        <div className="label">Số {noun} trong chuồng</div>
        <div className="card flex items-center gap-3" style={{ padding: 12 }}>
          <button
            type="button" aria-label={`Bớt một ${noun}`}
            className="qtybtn" onClick={() => setQtySafe(qty - 1)} disabled={qty <= FLOCK_QTY.min}
          >−</button>
          <div className="flex-1 text-center">
            <div className="display font-bold text-[26px] leading-none tabular-nums">{qty}</div>
            <div className="text-[11.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
              {noun} · {fmtVnd(price.perHead)}/{noun}
            </div>
          </div>
          <button
            type="button" aria-label={`Thêm một ${noun}`}
            className="qtybtn" onClick={() => setQtySafe(qty + 1)} disabled={qty >= FLOCK_QTY.max}
          >+</button>
        </div>
        <p className="text-[11.8px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
          Mỗi chuồng nhận từ {FLOCK_QTY.min} đến {FLOCK_QTY.max} {noun}. Thêm hay bớt là tổng tiền bên dưới đổi ngay.
        </p>

        {line === "LAYER" && (
          <>
            <div className="label">
              Đặt tên các &ldquo;bạn&rdquo; gà <span className="font-medium normal-case">(tùy thích · {hens.length}/{qty})</span>
            </div>
            <div className="flex gap-2 items-center mt-2">
              <input value={henInput} maxLength={14} onChange={(e) => setHenInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addHen()}
                placeholder="VD: Gấu, Miu, Đậu…" className="flex-1 rounded-[11px] px-3 py-2.5 text-[14px]" style={{ border: "1.5px solid var(--line)", background: "#fff" }} />
              <button className="btn btn-ghost btn-sm" onClick={addHen} disabled={!henInput.trim() || hens.length >= FLOCK_QTY.max}>Thêm</button>
            </div>
            <p className="text-[11.8px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
              Đặt tên vượt quá số {noun} hiện có thì đàn tự tăng thêm một bạn (và tiền cộng theo).
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {hens.map((h, i) => (
                <span key={i} className="font-semibold text-[12.5px] rounded-full px-2.5 py-1 inline-flex gap-1.5 items-center" style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                  🐔 {h}
                  <button aria-label={`Bỏ tên ${h}`} onClick={() => setHens(hens.filter((_, j) => j !== i))} style={{ color: "var(--paddy)" }}>×</button>
                </span>
              ))}
              {hens.length < qty && (
                <span className="text-[12.5px] rounded-full px-2.5 py-1" style={{ background: "var(--paper2)", color: "var(--ink-soft)" }}>
                  + {qty - hens.length} bạn chưa đặt tên
                </span>
              )}
            </div>
          </>
        )}

        {/* MONEY BREAKDOWN — điểm ký hiệu chống-scam */}
        <div className="money">
          <div className="flex items-center gap-2 font-bold text-[13.5px]" style={{ color: "var(--yolk-deep)" }}>🧾 Tiền của bạn đi về đâu <span className="font-medium" style={{ color: "var(--ink-soft)" }}>(số minh hoạ)</span></div>
          <div className="bar">
            <span style={{ width: `${pct(price.nuoi)}%`, background: "#2F5D3A" }} />
            <span style={{ width: `${pct(price.cong)}%`, background: "#E7A33C" }} />
            <span style={{ width: `${100 - pct(price.nuoi) - pct(price.cong)}%`, background: "#AF6A44" }} />
          </div>
          {[["#2F5D3A", "Chi phí nuôi & nông sản", price.nuoi], ["#E7A33C", "Công cô Lan (nông dân chăm)", price.cong], ["#AF6A44", "Trải nghiệm & vận hành", price.tn]].map(([c, l, a]) => (
            <div key={l as string} className="flex items-center gap-2.5 text-[13px] py-[3px]">
              <span className="w-[9px] h-[9px] rounded-[3px] flex-none" style={{ background: c as string }} />{l as string}
              <span className="ml-auto font-semibold tabular-nums">{fmtVnd(a as number)}</span>
            </div>
          ))}
          <div className="flex justify-between items-baseline mt-2 pt-2.5" style={{ borderTop: "1px dashed #E7D3A6" }}>
            <span className="text-[13px]" style={{ color: "var(--ink-soft)" }}>{price.unit}</span>
            <span className="display text-[22px] font-bold">{fmtVnd(price.total)}</span>
          </div>
          <p className="text-[11.5px] mt-2 leading-snug" style={{ color: "var(--ink-soft)" }}>
            Đây là <b>đặt mua trước nông sản kèm dịch vụ nuôi hộ</b> — không phải kênh đầu tư, không cam kết lãi. Tiêm phòng khi úm đã bao gồm.
          </p>
        </div>
      </div>

      <div className="dock">
        <div className="flex-none text-[12px] leading-tight" style={{ color: "var(--ink-soft)" }}>Từ<b className="block display text-[17px]" style={{ color: "var(--ink)" }}>{fmtVnd(price.total)}</b></div>
        <button className="btn btn-primary flex-1" onClick={() => setSheet(true)}>💚 Giữ chỗ suất này</button>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(24,34,28,.5)" }} onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="w-full max-w-[460px] rounded-t-[22px] p-[22px]" style={{ background: "var(--paper)" }}>
            <div className="w-[38px] h-1 rounded-[3px] mx-auto mb-3.5" style={{ background: "var(--line)" }} />
            {done ? (
              <>
                <h2 className="display text-[20px]">Đã ghi nhận giữ chỗ ✓</h2>
                <p className="lede mt-1.5 mb-3">Mã: <b>{done.id.slice(-6).toUpperCase()}</b>. Vui lòng chuyển <b>50.000đ</b> cọc (hoàn lại) tới:</p>
                <div className="soft text-[13.5px]">{bank}</div>
                <p className="text-[11.7px] mt-3" style={{ color: "var(--ink-soft)" }}>Tụi mình sẽ đối soát tay và liên hệ bạn. Đây là đặt mua trước, có thể hủy & hoàn cọc trước khi vào lứa.</p>
                {done.barnSlug ? (
                  <>
                    <Link href={`/chuong/${done.barnSlug}`} className="btn btn-primary mt-3 no-underline">Vào chuồng của bạn →</Link>
                    <p className="text-[11.7px] mt-2 text-center" style={{ color: "var(--ink-soft)" }}>Chuồng đã được tạo sẵn — vào đặt tên, trang trí và theo dõi ngay.</p>
                  </>
                ) : (
                  <Link href="/chuong/demo" className="btn btn-primary mt-3 no-underline">Xem thử một chuồng đang nuôi →</Link>
                )}
              </>
            ) : (
              <>
                <h2 className="display text-[20px]">Giữ chỗ suất nuôi</h2>
                <p className="lede mt-1.5 mb-3">Nhập email để tụi mình giữ 1 suất thử cho bạn. Cọc 50.000đ (hoàn lại), chuyển khoản/MoMo thật, đối soát tay.</p>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email"
                  placeholder="email của bạn" className="w-full rounded-[11px] px-3 py-3 text-[14px] mb-2" style={{ border: "1.5px solid var(--line)", background: "#fff" }} />
                {error && <p className="text-[12.3px] mb-2" style={{ color: "#B4472F" }}>{error}</p>}
                <p className="text-[11.7px] mb-3" style={{ color: "var(--ink-soft)" }}>Đây là <b>đặt mua trước nông sản + dịch vụ nuôi hộ</b>. Không phải đầu tư, không cam kết lợi nhuận.</p>
                <button className="btn btn-yolk" onClick={submit} disabled={!email.includes("@") || sending}>
                  {sending ? "Đang giữ chỗ…" : "Xác nhận giữ chỗ"}
                </button>
                <button className="btn btn-ghost mt-2" onClick={() => setSheet(false)} disabled={sending}>Để sau</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
