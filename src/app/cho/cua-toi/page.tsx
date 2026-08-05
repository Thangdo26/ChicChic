export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  PayoutAccountForm, CancelListingButton, MarketPayBox, type PayoutAccountVM,
} from "@/components/MarketForms";
import { fmtVnd } from "@/lib/pricing";
import { LOT_TYPE_EMOJI, lotSummary, type LotType } from "@/lib/harvest";
import { LISTING_STATUS_VI, PAYOUT_STATUS_VI } from "@/lib/market";

/**
 * Đơn chợ của tôi — cả hai vai trong một trang: lô tôi rao bán, và lô tôi đã mua.
 *
 * Cố ý KHÔNG tách hai trang: ở quy mô này một người vừa bán vừa mua, và bắt họ nhớ hai
 * đường dẫn là thêm một thứ để quên. Ba truy vấn phẳng chạy song song.
 */
export default async function DonCuaToi() {
  const me = await requireUser("/cho/cua-toi");

  const [banRa, muaVao, account] = await Promise.all([
    prisma.marketListing.findMany({
      where: { sellerId: me.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, status: true, priceVnd: true, feeVnd: true, netVnd: true, createdAt: true,
        lot: { select: { type: true, qty: true, weightKg: true, barn: { select: { label: true } } } },
        payout: { select: { status: true, amountVnd: true, proofUrl: true, paidAt: true } },
      },
    }),
    prisma.marketListing.findMany({
      where: { buyerId: me.id, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, status: true, priceVnd: true, payCode: true, createdAt: true,
        lot: { select: { type: true, qty: true, weightKg: true, barn: { select: { slug: true, label: true } } } },
      },
    }),
    prisma.payoutAccount.findUnique({
      where: { userId: me.id },
      select: { bankName: true, accountNo: true, holderName: true },
    }),
  ]);

  const acc: PayoutAccountVM = account ?? null;

  return (
    <div className="screen">
      <Link href="/cho" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chợ</Link>

      <div className="mt-2">
        <span className="eyebrow">Chợ nông trại</span>
        <h2 className="display text-[19px] mt-0.5">Đơn của tôi</h2>
      </div>

      {/* ---------- Tài khoản nhận tiền ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">🏦 Tài khoản nhận tiền</div>
        <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
          Nông trại chuyển tiền về đây sau khi lô của bạn được giao.{" "}
          <b>Phải điền trước khi đăng bán</b> — thiếu nó thì tiền về mà không biết trả cho ai.
        </p>
        <PayoutAccountForm account={acc} />
      </div>

      {/* ---------- Tôi đã mua ---------- */}
      <div className="label mt-3.5">Tôi đã mua ({muaVao.length})</div>
      {muaVao.length === 0 ? (
        <div className="soft text-[13px]" style={{ color: "var(--ink-soft)" }}>
          Chưa mua lô nào. <Link href="/cho" style={{ color: "var(--paddy)" }}>Xem chợ ›</Link>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {muaVao.map((l) => {
            const type = l.lot.type as LotType;
            return (
              <div key={l.id} className="card">
                <div className="flex items-center gap-2.5">
                  <span className="flex-none text-[18px]">{LOT_TYPE_EMOJI[type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px]">
                      {lotSummary({ type, qty: l.lot.qty, weightKg: l.lot.weightKg })}
                    </div>
                    <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                      {l.lot.barn.label} · {LISTING_STATUS_VI[l.status] ?? l.status}
                    </div>
                  </div>
                  <b className="flex-none text-[14px]">{fmtVnd(l.priceVnd)}</b>
                </div>
                {/* Chờ chuyển khoản thì hiện ngay ô QR — không bắt đi tìm ở đâu khác. */}
                {l.status === "RESERVED" && l.payCode && (
                  <MarketPayBox payCode={l.payCode} priceVnd={l.priceVnd} />
                )}
                {l.status === "PAID" && (
                  <div className="soft mt-2 text-[12.4px]">
                    ✅ Đã thanh toán. Nông dân sẽ giao tận tay và chụp ảnh lúc trao.
                  </div>
                )}
                {l.status === "DELIVERED" && (
                  <div className="soft mt-2 text-[12.4px]">📦 Đã giao — cảm ơn bạn!</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Tôi rao bán ---------- */}
      <div className="label mt-3.5">Tôi rao bán ({banRa.length})</div>
      {banRa.length === 0 ? (
        <div className="soft text-[13px]" style={{ color: "var(--ink-soft)" }}>
          Chưa đăng lô nào. Mở <b>Sổ thu hoạch</b> của một chuồng để đăng bán lô bạn không nhận được.
        </div>
      ) : (
        <div className="grid gap-2.5">
          {banRa.map((l) => {
            const type = l.lot.type as LotType;
            return (
              <div key={l.id} className="card">
                <div className="flex items-center gap-2.5">
                  <span className="flex-none text-[18px]">{LOT_TYPE_EMOJI[type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px]">
                      {lotSummary({ type, qty: l.lot.qty, weightKg: l.lot.weightKg })}
                    </div>
                    <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                      {l.lot.barn.label} · {LISTING_STATUS_VI[l.status] ?? l.status}
                    </div>
                  </div>
                  {(l.status === "LISTED" || l.status === "RESERVED") && (
                    <CancelListingButton listingId={l.id} />
                  )}
                </div>

                {/* Ba con số luôn hiện đủ — chợ nào giấu phí là chợ mất niềm tin. */}
                <div className="soft mt-2 text-[12.4px]">
                  <div className="flex justify-between"><span>Giá bán</span><span>{fmtVnd(l.priceVnd)}</span></div>
                  <div className="flex justify-between" style={{ color: "var(--ink-soft)" }}>
                    <span>Phí nông trại</span><span>−{fmtVnd(l.feeVnd)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: "1px dashed var(--line)" }}>
                    <span>Bạn nhận</span><b style={{ color: "var(--paddy-deep)" }}>{fmtVnd(l.netVnd)}</b>
                  </div>
                </div>

                {l.payout && (
                  <div className="text-[12.4px] mt-1.5 font-semibold"
                    style={{ color: l.payout.status === "PAID" ? "var(--paddy-deep)" : "var(--yolk-deep)" }}>
                    💸 {PAYOUT_STATUS_VI[l.payout.status] ?? l.payout.status}
                    {l.payout.paidAt && ` · ${new Date(l.payout.paidAt).toLocaleDateString("vi-VN")}`}
                    {l.payout.proofUrl && (
                      <>
                        {" · "}
                        <a href={l.payout.proofUrl} target="_blank" rel="noreferrer"
                          style={{ color: "var(--paddy)" }}>xem biên lai</a>
                      </>
                    )}
                  </div>
                )}
                {l.status === "DELIVERED" && !l.payout && (
                  <div className="text-[12.4px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
                    Đã giao — nông trại đang xếp lịch chuyển tiền.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
