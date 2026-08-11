export const dynamic = "force-dynamic";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { BuyButton } from "@/components/MarketForms";
import { fmtVnd } from "@/lib/pricing";
import { VUONG_MAC_VI, tienDon, vuongMacGiaoHang } from "@/lib/delivery";
import { diaChiVaVung } from "@/lib/zones";
import {
  LOT_KEEP_DAYS, LOT_TYPE_EMOJI, STORAGE_VI, keepLabel, lotSummary,
  type LotType, type StorageMode,
} from "@/lib/harvest";
import { MARKET_FEE_PERCENT, conLaiVi, trangThaiRao } from "@/lib/market";

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

  const [rows, myBarns, banDuoc, gio, giaoHang] = await Promise.all([
    prisma.marketListing.findMany({
      // ⭐ LẤY CẢ LÔ NGƯỜI KHÁC ĐANG GIỮ (§9.34, Đợt 15). Bản trước chỉ lấy `LISTED`
      // cộng lô trong giỏ của chính mình, nên lô người khác vừa bỏ vào giỏ **biến mất
      // khỏi chợ** - người bán không hiểu vì sao hàng mình không còn ở đó, người mua
      // quay lại tưởng đã bán hết rồi đi mất. Và cái tệ nhất: chỗ giữ QUÁ HẠN mà chưa
      // job nào nhả cũng vẫn ẩn, tức lô có thể mua được nhưng không ai nhìn thấy.
      //
      // Nay lấy cả hai trạng thái rồi để `trangThaiRao` quyết mỗi lô hiện ra sao - phép
      // tính thuần, có bảng kiểm riêng, và nó coi chỗ giữ quá hạn là "còn mua được"
      // ngay tại lúc hiển thị.
      where: {
        lot: { collectedAt: { gte: conHan } },
        status: { in: ["LISTED", "RESERVED"] },
      },
      // Lô SẮP HẾT HẠN lên trước: giá như nhau nên người mua không chọn theo giá, và
      // xếp kiểu này vừa công bằng cho người bán vừa giảm hàng bỏ phí.
      orderBy: { lot: { collectedAt: "asc" } },
      take: PAGE,
      select: {
        id: true, priceVnd: true, sellerId: true,
        // Ba cột dưới đây là đầu vào của `trangThaiRao` - thiếu cột nào là hàm đó phải
        // đoán, và nó tuyệt đối không được đoán ở chỗ quyết định ai mua được lô nào.
        status: true, buyerId: true, reservedAt: true,
        order: { select: { status: true } },
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
    // Chuồng của tôi - lối sang sổ thu hoạch để ĐĂNG BÁN. Không còn là cổng mua nữa
    // (§11.40): mua chỉ cần một tài khoản.
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
    // Giỏ đang mở của tôi. `findFirst` chứ không `findUnique`: luật "một giỏ" cưỡng chế
    // trong action, không bằng khoá DB - xem chú thích ở `market-actions.gioDangMo`.
    //
    // Trang này chỉ cần ĐÁNH DẤU lô nào đang trong giỏ và in một dòng tóm tắt, nên
    // `select` dừng ở `id` + `priceVnd`: tên lô và tên chuồng là việc của `/cho/gio`,
    // kéo về đây là thêm một tầng truy vấn cho thứ không ai đọc.
    prisma.marketOrder.findFirst({
      where: { buyerId: me.id, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        listings: { where: { status: "RESERVED" }, select: { id: true, priceVnd: true } },
      },
    }),
    diaChiVaVung(me.id),
  ]);

  const coChuong = myBarns.length;
  const banDuocBy = new Map(banDuoc.map((r) => [r.barnId, r._count._all]));
  const tongBanDuoc = banDuoc.reduce((s, r) => s + r._count._all, 0);

  // Giỏ: tiền tính ở SERVER từ vùng giao thật (§9.6), không nhận số nào từ client.
  const trongGio = gio?.listings ?? [];
  const tien = tienDon(trongGio.map((l) => l.priceVnd), giaoHang.zone);
  const vuong = vuongMacGiaoHang(giaoHang.address, giaoHang.zone);
  const vuongVi = vuong ? VUONG_MAC_VI[vuong] : null;

  // MỘT mốc thời gian cho cả trang. Gọi `Date.now()` trong vòng lặp thì hai lô cạnh
  // nhau được xét ở hai thời điểm khác nhau - vô hại ở đây, nhưng nó làm phép kiểm
  // không lặp lại được, và đây là chỗ quyết định ai mua được lô nào.
  const bayGio = Date.now();
  const nhan = rows.map((r) => trangThaiRao(
    { status: r.status, buyerId: r.buyerId, reservedAt: r.reservedAt, orderStatus: r.order?.status ?? null },
    me.id, bayGio,
  ));
  const soMuaDuoc = nhan.filter((t) => t.trang === "dang-rao").length;

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

      {/* Chưa có chuồng thì MUA vẫn được (§11.40) - khối này là lời mời, không phải cái
          khoá. Bản cũ đứng đúng chỗ này và nói "cần có một chuồng mới mua được": nó chặn
          đúng người đang muốn trả tiền cho hàng của cô chú nuôi thật. */}
      {coChuong === 0 && (
        <div className="flex gap-2.5 rounded-[13px] p-[11px] mt-2.5 text-[12.4px]"
          style={{ background: "var(--paddy-tint)", border: "1px solid var(--paddy)", color: "var(--paddy-deep)" }}>
          🐣 <div>
            Bạn mua được ngay, không cần nuôi chuồng nào. Muốn <b>bán</b> lô của mình thì mới
            cần nhận nuôi một chuồng. <Link href="/nhan-chuong" style={{ color: "var(--paddy)" }}>Nhận chuồng ›</Link>
          </div>
        </div>
      )}

      {/* ---------- Dòng tóm tắt giỏ ----------
          Thẻ giỏ đầy đủ đã dời sang `/cho/gio` (§11.46), nhưng KHÔNG bỏ hẳn dấu vết ở
          đây: mục 🧺 trên thanh điều hướng chỉ sống ở laptop (`.side-nav` ẩn hẳn dưới
          `lg`), nên người dùng điện thoại - tức gần như toàn bộ người dùng thật - sẽ
          không còn đường nào tới cái giỏ mình vừa bỏ hàng vào. Một dòng, bấm là sang. */}
      {trongGio.length > 0 && (
        <Link href="/cho/gio" className="flex items-center gap-2.5 rounded-[13px] p-[11px] mt-2.5 no-underline"
          style={{ background: "var(--paddy-tint)", border: "1.5px solid var(--paddy)" }}>
          <span className="flex-none text-[17px]">🧺</span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[13.4px]" style={{ color: "var(--paddy-deep)" }}>
              Giỏ của bạn · {trongGio.length} lô · {fmtVnd(tien.goodsVnd)}
            </div>
            <div className="text-[11.6px]" style={{ color: vuongVi ? "var(--yolk-deep)" : "var(--paddy-deep)" }}>
              {vuongVi ? `⚠️ ${vuongVi}` : "Mở giỏ để xem phí giao và chốt đơn"}
            </div>
          </div>
          <span className="flex-none text-[12.6px] font-semibold whitespace-nowrap"
            style={{ color: "var(--paddy)" }}>Mở giỏ ›</span>
        </Link>
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
        {/* Đếm RIÊNG "mua được ngay" với "đang có người giữ". Gộp thành một con số là
            hứa nhiều hơn thực có: 8 lô trên màn hình mà 5 lô bấm không được. */}
        <div className="font-bold text-[15px]">
          {soMuaDuoc} lô mua được
          {rows.length > soMuaDuoc && (
            <span className="font-normal text-[12.6px]" style={{ color: "var(--ink-soft)" }}>
              {" "}· {rows.length - soMuaDuoc} lô đang có người giữ
            </span>
          )}
        </div>
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
          {rows.map((r, i) => {
            const type = r.lot.type as LotType;
            const cuaToi = r.sellerId === me.id;
            const t = nhan[i];
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
                ) : (
                  <BuyButton listingId={r.id} priceVnd={r.priceVnd}
                    trang={t.trang} conLai={conLaiVi(t.conLaiMs)} vuongMac={vuongVi} />
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
