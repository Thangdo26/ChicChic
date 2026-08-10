export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { BuyButton } from "@/components/MarketForms";
import { fmtVnd } from "@/lib/pricing";
import {
  LOT_KEEP_DAYS, LOT_TYPE_EMOJI, STORAGE_VI, keepLabel, lotSummary,
  type LotType, type StorageMode,
} from "@/lib/harvest";
import { MARKET_FEE_PERCENT } from "@/lib/market";

/**
 * CHỢ NÔNG TRẠI - nơi người nuôi chuyển lại lô hàng mình không nhận được.
 *
 * ⚠️ ĐÂY LÀ TRANG DUY NHẤT TRONG APP ĐỌC CHÉO NHIỀU CHUỒNG. Mọi trang khác đều khoá
 * vào một `barnId`, nên chúng không bao giờ trả về nhiều hơn dữ liệu của một chuồng.
 * Ba luật bắt buộc ở đây (§8):
 *   1. LUÔN có `take` - sổ này chỉ dài thêm theo thời gian;
 *   2. `select` tường minh, KHÔNG `include` lồng - mỗi quan hệ là một truy vấn riêng,
 *      ba quan hệ = ba truy vấn cho CẢ TRANG, không phải cho mỗi dòng;
 *   3. lọc hạn ngay trong `WHERE` (có chỉ mục), không kéo về Node rồi `.filter()`.
 */
const PAGE = 20;

export default async function Cho() {
  const me = await requireUser("/cho");

  // Hạn giữ hộ lọc TRONG DB. Lô quá hạn không được rao - và không cần job nền nào để
  // dọn, vì điều kiện nằm ngay trong câu truy vấn (repo chưa có job nào, §11.10).
  const conHan = new Date(Date.now() - LOT_KEEP_DAYS * 86_400_000);

  const [rows, myBarns, banDuoc] = await Promise.all([
    prisma.marketListing.findMany({
      where: { status: "LISTED", lot: { collectedAt: { gte: conHan } } },
      // Lô SẮP HẾT HẠN lên trước: giá như nhau nên người mua không chọn theo giá, và
      // xếp kiểu này vừa công bằng cho người bán vừa giảm hàng bỏ phí.
      orderBy: { lot: { collectedAt: "asc" } },
      take: PAGE,
      select: {
        id: true, priceVnd: true, sellerId: true,
        lot: {
          select: {
            type: true, qty: true, weightKg: true, collectedAt: true, storage: true,
            barn: { select: { slug: true, label: true } },
            proofMedia: { select: { url: true } },
          },
        },
        seller: { select: { name: true } },
      },
    }),
    // Chuồng của tôi - vừa là cổng mua (phải có ≥1 chuồng), vừa là lối sang sổ thu hoạch.
    prisma.barn.findMany({
      where: { ownerId: me.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, label: true },
    }),
    // Đếm lô CÓ THỂ BÁN của từng chuồng: còn ở nông trại và còn trong hạn giữ hộ.
    //
    // `groupBy` chứ KHÔNG phải `_count` có filter - cùng lý do đã ghi ở §10, và nó cho
    // luôn số theo từng chuồng trong một lượt đi–về thay vì một truy vấn mỗi chuồng.
    prisma.harvestLot.groupBy({
      by: ["barnId"],
      where: { ownerId: me.id, status: "AT_FARM", collectedAt: { gte: conHan } },
      _count: { _all: true },
    }),
  ]);

  const coChuong = myBarns.length;
  const banDuocBy = new Map(banDuoc.map((r) => [r.barnId, r._count._all]));
  const tongBanDuoc = banDuoc.reduce((s, r) => s + r._count._all, 0);

  return (
    <div className="screen">
      <span className="eyebrow">Chợ nông trại</span>
      <h2 className="display text-[21px] mt-1 mb-1.5">Lô hàng đang chờ chủ mới</h2>
      <p className="lede">
        Người nuôi bận không nhận được hàng thì chuyển lại cho người khác.{" "}
        <b>Hàng vẫn ở nông trại</b> - mua xong nông trại giao thẳng cho bạn, kèm ảnh lúc trao.
      </p>

      <div className="flex gap-2.5 rounded-[13px] p-[11px] mt-3 text-[12.4px]"
        style={{ background: "var(--paddy-tint)", border: "1px solid var(--paddy)", color: "var(--paddy-deep)" }}>
        🔎 <div>
          Mỗi lô đều biết <b>từ chuồng nào, thu ngày nào, ai chăm</b> và có ảnh chụp lúc thu.
          Giá do nông trại niêm yết - người bán không tự đặt giá.
        </div>
      </div>

      {coChuong === 0 && (
        <div className="flex gap-2.5 rounded-[13px] p-[11px] mt-2.5 text-[12.4px]"
          style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE", color: "var(--yolk-deep)" }}>
          🔒 <div>
            Chợ dành cho người <b>đang nhận nuôi chuồng</b>. Bạn xem được, nhưng cần có một
            chuồng mới mua được. <Link href="/nhan-chuong" style={{ color: "var(--paddy)" }}>Nhận chuồng ›</Link>
          </div>
        </div>
      )}

      {/* ---------- Tôi có gì để bán ----------
          Chợ mà chỉ cho xem hàng người khác thì người bán không biết mình đang có gì.
          Khối này trả lời đúng câu "tôi có lô nào bán được không" ngay tại đây, và mỗi
          chuồng là một lối bấm thẳng sang sổ thu hoạch của nó.

          Hạn giữ hộ đã lọc TRONG DB (`conHan`) nên con số này là số lô THẬT SỰ đăng bán
          được - đếm cả lô quá hạn rồi để người ta bấm vào mới biết không bán được là
          hứa hão. */}
      {coChuong > 0 && (
        <div className="card mt-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-[14px]">🧺 Tôi có gì để bán</div>
            <Link href="/cho/cua-toi" className="text-[12.6px] font-semibold no-underline whitespace-nowrap"
              style={{ color: "var(--paddy)" }}>Đơn của tôi ›</Link>
          </div>
          <p className="text-[12.2px] mt-0.5 mb-1.5" style={{ color: "var(--ink-soft)" }}>
            {tongBanDuoc > 0
              ? <>Bạn đang có <b style={{ color: "var(--paddy-deep)" }}>{tongBanDuoc} lô</b> còn trong hạn nông trại giữ hộ - mở sổ thu hoạch để đăng bán.</>
              : <>Chưa có lô nào đăng bán được. Khi cô chú nhặt trứng và ghi vào sổ, lô sẽ hiện ở đây.</>}
          </p>

          {myBarns.map((b) => {
            const n = banDuocBy.get(b.id) ?? 0;
            return (
              <Link key={b.id} href={`/chuong/${b.slug}/thu-hoach`}
                className="flex items-center gap-2.5 py-2 no-underline"
                style={{ borderTop: "1px solid var(--line-soft)" }}>
                <span className="flex-none text-[15px]">{n > 0 ? "🥚" : "🐔"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13.2px] truncate" style={{ color: "var(--ink)" }}>{b.label}</div>
                  <div className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>
                    {n > 0 ? `${n} lô bán được` : "chưa có lô nào bán được"}
                  </div>
                </div>
                <span className="flex-none text-[12.4px] font-semibold whitespace-nowrap"
                  style={{ color: "var(--paddy)" }}>Sổ thu hoạch ›</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3.5 mb-2">
        <div className="font-bold text-[15px]">{rows.length} lô đang rao</div>
        {coChuong === 0 && (
          <Link href="/cho/cua-toi" className="text-[13px] font-semibold no-underline whitespace-nowrap"
            style={{ color: "var(--paddy)" }}>Đơn của tôi ›</Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="soft text-center py-8">
          <div className="text-[34px]">🧺</div>
          <h3 className="display text-[17px] mt-2">Chợ đang trống</h3>
          <p className="lede mt-1.5 px-2">
            Chưa ai gửi lô nào lên. Khi có người bận không nhận được trứng, lô của họ sẽ
            xuất hiện ở đây.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {rows.map((r) => {
            const type = r.lot.type as LotType;
            const cuaToi = r.sellerId === me.id;
            return (
              <div key={r.id} className="card">
                <div className="flex items-center gap-2.5">
                  <span className="flex-none text-[19px]">{LOT_TYPE_EMOJI[type]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14.5px]">
                      {lotSummary({ type, qty: r.lot.qty, weightKg: r.lot.weightKg })}
                    </div>
                    <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                      {r.lot.barn.label} · thu {new Date(r.lot.collectedAt).toLocaleDateString("vi-VN")}
                      {r.seller?.name && ` · ${r.seller.name}`}
                    </div>
                  </div>
                  <b className="flex-none text-[14.5px]">{fmtVnd(r.priceVnd)}</b>
                </div>

                {r.lot.proofMedia?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.lot.proofMedia.url} alt="Ảnh lô hàng lúc thu"
                    className="w-full rounded-[11px] mt-2" style={{ maxHeight: 190, objectFit: "cover" }} />
                )}

                <div className="flex items-center gap-1.5 flex-wrap mt-2 text-[11.4px]">
                  {/* Cách bảo quản ĐỌC TỪ DỮ LIỆU - "gà tươi" và "gà đông lạnh" là hai
                      món hàng khác nhau, không được suy từ loại lô rồi viết cứng (§9.11). */}
                  {r.lot.storage && (
                    <span className="font-semibold rounded-full px-2 py-0.5"
                      style={r.lot.storage === "FROZEN"
                        ? { background: "#EAF1F6", color: "#2A5674" }
                        : { background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                      {STORAGE_VI[r.lot.storage as StorageMode]}
                    </span>
                  )}
                  <span className="font-semibold rounded-full px-2 py-0.5"
                    style={{ background: "var(--paper2)", color: "var(--ink-soft)" }}>
                    {keepLabel(r.lot.collectedAt)}
                  </span>
                </div>

                {cuaToi ? (
                  <div className="text-[12px] mt-2" style={{ color: "var(--ink-soft)" }}>
                    Đây là lô bạn đang rao.
                  </div>
                ) : coChuong === 0 ? (
                  <button className="btn btn-ghost btn-sm w-full mt-2" disabled
                    title="Cần đang nhận nuôi một chuồng">Cần có chuồng mới mua được</button>
                ) : (
                  <BuyButton listingId={r.id} priceVnd={r.priceVnd} />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11.6px] mt-3" style={{ color: "var(--ink-soft)" }}>
        Nông trại giữ lại {MARKET_FEE_PERCENT}% giá bán cho việc bảo quản, đóng gói, giao
        tận tay và đứng ra bảo đảm. Tiền chỉ chuyển cho người bán <b>sau khi hàng được
        trao tay và có ảnh</b>.
      </p>
    </div>
  );
}
