import { BASE_PRICES, FEEDING_PLANS } from "@/data/catalog";
import type { ProductLine } from "@/data/catalog";

export type PriceBreakdown = {
  nuoi: number;  // chi phí nuôi & nông sản
  cong: number;  // công nông dân
  tn: number;    // trải nghiệm & vận hành
  total: number;
  unit: string;
};

// Hệ số feeding chỉ áp lên phần "nuôi" (như prototype).
export function priceBreakdown(line: ProductLine, feedingSlug: string): PriceBreakdown {
  const base = BASE_PRICES[line];
  const mul = FEEDING_PLANS.find((f) => f.slug === feedingSlug)?.priceMultiplier ?? 1;
  const nuoi = Math.round((base.nuoi * mul) / 1000) * 1000;
  const total = nuoi + base.cong + base.tn;
  return { nuoi, cong: base.cong, tn: base.tn, total, unit: base.unit };
}

export const fmtVnd = (n: number) => n.toLocaleString("vi-VN") + "đ";
