"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BREEDS, FEEDING_PLANS, FLOCK_QTY, BASE_PRICES, HEALTH_PACKAGE } from "@/data/catalog";
import { priceBreakdown, fmtVnd } from "@/lib/pricing";
import { defaultBarnName, MAX_BARN_NAME } from "@/lib/decor";
import type { ProductLine } from "@/data/catalog";
import { FarmerAvatar } from "@/components/Illustrations";
import { useToast } from "@/components/Toast";
import type { MediaVM } from "@/components/MediaGallery";
import WorkerProfileDialog from "@/components/WorkerProfileDialog";

/** Hồ sơ nông dân kèm tải hiện tại — server tính sẵn ở /nhan-chuong. */
export type WorkerOption = {
  id: string; name: string; area: string; bio: string | null;
  yearsExp: number; load: number; maxBarns: number; free: number;
  /** tuổi tính từ năm sinh, null nếu chưa khai */ age: number | null;
  /** còn nhận chuồng mới không */ open: boolean;
  /** đang tạm nghỉ (khác với đã kín chỗ) */ paused: boolean;
  /** ảnh/video cô chú tự giới thiệu */ intro: MediaVM[];
};

export default function ChooseBarnForm({
  me, workers,
}: {
  me: { email: string; name: string | null };
  workers: WorkerOption[];
}) {
  const [line, setLine] = useState<ProductLine>("LAYER");
  const [breed, setBreed] = useState("ga-mia");
  const [feed, setFeed] = useState("chuan");
  const [qty, setQty] = useState<number>(FLOCK_QTY.default);
  /** Tên chuồng người dùng tự đặt. Bỏ trống → server dùng tên mặc định. */
  const [barnName, setBarnName] = useState("");
  const [hens, setHens] = useState<string[]>([]);
  const [henInput, setHenInput] = useState("");
  const [health, setHealth] = useState(false);
  const [workerId, setWorkerId] = useState<string>(() => workers.find((w) => w.open)?.id ?? "");
  const [profileId, setProfileId] = useState<string | null>(null); // đang mở hồ sơ của ai
  const [sheet, setSheet] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingBarn, setPendingBarn] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; barnSlug: string | null } | null>(null);
  const toast = useToast();

  // Cùng một lần giữ chỗ dùng đúng một key → bấm 2 lần cũng chỉ ra 1 đơn.
  const idemKey = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`,
  );

  const price = useMemo(() => priceBreakdown(line, feed, qty), [line, feed, qty]);
  const pct = (n: number) => Math.round((n / price.total) * 100);
  // Gói "An tâm" nằm NGOÀI 3 phần của giá nuôi — tách riêng để bảng minh bạch không bị pha loãng.
  const healthVnd = health ? HEALTH_PACKAGE.priceVnd : 0;
  const grandTotal = price.total + healthVnd;
  const noun = BASE_PRICES[line].noun;
  const picked = workers.find((w) => w.id === workerId) ?? null;
  const profile = workers.find((w) => w.id === profileId) ?? null;

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

  const openSheet = () => {
    if (!picked?.open) {
      toast("Chọn giúp mình một nông dân còn nhận chuồng nhé.", "warn");
      return;
    }
    setSheet(true);
  };

  const submit = async () => {
    if (sending) return;
    setSending(true); setError(null); setPendingBarn(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productLine: line, breedSlug: breed, feedingPlanSlug: feed, barnName,
          qty, henNames: hens, workerId, healthPlanOptIn: health, idemKey: idemKey.current,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setDone({ id: data.reservationId, barnSlug: data.barnSlug ?? null });
      } else {
        setError(data.error ?? "Có lỗi xảy ra, thử lại giúp mình nhé.");
        setPendingBarn(data.pendingBarnSlug ?? null);
      }
    } catch {
      setError("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="screen">
        <Link href="/" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Trang chủ</Link>
        <span className="eyebrow block mt-2">Bước 1</span>
        <h2 className="display text-[22px] mt-1 mb-3">Bạn muốn nuôi kiểu nào?</h2>

        <div className="seg">
          <button className={line === "LAYER" ? "on" : ""} onClick={() => { setLine("LAYER"); setBreed("ga-mia"); }}>🥚 Gà đẻ — &ldquo;pet có ích&rdquo;</button>
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

        {/* TÊN CHUỒNG — hiện trên biển tên, trên thẻ chuồng và trong hộp việc của nông dân */}
        <div className="label">
          Đặt tên chuồng <span className="font-medium normal-case">(tùy thích)</span>
        </div>
        <input
          className="inp mt-1"
          value={barnName}
          maxLength={MAX_BARN_NAME}
          onChange={(e) => setBarnName(e.target.value)}
          placeholder={defaultBarnName(line === "LAYER")}
        />
        <div className="flex items-baseline gap-2 mt-1.5">
          <p className="text-[11.8px] flex-1" style={{ color: "var(--ink-soft)" }}>
            Viết hoa, dấu tiếng Việt, emoji đều được. Tên này hiện trên biển tên treo trước chuồng —
            đổi lại lúc nào cũng được.
          </p>
          <span className="text-[11.4px] tabular-nums flex-none" style={{ color: "var(--ink-soft)" }}>
            {Array.from(barnName).length}/{MAX_BARN_NAME}
          </span>
        </div>

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

        {/* NGƯỜI CHĂM — chuồng thuộc về đúng một nông dân */}
        <div className="label">Ai sẽ chăm chuồng này?</div>
        <p className="text-[12.3px] -mt-0.5 mb-1" style={{ color: "var(--ink-soft)" }}>
          Chuồng của bạn thuộc về <b>đúng một</b> cô/chú nông dân — người nhận việc bạn giao và gửi ảnh mỗi ngày.
          Mỗi người nhận tối đa {workers[0]?.maxBarns ?? 15} chuồng để còn chăm kỹ được.
        </p>

        {workers.length === 0 && (
          <div className="soft text-[13px]" style={{ color: "var(--ink-soft)" }}>
            Nông trại chưa khai báo nông dân nào. Chạy <code>npm run db:seed</code> trước nhé.
          </div>
        )}

        {workers.map((w) => (
          <div
            key={w.id}
            className={`opt ${workerId === w.id ? "on" : ""}`}
            style={w.open ? undefined : { opacity: 0.55, cursor: "not-allowed" }}
            onClick={() => w.open && setWorkerId(w.id)}
          >
            <div className="avatar w-11 h-11 flex-none"><FarmerAvatar /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[14.5px] truncate">{w.name}</span>
                {w.intro.length > 0 && (
                  <span className="flex-none text-[10.5px] font-bold rounded-full px-1.5 py-0.5"
                    style={{ background: "var(--yolk-tint)", color: "var(--yolk-deep)" }}>
                    {w.intro.length} ảnh/video
                  </span>
                )}
              </div>
              <div className="text-[12.3px] truncate" style={{ color: "var(--ink-soft)" }}>
                {w.area} · {w.age ? `${w.age} tuổi · ` : ""}{w.yearsExp} năm nuôi gà
              </div>
              {/* Thanh tải — nhìn là biết cô chú đang bận tới đâu */}
              <div className="mt-1.5 rounded-full overflow-hidden" style={{ height: 5, background: "var(--paper2)" }}>
                <div style={{
                  width: `${Math.min(100, Math.round((w.load / w.maxBarns) * 100))}%`, height: "100%",
                  background: w.open ? "var(--paddy)" : "var(--clay)",
                }} />
              </div>
              <div className="text-[11.5px] mt-1" style={{ color: w.open ? "var(--ink-soft)" : "#B4472F" }}>
                {w.open
                  ? `Đang chăm ${w.load}/${w.maxBarns} chuồng · còn nhận ${w.free}`
                  : w.paused
                    ? `Tạm không nhận chuồng mới · đang chăm ${w.load} chuồng`
                    : `Đã kín ${w.load}/${w.maxBarns} chuồng`}
              </div>
            </div>
            {/* ⋯ xem hồ sơ — bấm được KỂ CẢ khi cô chú đã kín chỗ, để khách vẫn tìm hiểu được */}
            <button
              type="button"
              aria-label={`Xem hồ sơ ${w.name}`}
              title="Xem hồ sơ"
              className="flex-none grid place-items-center rounded-full font-bold text-[15px] leading-none"
              style={{ width: 30, height: 30, background: "var(--paper2)", border: "1px solid var(--line)", color: "var(--ink-soft)", cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); setProfileId(w.id); }}
            >⋯</button>

            <div className="opt-check">{workerId === w.id && <span className="block w-[7px] h-[7px] rounded-full bg-white" />}</div>
          </div>
        ))}

        {profile && (
          <WorkerProfileDialog worker={profile} open onClose={() => setProfileId(null)} />
        )}

        {picked?.bio && (
          <p className="text-[12.5px] mt-2 px-1" style={{ color: "var(--ink-soft)" }}>“{picked.bio}”</p>
        )}

        {/* GÓI "AN TÂM" — trả trước để KHÔNG phải quyết định lúc gà đang ốm.
            Cố ý đặt ở đây, lúc người dùng còn bình tĩnh, chứ không upsell giữa cơn bệnh. */}
        <div className="label">Sức khoẻ đàn</div>
        <div
          className={`opt ${health ? "on" : ""}`}
          onClick={() => setHealth((v) => !v)}
          role="checkbox"
          aria-checked={health}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setHealth((v) => !v); } }}
        >
          <div className="grid place-items-center rounded-full flex-none text-[18px]"
            style={{ width: 42, height: 42, background: "var(--paddy-tint)" }}>🩺</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-[14.5px]">Gói &ldquo;An tâm&rdquo;</span>
              <span className="font-semibold text-[13px] tabular-nums" style={{ color: "var(--yolk-deep)" }}>
                +{fmtVnd(HEALTH_PACKAGE.priceVnd)}
              </span>
              <span className="text-[11.5px] ml-auto flex-none" style={{ color: "var(--ink-soft)" }}>tuỳ chọn</span>
            </div>
            <div className="text-[12.3px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
              {HEALTH_PACKAGE.note}
            </div>
          </div>
          <div className="opt-check">{health && <span className="block w-[7px] h-[7px] rounded-full bg-white" />}</div>
        </div>
        <p className="text-[11.8px] mt-1 mb-1 px-1" style={{ color: "var(--ink-soft)" }}>
          Không mua gói thì vẫn ổn — khi đàn cần thuốc, nông trại báo trước kèm ảnh và
          <b> tính đúng giá gốc từng khoản</b>, không lấy lãi trên bệnh tật.
          Tiêm phòng lúc úm theo quy định đã bao gồm sẵn trong giá.
        </p>

        {/* MONEY BREAKDOWN — điểm ký hiệu chống-scam */}
        <div className="money">
          <div className="flex items-center gap-2 font-bold text-[13.5px]" style={{ color: "var(--yolk-deep)" }}>🧾 Tiền của bạn đi về đâu <span className="font-medium" style={{ color: "var(--ink-soft)" }}>(số minh hoạ)</span></div>
          <div className="bar">
            <span style={{ width: `${pct(price.nuoi)}%`, background: "#2F5D3A" }} />
            <span style={{ width: `${pct(price.cong)}%`, background: "#E7A33C" }} />
            <span style={{ width: `${100 - pct(price.nuoi) - pct(price.cong)}%`, background: "#AF6A44" }} />
          </div>
          {[["#2F5D3A", "Chi phí nuôi & nông sản", price.nuoi], ["#E7A33C", `Công ${picked?.name ?? "nông dân"} (người chăm)`, price.cong], ["#AF6A44", "Trải nghiệm & vận hành", price.tn]].map(([c, l, a]) => (
            <div key={l as string} className="flex items-center gap-2.5 text-[13px] py-[3px]">
              <span className="w-[9px] h-[9px] rounded-[3px] flex-none" style={{ background: c as string }} />{l as string}
              <span className="ml-auto font-semibold tabular-nums">{fmtVnd(a as number)}</span>
            </div>
          ))}
          {health && (
            <div className="flex items-center gap-2.5 text-[13px] py-[3px] mt-1 pt-2" style={{ borderTop: "1px dashed #E7D3A6" }}>
              <span className="flex-none">🩺</span>Gói &ldquo;An tâm&rdquo; (trả trước)
              <span className="ml-auto font-semibold tabular-nums">{fmtVnd(healthVnd)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline mt-2 pt-2.5" style={{ borderTop: "1px dashed #E7D3A6" }}>
            <span className="text-[13px]" style={{ color: "var(--ink-soft)" }}>{price.unit}</span>
            <span className="display text-[22px] font-bold">{fmtVnd(grandTotal)}</span>
          </div>
          <p className="text-[11.5px] mt-2 leading-snug" style={{ color: "var(--ink-soft)" }}>
            Đây là <b>đặt mua trước nông sản kèm dịch vụ nuôi hộ</b> — không phải kênh đầu tư, không cam kết lãi. Tiêm phòng khi úm đã bao gồm.
          </p>
        </div>
      </div>

      <div className="dock">
        <div className="flex-none text-[12px] leading-tight" style={{ color: "var(--ink-soft)" }}>Từ<b className="block display text-[17px]" style={{ color: "var(--ink)" }}>{fmtVnd(grandTotal)}</b></div>
        <button className="btn btn-primary flex-1" onClick={openSheet} disabled={!picked?.open}>💚 Giữ chỗ suất này</button>
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(24,34,28,.5)" }} onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="w-full max-w-[460px] rounded-t-[22px] p-[22px]" style={{ background: "var(--paper)" }}>
            <div className="w-[38px] h-1 rounded-[3px] mx-auto mb-3.5" style={{ background: "var(--line)" }} />
            {done ? (
              <>
                <h2 className="display text-[20px]">Đã giữ chỗ — còn một bước nữa 🎉</h2>
                <p className="lede mt-1.5 mb-3">
                  Chuồng của bạn đã được tạo và giao cho <b>{picked?.name}</b>. Bước cuối: chuyển cọc <b>50.000đ</b> (trừ vào hoá đơn tiền nuôi) với nội dung
                  {" "}<b>CHIC {done.id.slice(-6).toUpperCase()}</b> — hướng dẫn đầy đủ nằm ngay trong chuồng.
                </p>
                {done.barnSlug ? (
                  <>
                    <Link href={`/chuong/${done.barnSlug}`} className="btn btn-primary no-underline">Vào chuồng & hoàn tất cọc →</Link>
                    <p className="text-[11.7px] mt-2 text-center" style={{ color: "var(--ink-soft)" }}>
                      Nông trại đối soát xong là chuồng tự mở khoá trang trí và mọi tính năng.
                    </p>
                  </>
                ) : (
                  <Link href="/tai-khoan" className="btn btn-primary mt-3 no-underline">Về danh sách chuồng của tôi →</Link>
                )}
              </>
            ) : (
              <>
                <h2 className="display text-[20px]">Giữ chỗ suất nuôi</h2>
                <p className="lede mt-1.5 mb-2.5">
                  Chuồng sẽ được gắn vào tài khoản của bạn và giao cho <b>{picked?.name}</b>.
                  Cọc 50.000đ (trừ vào hoá đơn tiền nuôi), chuyển khoản/MoMo thật, đối soát tay.
                </p>
                <div className="soft flex items-center gap-2.5 mb-2.5">
                  <span className="grid place-items-center rounded-full font-bold text-[12px] flex-none"
                    style={{ width: 26, height: 26, background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                    {(me.name ?? me.email).trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="text-[13px] min-w-0 truncate">{me.name ? `${me.name} · ` : ""}{me.email}</span>
                </div>
                {error && (
                  <div className="text-[12.3px] mb-2" style={{ color: "#B4472F" }}>
                    {error}
                    {pendingBarn && (
                      <Link href={`/chuong/${pendingBarn}`} className="block font-semibold mt-1" style={{ color: "var(--paddy)" }}>
                        → Hoàn tất cọc chuồng đang chờ
                      </Link>
                    )}
                  </div>
                )}
                <p className="text-[11.7px] mb-3" style={{ color: "var(--ink-soft)" }}>Đây là <b>đặt mua trước nông sản + dịch vụ nuôi hộ</b>. Không phải đầu tư, không cam kết lợi nhuận.</p>
                <button className="btn btn-yolk" onClick={submit} disabled={sending || !workerId}>
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
