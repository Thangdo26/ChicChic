export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  PayoutAccountForm, CancelListingButton, MarketPayBox, RutTienButton, XinHoanTienButton,
  type PayoutAccountVM,
} from "@/components/MarketForms";
import {
  conXinHoanDuoc, REFUND_STATUS_MAU, REFUND_STATUS_VI, type RefundStatus,
} from "@/lib/refund";
import { fmtVnd } from "@/lib/pricing";
import { LOT_TYPE_EMOJI, lotSummary, type LotType } from "@/lib/harvest";
import { LISTING_STATUS_VI, MARKET_ORDER_VI, PAYOUT_STATUS_VI, conLaiCuaDon, conLaiVi } from "@/lib/market";
import { rutDuoc, tinhVi } from "@/lib/wallet";
import { coTraCuuTen } from "@/app/market-actions";

/**
 * Đơn chợ của tôi - cả hai vai trong một trang: lô tôi rao bán, và lô tôi đã mua.
 *
 * Cố ý KHÔNG tách hai trang: ở quy mô này một người vừa bán vừa mua, và bắt họ nhớ hai
 * đường dẫn là thêm một thứ để quên. Ba truy vấn phẳng chạy song song.
 */
export default async function DonCuaToi() {
  const me = await requireUser("/cho/cua-toi");

  const [banRa, muaVao, account, payouts, kyQuy, refunds] = await Promise.all([
    prisma.marketListing.findMany({
      where: { sellerId: me.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true, status: true, priceVnd: true, feeVnd: true, netVnd: true, createdAt: true,
        lot: { select: { type: true, qty: true, weightKg: true, barn: { select: { label: true } } } },
        payout: { select: { status: true, amountVnd: true, proofUrl: true, paidAt: true, requestedAt: true } },
      },
    }),
    // ĐƠN của tôi (§11.45) - không còn liệt kê từng tin đăng: một lần chuyển khoản là
    // một đơn, và đó cũng là đơn vị người mua nhớ.
    prisma.marketOrder.findMany({
      where: { buyerId: me.id, status: { notIn: ["OPEN", "CANCELLED"] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, status: true, payCode: true, createdAt: true,
        goodsVnd: true, shipVnd: true, totalVnd: true, zoneName: true,
        paidAt: true, deliveredAt: true,
        listings: {
          select: {
            id: true, priceVnd: true, status: true, reservedAt: true, paidAt: true, deliveredAt: true,
            lot: { select: { type: true, qty: true, weightKg: true, barn: { select: { label: true } } } },
          },
        },
      },
    }),
    prisma.payoutAccount.findUnique({
      where: { userId: me.id },
      select: { bankName: true, accountNo: true, holderName: true },
    }),
    // Ví: mọi khoản chi của tôi, và phần tiền người mua đã trả mà lô CHƯA giao.
    prisma.payout.findMany({
      where: { userId: me.id },
      select: { amountVnd: true, status: true, requestedAt: true },
    }),
    prisma.marketListing.findMany({
      where: { sellerId: me.id, status: "PAID" },
      select: { netVnd: true, status: true },
    }),
    // Yêu cầu hoàn tiền đơn chợ của tôi, tra theo `sourceId` = id tin đăng.
    prisma.refund.findMany({
      where: { userId: me.id, kind: "MARKET" },
      select: { sourceId: true, status: true, amountVnd: true, paidVnd: true, adminNote: true, paidAt: true },
    }),
  ]);
  const hoanTheoTin = new Map(refunds.map((r) => [r.sourceId, r]));
  const vi = tinhVi(payouts, kyQuy);
  const conRut = rutDuoc(vi);

  const acc: PayoutAccountVM = account ?? null;
  const coTraTen = await coTraCuuTen();

  return (
    <div className="screen">
      <Link href="/cho" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chợ</Link>

      <div className="mt-2">
        <span className="eyebrow">Chợ nông trại</span>
        <h2 className="display text-[19px] mt-0.5">Đơn của tôi</h2>
      </div>

      {/* ---------- VÍ ----------
          Trước bản này người bán không có chỗ nào nhìn thấy tiền của mình: có `Payout`
          trong DB, có một dòng trạng thái nhỏ dưới từng tin đăng, nhưng không con số nào
          trả lời câu duy nhất họ hỏi - "tôi đang có bao nhiêu, bao giờ nhận được?". Và
          không có nút nào để NÓI rằng mình đang chờ.

          ⚠️ Cố ý KHÔNG có ô "tổng đã kiếm được" (§9.29). Một con số cộng dồn kiểu đó là
          cái bảng điều khiển mà mọi app đa cấp đều có, và cả sản phẩm này được dựng để
          không phải là thứ đó. Lịch sử từng khoản vẫn xem được, theo từng dòng, ở khối
          "Tôi rao bán" bên dưới - một danh sách giao dịch là sổ sách, một con số cộng
          dồn là lời mời gọi. */}
      {(vi.rutDuocVnd > 0 || vi.dangKyQuyVnd > 0 || vi.loiSo > 0) && (
        <div className="card mt-3" style={{ background: "linear-gradient(180deg,#FFFDF7,#FBF4E4)", borderColor: "#EBD8AE" }}>
          <div className="font-bold text-[14px]">💰 Tiền bán hàng của bạn</div>

          <div className="flex justify-between items-baseline mt-2.5">
            <span className="text-[13px]">Rút được ngay</span>
            <b className="display text-[20px]" style={{ color: "var(--paddy-deep)" }}>{fmtVnd(vi.rutDuocVnd)}</b>
          </div>

          {vi.dangKyQuyVnd > 0 && (
            <div className="flex justify-between items-baseline mt-1.5 text-[12.8px]" style={{ color: "var(--ink-soft)" }}>
              <span>Đang giữ hộ (chờ giao hàng)</span>
              <span>{fmtVnd(vi.dangKyQuyVnd)}</span>
            </div>
          )}

          {/* Nói RÕ vì sao tiền chưa về, thay vì để người ta nghĩ nông trại giữ tiền.
              Đây cũng chính là thứ bảo vệ họ khi họ ở vai người mua. */}
          {vi.dangKyQuyVnd > 0 && (
            <p className="text-[11.6px] mt-2 leading-snug" style={{ color: "var(--ink-soft)" }}>
              Người mua đã chuyển tiền, nhưng nông trại <b>chỉ chuyển cho bạn sau khi lô được
              giao tận tay và có ảnh trao tay</b>. Đúng luật đó cũng bảo vệ bạn những lúc bạn
              là người mua.
            </p>
          )}

          {vi.loiSo > 0 && (
            <div className="text-[12.4px] mt-2 font-semibold" style={{ color: "#B4472F" }}>
              ⚠️ {vi.loiSo} khoản chuyển lỗi - nông trại đang xử lý, kiểm lại số tài khoản giúp mình nhé.
            </div>
          )}

          {vi.rutDuocVnd > 0 && (acc
            ? <RutTienButton conRut={conRut} />
            : (
              <div className="text-[12.4px] mt-2" style={{ color: "#8A5A1A" }}>
                Điền tài khoản nhận tiền ngay dưới đây là rút được.
              </div>
            ))}
        </div>
      )}

      {/* ---------- Tài khoản nhận tiền ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">🏦 Tài khoản nhận tiền</div>
        <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
          Nông trại chuyển tiền về đây sau khi lô của bạn được giao.{" "}
          <b>Phải điền trước khi đăng bán</b> - thiếu nó thì tiền về mà không biết trả cho ai.
        </p>
        <PayoutAccountForm account={acc} coTraTen={coTraTen} />
      </div>

      {/* ---------- Tôi đã mua ---------- */}
      <div className="label mt-3.5">Đơn tôi đã đặt ({muaVao.length})</div>
      {muaVao.length === 0 ? (
        <div className="soft text-[13px]" style={{ color: "var(--ink-soft)" }}>
          Chưa đặt đơn nào. <Link href="/cho" style={{ color: "var(--paddy)" }}>Xem chợ ›</Link>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {muaVao.map((don) => (
            <div key={don.id} className="card">
              <div className="flex items-center gap-2.5">
                <span className="flex-none text-[18px]">🧺</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px]">
                    {don.listings.length} lô · {new Date(don.createdAt).toLocaleDateString("vi-VN")}
                  </div>
                  <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                    {MARKET_ORDER_VI[don.status] ?? don.status}
                    {don.zoneName ? ` · giao ${don.zoneName}` : ""}
                  </div>
                </div>
                <b className="flex-none text-[14px]">{fmtVnd(don.totalVnd)}</b>
              </div>

              {/* Từng lô trong đơn - và cửa xin hoàn tiền vẫn ở MỨC LÔ: người ta hỏng
                  một lô trong ba, không hỏng cả đơn (§11.38). */}
              {don.listings.map((l) => {
                const type = l.lot.type as LotType;
                const hoan = hoanTheoTin.get(l.id);
                return (
                  <div key={l.id} className="flex items-start gap-2 py-1.5 text-[12.6px]"
                    style={{ borderTop: "1px solid var(--line-soft)" }}>
                    <span className="flex-none">{LOT_TYPE_EMOJI[type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">
                        {lotSummary({ type, qty: l.lot.qty, weightKg: l.lot.weightKg })}
                        <span style={{ color: "var(--ink-soft)" }}> · {l.lot.barn.label}</span>
                      </div>
                      {hoan ? (
                        <div className="font-semibold mt-0.5"
                          style={{ color: REFUND_STATUS_MAU[hoan.status as RefundStatus] }}>
                          ↩️ {REFUND_STATUS_VI[hoan.status as RefundStatus]}
                          {hoan.paidAt && ` · ${fmtVnd(hoan.paidVnd ?? hoan.amountVnd)}`}
                          {hoan.status === "REJECTED" && hoan.adminNote && (
                            <div className="font-normal" style={{ color: "var(--ink-soft)" }}>{hoan.adminNote}</div>
                          )}
                        </div>
                      ) : (
                        conXinHoanDuoc(l) && <XinHoanTienButton listingId={l.id} />
                      )}
                    </div>
                    <span className="flex-none" style={{ color: "var(--ink-soft)" }}>{fmtVnd(l.priceVnd)}</span>
                  </div>
                );
              })}

              {/* Ba con số hiện đủ, kể cả khi phí giao là 0 - im lặng ở chỗ có tiền thì
                  người đọc tự suy ra một con số nào đó, và thường là con số sai. */}
              <div className="soft mt-2 text-[12.4px]">
                <div className="flex justify-between"><span>Tiền hàng</span><span>{fmtVnd(don.goodsVnd)}</span></div>
                <div className="flex justify-between" style={{ color: don.shipVnd > 0 ? "var(--ink-soft)" : "var(--paddy-deep)" }}>
                  <span>Phí giao</span><span>{don.shipVnd > 0 ? fmtVnd(don.shipVnd) : "miễn phí"}</span>
                </div>
                <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: "1px dashed var(--line)" }}>
                  <span>Tổng</span><b>{fmtVnd(don.totalVnd)}</b>
                </div>
              </div>

              {/* Chờ chuyển khoản thì hiện ngay ô QR - không bắt đi tìm ở đâu khác.
                  `REPORTED` cũng vào đây: ô đó tự đổi sang dạng "đang chờ đối soát",
                  và bỏ nó ra là người vừa bấm xác nhận không thấy phản hồi nào. */}
              {(don.status === "RESERVED" || don.status === "REPORTED") && don.payCode && (
                <MarketPayBox
                  orderId={don.id} payCode={don.payCode} priceVnd={don.totalVnd}
                  daBao={don.status === "REPORTED"}
                  conLai={don.status === "RESERVED"
                    ? (() => { const t = conLaiCuaDon(don.listings); return t === null ? null : conLaiVi(t); })()
                    : null}
                />
              )}
              {don.status === "PAID" && (
                <div className="soft mt-2 text-[12.4px]">
                  ✅ Đã thanh toán. Nông dân sẽ giao tận tay và chụp ảnh lúc trao.
                </div>
              )}
              {don.status === "DELIVERED" && (
                <div className="soft mt-2 text-[12.4px]">📦 Đã giao - cảm ơn bạn!</div>
              )}
            </div>
          ))}
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

                {/* Ba con số luôn hiện đủ - chợ nào giấu phí là chợ mất niềm tin. */}
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
                    Đã giao - nông trại đang xếp lịch chuyển tiền.
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
