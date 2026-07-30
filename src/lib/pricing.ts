import { BASE_PRICES, FEEDING_PLANS, FLOCK_QTY } from "@/data/catalog";
import type { ProductLine } from "@/data/catalog";

export type PriceBreakdown = {
  nuoi: number;  // chi phí nuôi & nông sản
  cong: number;  // công nông dân
  tn: number;    // trải nghiệm & vận hành
  total: number;
  unit: string;
  qty: number;
  perHead: number;
};

/** Ép số lượng về khoảng cho phép (5–10). Dùng ở cả client và server. */
export function clampQty(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return FLOCK_QTY.default;
  return Math.min(FLOCK_QTY.max, Math.max(FLOCK_QTY.min, v));
}

// Hệ số feeding chỉ áp lên phần "nuôi" (như prototype). Cả 3 phần đều nhân theo số con.
export function priceBreakdown(
  line: ProductLine,
  feedingSlug: string,
  qty: number = FLOCK_QTY.default,
): PriceBreakdown {
  const base = BASE_PRICES[line];
  const q = clampQty(qty);
  const mul = FEEDING_PLANS.find((f) => f.slug === feedingSlug)?.priceMultiplier ?? 1;

  const nuoi = Math.round((base.nuoi * mul * q) / 1000) * 1000;
  const cong = base.cong * q;
  const tn = base.tn * q;
  const total = nuoi + cong + tn;

  return {
    nuoi, cong, tn, total, qty: q,
    perHead: Math.round(total / q),
    unit: `${base.period} · ${q} ${base.noun}`,
  };
}

export const fmtVnd = (n: number) => n.toLocaleString("vi-VN") + "đ";
