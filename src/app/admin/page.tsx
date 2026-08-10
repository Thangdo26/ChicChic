export const dynamic = "force-dynamic";
import type { CSSProperties } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { confirmPayment, deleteMedia, setEndOfLay } from "@/app/actions";
import { confirmDecorPayment } from "@/app/decor-actions";
import { confirmCarePayment } from "@/app/care-actions";
import { confirmInvoicePayment, extendInvoiceDue } from "@/app/billing-actions";
import { hoaDonLabel, invoiceTinhTrang } from "@/lib/billing";
import { khoiLabel } from "@/lib/care";
import { toggleWorkerActive } from "@/app/admin-actions";
import { ActionButton } from "@/components/Toast";
import { MediaForm, UpdateForm } from "@/components/AdminForms";
import { CreateWorkerForm, WorkerAccountRow } from "@/components/WorkerAccountForms";
import DecorStockForms, { type StockRow } from "@/components/DecorStockForms";
import BarnHandoverForms, { type HandoverBarn, type HandoverWorker } from "@/components/BarnHandoverForms";
import { MarketPriceForm, PayoutQueue, type LivePrice, type PayoutRow } from "@/components/MarketAdminForms";
import RefundQueue, { type RefundRow } from "@/components/RefundQueue";
import type { RefundKind } from "@/lib/refund";
import { lotSummary, type LotType } from "@/lib/harvest";
import { fmtVnd } from "@/lib/pricing";
import { timeAgo } from "@/lib/decor";

// Nhãn tiếng Việt cho kết quả đối soát của webhook ngân hàng.
const BANK_TXN_LABEL: Record<string, string> = {
  MATCHED: "đã tự xác nhận",
  UNMATCHED: "không khớp đơn",
  DUPLICATE: "đơn đã thanh toán",
  MISMATCH: "thiếu tiền",
};
const BANK_TXN_STYLE: Record<string, CSSProperties> = {
  MATCHED: { background: "var(--paddy-tint, #E7F0E3)", color: "var(--paddy-deep)" },
  UNMATCHED: { background: "#FCEDE9", color: "#8A3A26" },
  DUPLICATE: { background: "var(--paper2)", color: "var(--ink-soft)" },
  MISMATCH: { background: "var(--yolk-tint)", color: "var(--yolk-deep)" },
};

/** Trần cho các danh sách "xem nhanh" ở /admin - trang này để trực, không phải để duyệt hết. */
const FEED = 30;

export default async function Admin() {
  // Nhịp 7 ngày qua - đọc thẳng từ bảng Event. Đây là bản rút gọn; dashboard cohort
  // đầy đủ (funnel, giữ chân theo tuần) thuộc Đợt 3 của roadmap.
  const since = new Date(Date.now() - 7 * 86_400_000);

  // MỘT lượt song song cho cả trang. Trước đây đây là sáu lượt NỐI TIẾP nhau, mà DB
  // ở Mumbai ~1,3s/lượt (CODEMAP §10) - tức ~8 giây chờ chỉ vì xếp hàng, dù không
  // truy vấn nào phụ thuộc kết quả của truy vấn nào.
  const [
    barns, media, reservations, workers, awaiting, pulse, activeUsers,
    decorOrders, careOrders, invoices, flaggedMsgs, bankTxns, bankPending, stockItems, heldRows,
    priceRows, breeds, payouts, orphanBarns, orphanTasks, refunds,
  ] = await Promise.all([
    prisma.barn.findMany({
      orderBy: { createdAt: "asc" },
      take: FEED,
      include: {
        flock: { select: { productLine: true, stage: true, size: true } },
        updates: { orderBy: { createdAt: "desc" }, take: 2 },
        _count: { select: { media: true, decor: true } },
      },
    }),
    prisma.barnMedia.findMany({ orderBy: { createdAt: "desc" }, take: 12, include: { barn: { select: { slug: true, label: true } } } }),
    prisma.reservation.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: true, barn: { select: { slug: true } } } }),
    // Nông dân + tài khoản đăng nhập của họ (cột userId là unique nên 1-1)
    prisma.farmWorker.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, area: true, active: true, maxBarns: true,
        user: { select: { username: true, email: true } },
        _count: { select: { barns: true } },
      },
    }),
    // Đơn chưa xong cọc - REPORTED (user đã báo chuyển) lên đầu vì cần xử lý ngay
    prisma.reservation.findMany({
      where: { paymentStatus: { not: "CONFIRMED" }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
      include: { user: true, barn: { select: { slug: true, label: true } } },
      orderBy: [{ paymentStatus: "desc" }, { createdAt: "asc" }],
      take: FEED,
    }),
    prisma.event.groupBy({
      by: ["name"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    // Đếm người mở app bằng groupBy ngay trong DB. Bản cũ dùng `distinct: ["userId"]`
    // trên findMany: Prisma lọc trùng Ở NODE, nên nó kéo MỌI dòng `barn_opened` của
    // 7 ngày về chỉ để lấy ra một con số.
    prisma.event.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: since }, name: "barn_opened", userId: { not: null } },
    }),
    // Hoá đơn trang trí chờ đối soát. REPORTED (chủ chuồng đã báo chuyển) lên đầu,
    // giống hệt hàng đợi cọc chuồng ở trên.
    prisma.decorOrder.findMany({
      where: { paymentStatus: { not: "CONFIRMED" } },
      orderBy: [{ paymentStatus: "desc" }, { createdAt: "asc" }],
      take: FEED,
      include: {
        user: { select: { name: true, email: true } },
        barn: { select: { slug: true, label: true } },
        items: { select: { priceVnd: true, qty: true, item: { select: { name: true } } } },
      },
    }),
    // Kỳ nuôi dưỡng đàn nghỉ hưu chờ đối soát - cùng hàng đợi, cùng thứ tự với hai loại
    // trên. Khoản này trước đây KHÔNG tồn tại ở đâu cả: chủ chuồng chọn "nghỉ hưu" thì
    // nông trại nuôi tiếp mà không có hoá đơn nào để đối soát (§11.13).
    prisma.careOrder.findMany({
      where: { paymentStatus: { not: "CONFIRMED" } },
      orderBy: [{ paymentStatus: "desc" }, { createdAt: "asc" }],
      take: FEED,
      select: {
        id: true, months: true, totalVnd: true, payCode: true, paymentStatus: true, createdAt: true,
        user: { select: { name: true, email: true } },
        barn: { select: { slug: true, label: true } },
      },
    }),
    // Hoá đơn TIỀN NUÔI chưa trả. Đây là hàng đợi doanh thu chính - trước đợt này nó
    // không tồn tại, sản phẩm thu đúng 50k cọc rồi thôi (§11.13).
    prisma.barnInvoice.findMany({
      where: { paymentStatus: { not: "CONFIRMED" } },
      orderBy: [{ dueAt: "asc" }],
      take: FEED,
      select: {
        id: true, seq: true, totalVnd: true, grossVnd: true, creditVnd: true,
        payCode: true, paymentStatus: true, dueAt: true, createdAt: true,
        user: { select: { name: true, email: true } },
        barn: { select: { slug: true, label: true, flock: { select: { productLine: true } } } },
      },
    }),
    // Hộp thư cần nông trại xem lại. CỐ Ý chỉ lấy tin đã bị gắn cờ hoặc bị báo cáo:
    // đây là toàn bộ quyền đọc tin nhắn của quản trị, và hai bên đã được nói trước
    // luật này ngay trong hộp thư (§9.17). Không nới ra thành "admin đọc tất cả".
    prisma.barnMessage.findMany({
      where: { hiddenAt: null, OR: [{ flagged: true }, { reportedAt: { not: null } }] },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true, body: true, author: true, flagged: true, reportedAt: true, createdAt: true,
        barn: { select: { slug: true, label: true } },
      },
    }),
    // Sổ giao dịch ngân hàng (webhook SePay đẩy về).
    prisma.bankTxn.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.bankTxn.count({ where: { status: { not: "MATCHED" } } }),
    // Kho hàng thật + số đang bị hoá đơn chưa thanh toán giữ chỗ.
    // Đọc THẲNG từ bảng, không qua `cachedDecorItems`: đây là màn người trực nhìn để
    // quyết định nhập hàng, số cũ một tiếng là nhập thừa hoặc nhập thiếu.
    prisma.decorItem.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, slug: true, name: true, stockQty: true, wearable: true, colorHex: true },
    }),
    prisma.decorOrderItem.groupBy({
      by: ["itemId"],
      where: { order: { paymentStatus: { not: "CONFIRMED" } } },
      _sum: { qty: true },
    }),
    // Chợ: giá đang niêm yết + hàng đợi chi trả cho người bán.
    prisma.marketPrice.findMany({
      orderBy: { effectiveFrom: "desc" },
      select: { type: true, breedSlug: true, unitVnd: true, effectiveFrom: true },
    }),
    prisma.breed.findMany({ select: { slug: true, name: true }, orderBy: { name: "asc" } }),
    prisma.payout.findMany({
      where: { status: "PENDING" },
      // Người đã BẤM RÚT lên trước - họ là người đang chờ và biết mình đang chờ. Trong
      // mỗi nhóm thì cũ trước, để không ai bị bỏ quên mãi.
      orderBy: [{ requestedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: FEED,
      select: {
        id: true, amountVnd: true, bankSnapshot: true, createdAt: true, requestedAt: true,
        user: { select: { name: true, email: true } },
        listing: {
          select: { lot: { select: { type: true, qty: true, weightKg: true, barn: { select: { label: true } } } } },
        },
      },
    }),
    // Chuồng đang gắn tên một cô/chú TẠM DỪNG - không ai đăng nhập được để chăm nó.
    // Đây là hàng đợi cứu hoả của §11.9, nên không cắt `take`: bỏ sót một dòng ở đây
    // là bỏ sót một chuồng có người trả tiền mà không có tin.
    prisma.barn.findMany({
      where: { worker: { active: false } },
      orderBy: { label: "asc" },
      select: { id: true, slug: true, label: true, ownerId: true, worker: { select: { name: true } } },
    }),
    // Việc đang treo của đúng nhóm chuồng đó. `groupBy` chứ không phải `_count` có
    // filter - cái sau cần preview feature `filteredRelationCount` (§10).
    prisma.barnTask.groupBy({
      by: ["barnId"],
      where: { status: "OPEN", barn: { worker: { active: false } } },
      _count: { _all: true },
    }),
    // Hàng đợi hoàn tiền. Khoản ĐÃ DUYỆT lên trước: chúng chỉ còn thiếu một lần chuyển
    // khoản, tức là người ở đầu kia đã được hứa và đang đếm ngày.
    prisma.refund.findMany({
      where: { status: { in: ["REQUESTED", "APPROVED"] } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: FEED,
      select: {
        id: true, kind: true, status: true, amountVnd: true, barnLabel: true,
        reason: true, createdAt: true, userId: true, sourceId: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);

  // Tài khoản nhận tiền + tình trạng chi trả cho người bán - hai thứ người trực phải
  // biết TRƯỚC khi bấm. Gộp thành hai truy vấn cho cả hàng đợi, không phải hai mỗi dòng.
  const [refundAccs, refundPayouts] = await Promise.all([
    prisma.payoutAccount.findMany({
      where: { userId: { in: [...new Set(refunds.map((r) => r.userId))] } },
      select: { userId: true, bankName: true, accountNo: true, holderName: true },
    }),
    prisma.payout.findMany({
      where: { listingId: { in: refunds.filter((r) => r.kind === "MARKET").map((r) => r.sourceId) } },
      select: { listingId: true, status: true },
    }),
  ]);

  const pulseOf = (n: string) => pulse.find((p) => p.name === n)?._count._all ?? 0;

  const locked = !!process.env.ADMIN_PASSWORD;
  const webhookOn = !!process.env.SEPAY_WEBHOOK_KEY;
  const barnOptions = barns.map((b) => ({ slug: b.slug, label: b.label }));
  const unlinked = workers.filter((w) => !w.user).map((w) => ({ id: w.id, name: w.name, area: w.area }));

  // Giá ĐANG áp dụng cho mỗi (loại, giống) - `priceRows` đã sắp mới nhất trước, nên
  // dòng đầu tiên gặp của mỗi khoá chính là dòng đang hiệu lực.
  const live: LivePrice[] = [];
  const seen = new Set<string>();
  for (const p of priceRows) {
    const k = `${p.type}-${p.breedSlug ?? "all"}`;
    if (seen.has(k) || new Date(p.effectiveFrom) > new Date()) continue;
    seen.add(k);
    live.push({ type: p.type, breedSlug: p.breedSlug, unitVnd: p.unitVnd });
  }

  const payoutRows: PayoutRow[] = payouts.map((p) => {
    const b = p.bankSnapshot as { bankName?: string; accountNo?: string; holderName?: string } | null;
    const lot = p.listing.lot;
    return {
      id: p.id,
      amountVnd: p.amountVnd,
      sellerName: p.user.name ?? p.user.email,
      bank: b?.accountNo
        ? `${b.bankName ?? ""} · ${b.accountNo} · ${b.holderName ?? ""}`
        : "⚠️ Người bán chưa điền tài khoản nhận tiền",
      lotLabel: `${lotSummary({ type: lot.type as LotType, qty: lot.qty, weightKg: lot.weightKg })} · ${lot.barn.label}`,
      createdAt: p.createdAt.toISOString(),
      requestedAt: p.requestedAt?.toISOString() ?? null,
    };
  });

  const accOf = new Map(refundAccs.map((a) => [a.userId, a]));
  const payoutOf = new Map(refundPayouts.map((p) => [p.listingId, p.status]));
  const refundRows: RefundRow[] = refunds.map((r) => {
    const a = accOf.get(r.userId);
    return {
      id: r.id,
      kind: r.kind as RefundKind,
      status: r.status as "REQUESTED" | "APPROVED",
      amountVnd: r.amountVnd,
      who: r.user.name ?? r.user.email,
      barnLabel: r.barnLabel,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      bank: a ? `${a.bankName} · ${a.accountNo} · ${a.holderName}` : null,
      payoutState: r.kind === "MARKET" ? ((payoutOf.get(r.sourceId) as RefundRow["payoutState"]) ?? "none") : null,
    };
  });

  // Hàng đợi bàn giao: chuồng của cô/chú đang tạm dừng + người còn chỗ để nhận.
  const openTaskOf = new Map(orphanTasks.map((t) => [t.barnId, t._count._all]));
  const handoverRows: HandoverBarn[] = orphanBarns.map((b) => ({
    slug: b.slug, label: b.label,
    workerName: b.worker?.name ?? "-",
    hasOwner: !!b.ownerId,
    openTasks: openTaskOf.get(b.id) ?? 0,
  }));
  // Chỉ người ĐANG hoạt động mới nhận được - bàn giao sang một tài khoản cũng đang
  // tạm dừng là dời nguyên khoảng trống sang chỗ khác. Action kiểm lại cả hai điều
  // kiện này (§9.6): danh sách ở đây chỉ để đỡ bấm hụt.
  const handoverWorkers: HandoverWorker[] = workers
    .filter((w) => w.active)
    .map((w) => ({
      id: w.id, name: w.name, area: w.area,
      free: Math.max(0, w.maxBarns - w._count.barns),
    }));

  const heldById = new Map(heldRows.map((r) => [r.itemId, r._sum.qty ?? 0]));
  const stockRows: StockRow[] = stockItems.map((i) => ({
    slug: i.slug, name: i.name, stockQty: i.stockQty,
    held: heldById.get(i.id) ?? 0,
    wearable: i.wearable, colorHex: i.colorHex,
  }));

  return (
    <div className="screen">
      <span className="eyebrow">Bảng điều khiển nông trại</span>
      <h2 className="display text-[21px] mt-1 mb-3">Quản lý chuồng</h2>

      {!locked && (
        <div className="rounded-[14px] p-3 mb-3 text-[12.7px]" style={{ background: "#FCEDE9", border: "1px solid #F0C9BE", color: "#8A3A26" }}>
          ⚠️ <b>Trang này đang KHÔNG có mật khẩu.</b> Ai biết đường dẫn cũng vào đăng bài được.
          Đặt biến môi trường <code>ADMIN_PASSWORD</code> (trên Vercel: Settings → Environment Variables) rồi deploy lại
          <b> trước khi</b> chia link ra ngoài.
        </div>
      )}

      {/* ---------- Sổ giao dịch ngân hàng ---------- */}
      <div className="card mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-[14px]">🏦 Tiền về tài khoản</span>
          <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
            style={webhookOn
              ? { background: "var(--paddy-tint, #E7F0E3)", color: "var(--paddy-deep)" }
              : { background: "#FCEDE9", color: "#8A3A26" }}>
            {webhookOn ? "webhook đang bật" : "webhook chưa cấu hình"}
          </span>
          {bankPending > 0 && (
            <span className="text-[11px] font-bold rounded-full px-2 py-0.5 ml-auto"
              style={{ background: "var(--yolk-tint)", color: "var(--yolk-deep)" }}>
              {bankPending} khoản cần xem
            </span>
          )}
        </div>
        <p className="text-[12.2px] mt-0.5 mb-2" style={{ color: "var(--ink-soft)" }}>
          {webhookOn
            ? "Khoản nào bóc được mã và đủ tiền thì hệ thống tự xác nhận. Khoản không khớp nằm ở đây để nông trại đối chiếu rồi bấm xác nhận tay ở hàng đợi bên dưới."
            : <>Chưa đặt <code>SEPAY_WEBHOOK_KEY</code> - mọi khoản tiền vẫn phải đối soát tay. Đặt biến trên Vercel rồi deploy lại để bật tự động.</>}
        </p>
        {bankTxns.length === 0 ? (
          <div className="text-[12.4px]" style={{ color: "var(--ink-soft)" }}>Chưa có giao dịch nào được ghi nhận.</div>
        ) : bankTxns.map((t) => (
          <div key={t.id} className="py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="flex items-center gap-2 flex-wrap text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
              <span className="text-[11px] font-bold rounded-full px-2 py-0.5" style={BANK_TXN_STYLE[t.status]}>
                {BANK_TXN_LABEL[t.status]}
              </span>
              <span>{t.gateway}</span>
              <span>· {timeAgo(t.createdAt)}</span>
              <span className="display font-bold text-[14px] ml-auto" style={{ color: "var(--ink)" }}>{fmtVnd(t.amountVnd)}</span>
            </div>
            <div className="text-[12.2px] mt-0.5 break-words">{t.content}</div>
            {t.note && <div className="text-[11.8px] mt-0.5" style={{ color: "#8A3A26" }}>{t.note}</div>}
          </div>
        ))}
      </div>

      {/* ---------- Hoá đơn tiền nuôi ---------- */}
      {invoices.length > 0 && (
        <div className="card mb-3" style={{ borderColor: "#EBD8AE" }}>
          <div className="font-bold text-[14px] mb-0.5">🌾 Tiền nuôi ({invoices.length})</div>
          <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
            Quá hạn thì trang chuồng của chủ chuồng bị khoá - <b>nhưng đàn gà vẫn được chăm
            bình thường</b> (§9.33). Người nào có hoàn cảnh thật thì bấm <b>gia hạn</b>, đừng
            để họ phải tự xoay.
          </p>
          {invoices.map((h) => {
            const tt = invoiceTinhTrang(h);
            const ten = hoaDonLabel(h.barn.flock?.productLine ?? "BROILER", h.seq);
            return (
              <div key={h.id} className="py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[13.4px]">{h.barn.label}</span>
                  <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
                    style={tt === "qua-han"
                      ? { background: "#FBE9E4", color: "#B4472F" }
                      : h.paymentStatus === "REPORTED"
                        ? { background: "var(--yolk-tint)", color: "var(--yolk-deep)" }
                        : { background: "var(--paper2)", color: "var(--ink-soft)" }}>
                    {tt === "qua-han" ? "quá hạn - chuồng đang khoá"
                      : h.paymentStatus === "REPORTED" ? "đã báo chuyển" : "chưa chuyển"}
                  </span>
                  <span className="display font-bold text-[15px] ml-auto">{fmtVnd(h.totalVnd)}</span>
                </div>
                <div className="text-[11.8px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                  {h.user.name ?? h.user.email} · {ten}
                  {h.creditVnd > 0 && ` (${fmtVnd(h.grossVnd)} − ${fmtVnd(h.creditVnd)} cọc)`}
                  {" · hạn "}{h.dueAt.toLocaleDateString("vi-VN")}
                </div>
                <div className="text-[11.8px] mt-0.5">
                  Nội dung chuyển khoản: <b style={{ color: "var(--paddy-deep)" }}>{h.payCode}</b>
                </div>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  <ActionButton action={confirmInvoicePayment.bind(null, h.id)}
                    className="btn btn-primary btn-sm" pendingLabel="Đang xác nhận…">
                    Đã nhận {fmtVnd(h.totalVnd)}
                  </ActionButton>
                  <ActionButton action={extendInvoiceDue.bind(null, h.id, 14)}
                    className="btn btn-ghost btn-sm" pendingLabel="Đang gia hạn…">
                    Gia hạn 14 ngày
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Kỳ nuôi dưỡng đàn nghỉ hưu chờ đối soát ---------- */}
      {careOrders.length > 0 && (
        <div className="card mb-3" style={{ borderColor: "#EBD8AE" }}>
          <div className="font-bold text-[14px] mb-0.5">🌾 Nuôi dưỡng đàn nghỉ hưu ({careOrders.length})</div>
          <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
            Xác nhận xong thì kỳ nuôi dưỡng được cộng thêm và nông dân nhận việc chụp ảnh
            các bạn gà. <b>Chưa đóng tiền thì đàn vẫn được chăm bình thường</b> - đừng gắn
            chuyện tiền vào con vật của người ta.
          </p>
          {careOrders.map((o) => (
            <div key={o.id} className="py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[13.4px]">{o.barn.label}</span>
                <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
                  style={o.paymentStatus === "REPORTED"
                    ? { background: "var(--yolk-tint)", color: "var(--yolk-deep)" }
                    : { background: "var(--paper2)", color: "var(--ink-soft)" }}>
                  {o.paymentStatus === "REPORTED" ? "đã báo chuyển" : "chưa chuyển"}
                </span>
                <span className="display font-bold text-[15px] ml-auto">{fmtVnd(o.totalVnd)}</span>
              </div>
              <div className="text-[11.8px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                {o.user.name ?? o.user.email} · kỳ {khoiLabel(o.months)} · {timeAgo(o.createdAt)}
              </div>
              <div className="text-[11.8px] mt-0.5">
                Nội dung chuyển khoản: <b style={{ color: "var(--paddy-deep)" }}>{o.payCode}</b>
              </div>
              <ActionButton action={confirmCarePayment.bind(null, o.id)}
                className="btn btn-primary btn-sm mt-1.5" pendingLabel="Đang xác nhận…">
                Đã nhận {fmtVnd(o.totalVnd)} - cộng kỳ nuôi dưỡng
              </ActionButton>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Hoá đơn trang trí chờ đối soát ---------- */}
      {decorOrders.length > 0 && (
        <div className="card mb-3" style={{ borderColor: "#EBD8AE" }}>
          <div className="font-bold text-[14px] mb-0.5">🎨 Hoá đơn trang trí ({decorOrders.length})</div>
          <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
            Xác nhận xong thì món mới vào chuồng và nông dân mới nhận việc lắp - chưa xác nhận
            thì chủ chuồng không xếp đặt được gì.
          </p>
          {decorOrders.map((o) => (
            <div key={o.id} className="py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[13.4px]">{o.barn.label}</span>
                <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
                  style={o.paymentStatus === "REPORTED"
                    ? { background: "var(--yolk-tint)", color: "var(--yolk-deep)" }
                    : { background: "var(--paper2)", color: "var(--ink-soft)" }}>
                  {o.paymentStatus === "REPORTED" ? "đã báo chuyển" : "chưa chuyển"}
                </span>
                <span className="display font-bold text-[15px] ml-auto">{fmtVnd(o.totalVnd)}</span>
              </div>
              <div className="text-[11.8px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                {o.user.name ?? o.user.email} · {o.items.map((r) => (r.qty > 1 ? `${r.item.name} ×${r.qty}` : r.item.name)).join(", ")} · {timeAgo(o.createdAt)}
              </div>
              <div className="text-[11.8px] mt-0.5">
                Nội dung chuyển khoản: <b style={{ color: "var(--paddy-deep)" }}>{o.payCode}</b>
              </div>
              <ActionButton action={confirmDecorPayment.bind(null, o.id)}
                className="btn btn-primary btn-sm mt-1.5" pendingLabel="Đang xác nhận…">
                Đã nhận {fmtVnd(o.totalVnd)} - mở khoá món
              </ActionButton>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Tin nhắn cần xem lại ---------- */}
      {flaggedMsgs.length > 0 && (
        <div className="card mb-3" style={{ borderColor: "#EBD8AE" }}>
          <div className="font-bold text-[14px] mb-0.5">🚩 Tin nhắn cần xem lại ({flaggedMsgs.length})</div>
          <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
            Nông trại <b>chỉ</b> đọc được hộp thư có tin bị gắn cờ hoặc bị báo cáo - cả hai bên
            đều đã được nói trước luật này. Bấm vào chuồng để đọc cả hộp thư.
          </p>
          {flaggedMsgs.map((m) => (
            <div key={m.id} className="py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <div className="flex items-center gap-1.5 flex-wrap text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
                <span className="font-semibold" style={{ color: "var(--ink)" }}>{m.barn.label}</span>
                <span>· {m.author === "OWNER" ? "chủ chuồng" : "nông dân"}</span>
                <span>· {timeAgo(m.createdAt)}</span>
                {m.reportedAt && <span className="font-bold" style={{ color: "#8A3A26" }}>· ĐÃ BỊ BÁO CÁO</span>}
                {m.flagged && !m.reportedAt && <span>· nghi trao đổi ngoài app</span>}
              </div>
              <div className="text-[13px] mt-0.5">{m.body.slice(0, 220)}</div>
              {/* Phải trỏ vào /admin/... - trình duyệt chỉ gửi kèm Basic Auth cho đường
                  dẫn trong cùng realm, và trang hộp thư của chủ chuồng thì bắt đăng nhập. */}
              <Link href={`/admin/tin-nhan/${m.barn.slug}?tin=${m.id}`} className="text-[12px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>
                Mở hộp thư ›
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Nhịp 7 ngày ---------- */}
      <div className="card mb-3">
        <div className="font-bold text-[14px] mb-0.5">📊 Nhịp 7 ngày qua</div>
        <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
          Đo từ hành vi thật, không phải đếm tay. Chuyển đổi = số cọc đã xác nhận / số lượt giữ chỗ.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { k: "Chủ chuồng mở app", v: activeUsers.length, hint: "người khác nhau" },
            { k: "Giữ chỗ", v: pulseOf("barn_reserved"), hint: "đơn mới" },
            { k: "Cọc đã xác nhận", v: pulseOf("deposit_confirmed"), hint: "trả tiền thật" },
            { k: "Việc đã giao", v: pulseOf("task_requested"), hint: "chủ chuồng → nông dân" },
            { k: "Việc xong có ảnh", v: pulseOf("task_done"), hint: "kèm minh chứng" },
            { k: "Món decor đã lắp", v: pulseOf("decor_installed"), hint: "doanh thu phụ" },
          ].map((s) => (
            <div key={s.k} className="rounded-[12px] p-2" style={{ background: "var(--paper2)", border: "1px solid var(--line)" }}>
              <div className="display text-[19px] font-bold tabular-nums">{s.v}</div>
              <div className="text-[11.4px] font-semibold leading-tight">{s.k}</div>
              <div className="text-[10.6px]" style={{ color: "var(--ink-soft)" }}>{s.hint}</div>
            </div>
          ))}
        </div>
        {pulseOf("barn_reserved") > 0 && (
          <div className="text-[12.3px] mt-2 pt-2" style={{ borderTop: "1px dashed var(--line)", color: "var(--ink-soft)" }}>
            Chuyển đổi giữ chỗ → trả tiền:{" "}
            <b style={{ color: "var(--ink)" }}>
              {Math.round((pulseOf("deposit_confirmed") / pulseOf("barn_reserved")) * 100)}%
            </b>
            {pulseOf("barn_returned") > 0 && <> · đã hoàn trả <b style={{ color: "#B4472F" }}>{pulseOf("barn_returned")}</b> chuồng</>}
          </div>
        )}
      </div>

      {/* ---------- Tổng quan chuồng ---------- */}
      <div className="card">
        <div className="font-bold text-[14px] mb-1.5">Các chuồng ({barns.length})</div>
        {barns.map((b) => (
          <div key={b.id} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13.3px] truncate">{b.label}</div>
              <div className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>
                /{b.slug} · {b.flock?.productLine === "LAYER" ? "gà đẻ" : "gà thịt"} · {b.flock?.stage ?? "-"} ·
                {" "}{b._count.media} media · {b._count.decor} decor
              </div>
            </div>
            <Link href={`/chuong/${b.slug}`} className="btn btn-ghost btn-sm flex-none no-underline">Mở</Link>
          </div>
        ))}
      </div>

      {/* ---------- Đối soát cọc ---------- */}
      <div className="card mt-3" style={awaiting.some((r) => r.paymentStatus === "REPORTED") ? { borderColor: "var(--yolk)" } : undefined}>
        <div className="font-bold text-[14px] mb-1">💰 Đối soát cọc ({awaiting.length} đơn chờ)</div>
        <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
          Kiểm tra tài khoản ngân hàng/MoMo có khoản đúng <b>nội dung CK</b> rồi bấm xác nhận -
          chuồng của khách sẽ <b>tự mở khoá</b> ngay (trang bên khách tự cập nhật, không cần họ tải lại).
        </p>
        {awaiting.length === 0 && <div className="text-[12.8px]" style={{ color: "var(--ink-soft)" }}>Không có đơn nào chờ đối soát 🎉</div>}
        {awaiting.map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-2.5" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-[12.9px] truncate">
                <b className="tabular-nums">{r.payCode}</b> · {fmtVnd(r.depositVnd)} · {r.user.email}
              </div>
              <div className="text-[11.4px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                {r.paymentStatus === "REPORTED"
                  ? <b style={{ color: "var(--yolk-deep)" }}>⏳ Khách đã báo chuyển {r.reportedAt ? timeAgo(r.reportedAt) : ""} - kiểm tra & xác nhận</b>
                  : "Chưa thấy khách báo chuyển"}
                {r.barn && <> · {r.barn.label}</>}
              </div>
            </div>
            <ActionButton
              action={confirmPayment.bind(null, r.id)}
              className="btn btn-yolk btn-sm flex-none"
              confirm={`Xác nhận ĐÃ NHẬN ${fmtVnd(r.depositVnd)} với nội dung "${r.payCode}"?`}
              pendingLabel="Đang xác nhận…"
            >Đã nhận tiền</ActionButton>
          </div>
        ))}
      </div>

      {/* ---------- Kho hàng thật ----------
          Đặt ngay sau hàng đợi tiền: người trực xác nhận xong một hoá đơn thì việc kế
          tiếp là xem còn đủ hàng để giao không. */}
      <DecorStockForms rows={stockRows} />

      {/* ---------- Chợ nông trại ---------- */}
      <MarketPriceForm live={live} breeds={breeds} />
      <PayoutQueue rows={payoutRows} />
      <RefundQueue rows={refundRows} />

      {/* ---------- Bàn giao chuồng (tự ẩn khi không có chuồng nào kẹt) ---------- */}
      <BarnHandoverForms rows={handoverRows} workers={handoverWorkers} />

      {/* ---------- Tài khoản nông dân ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">👩‍🌾 Tài khoản nông dân ({workers.length})</div>
        <p className="text-[12.2px] mb-2.5" style={{ color: "var(--ink-soft)" }}>
          Các cô chú <b>không tự đăng ký</b> được. Bạn đặt tên đăng nhập + mật khẩu ở đây rồi
          đưa tận tay; cô/chú vào <b>/dang-nhap</b> gõ đúng hai thứ đó là thấy chuồng và việc của mình.
        </p>

        <p className="text-[11.6px] mb-1" style={{ color: "var(--ink-soft)" }}>
          💡 Bấm vào <b>tên</b> một cô/chú để xem tên đăng nhập và đặt mật khẩu mới.
          Nút <b>Tạm dừng</b> khoá đăng nhập của người đó và đăng xuất khỏi mọi thiết bị.
        </p>

        {workers.map((w) => (
          <div key={w.id} className="flex items-center gap-2 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <WorkerAccountRow
              worker={{
                id: w.id, name: w.name, area: w.area, active: w.active, maxBarns: w.maxBarns,
                barns: w._count.barns, username: w.user?.username ?? null, email: w.user?.email ?? null,
              }}
            />
            <ActionButton
              action={toggleWorkerActive.bind(null, w.id)}
              className="btn btn-ghost btn-sm flex-none"
              style={w.active ? { color: "#B4472F", borderColor: "#F0CFC6" } : undefined}
              pendingLabel="…"
              confirm={w.active
                ? `Tạm dừng ${w.name}?\n\n• Cô/chú KHÔNG đăng nhập được nữa và bị đăng xuất khỏi mọi thiết bị.\n• Không nhận chuồng mới.${
                  w._count.barns > 0
                    ? `\n• ${w._count.barns} chuồng đang chăm vẫn gắn tên cô/chú và SẼ KHÔNG CÓ TIN MỚI.\n\nTạm dừng xong, khối "🔄 Chuồng đang không có người chăm" ở ngay trên sẽ hiện ${w._count.barns} chuồng đó để bạn bàn giao sang cô/chú khác.`
                    : ""}`
                : undefined}
            >{w.active ? "Tạm dừng" : "Mở lại"}</ActionButton>
          </div>
        ))}

        <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--line)" }}>
          <div className="font-semibold text-[13.2px] mb-2">Cấp tài khoản mới</div>
          <CreateWorkerForm pending={unlinked} />
        </div>
      </div>

      {/* ---------- Đăng ảnh / video ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">📷 Gửi ảnh / video cho chủ chuồng</div>
        <p className="text-[12.2px] mb-2.5" style={{ color: "var(--ink-soft)" }}>
          Dán URL ảnh hoặc video. Dùng được: link công khai từ <b>Supabase Storage</b>, link <b>YouTube</b> (tự chuyển sang dạng nhúng),
          hoặc file <code>.mp4</code>.
        </p>
        <MediaForm barns={barnOptions} />
      </div>

      {/* ---------- Media gần đây ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1.5">Ảnh/video gần đây</div>
        {media.length === 0 && <div className="text-[12.8px]" style={{ color: "var(--ink-soft)" }}>Chưa có gì.</div>}
        {media.map((m) => (
          <div key={m.id} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <span className="text-[15px] flex-none">{m.type === "VIDEO" ? "🎬" : "🖼️"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.8px] truncate">{m.caption ?? m.url}</div>
              <div className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>{m.barn.slug} · {timeAgo(m.createdAt)}</div>
            </div>
            <ActionButton
              action={deleteMedia.bind(null, m.id, m.barn.slug)}
              className="btn btn-ghost btn-sm flex-none"
              style={{ color: "#B4472F", borderColor: "#F0CFC6" }}
              confirm="Xoá mục này khỏi chuồng?"
              pendingLabel="Đang xoá…"
            >Xoá</ActionButton>
          </div>
        ))}
      </div>

      {/* ---------- Đăng ghi chú ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1.5">📝 Đăng cập nhật (không kèm ảnh)</div>
        <UpdateForm barns={barnOptions} />
      </div>

      {/* ---------- Đơn giữ chỗ ---------- */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1.5">💚 Đơn giữ chỗ ({reservations.length})</div>
        {reservations.length === 0 && <div className="text-[12.8px]" style={{ color: "var(--ink-soft)" }}>Chưa có đơn nào.</div>}
        {reservations.map((r) => (
          <div key={r.id} className="flex items-center gap-2 py-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="flex-1 min-w-0">
              <div className="text-[12.9px] truncate"><b>{r.user.email}</b> · {r.productLine === "LAYER" ? "gà đẻ" : "gà thịt"}</div>
              <div className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>
                {r.status} · {r.paymentStatus === "CONFIRMED" ? "✓ đã cọc" : r.paymentStatus === "REPORTED" ? "⏳ chờ đối soát" : "chưa cọc"} · {fmtVnd(r.priceEstimateVnd)} · {timeAgo(r.createdAt)}
                {r.henNames.length > 0 && ` · ${r.henNames.join(", ")}`}
              </div>
            </div>
            {r.barn && <Link href={`/chuong/${r.barn.slug}`} className="btn btn-ghost btn-sm flex-none no-underline">Chuồng</Link>}
          </div>
        ))}
      </div>

      {/* ---------- Dev ----------
          Nút ép đàn sang END_OF_LAY là công cụ test, KHÔNG phải nghiệp vụ: nó bỏ qua
          cả chu kỳ đẻ thật. Chỉ hiện khi chạy cục bộ, không bao giờ trên bản đã bán. */}
      {process.env.NODE_ENV !== "production" && (
        <div className="card mt-3" style={{ borderStyle: "dashed" }}>
          <div className="font-bold text-[14px] mb-1.5">Dev - đánh dấu hết chu kỳ đẻ (test màn kết chu kỳ)</div>
          {barns.filter((b) => b.flock?.productLine === "LAYER").map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 py-1.5" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <span className="text-[13px] min-w-0 truncate">{b.label} <span style={{ color: "var(--ink-soft)" }}>({b.flock?.stage})</span></span>
              <ActionButton
                action={setEndOfLay.bind(null, b.slug)}
                className="btn btn-ghost btn-sm flex-none"
                disabled={b.flock?.stage === "END_OF_LAY"}
                pendingLabel="Đang đặt…"
              >Đặt END_OF_LAY</ActionButton>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
