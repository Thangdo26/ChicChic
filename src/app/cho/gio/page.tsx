export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { GioHang, MarketPayBox } from "@/components/MarketForms";
import { AddressForm, type AddressVM } from "@/components/HarvestForms";
import { VUONG_MAC_VI, tienDon, vuongMacGiaoHang } from "@/lib/delivery";
import { diaChiVaVung, vungDangMo } from "@/lib/zones";
import { lotSummary, type LotType } from "@/lib/harvest";
import { MARKET_ORDER_VI, RESERVE_HOLD_MINUTES, conLaiCuaDon, conLaiVi } from "@/lib/market";
import { fmtVnd } from "@/lib/pricing";

/**
 * GIỎ HÀNG - trang riêng, có mặt thường trực trên thanh điều hướng (§11.46).
 *
 * ⚠️ **Đây không chỉ là chỗ dời cái thẻ giỏ ra khỏi `/cho`.** Nó là **lối vào duy nhất
 * tới ô địa chỉ cho người không nuôi chuồng nào**. Trước đợt này ô địa chỉ chỉ nằm trong
 * sổ thu hoạch (`/chuong/[id]/thu-hoach`) - một trang đòi phải sở hữu chuồng. Từ khi chợ
 * mở cửa mua cho mọi tài khoản (§11.40), người mua có thể không có chuồng nào, và với họ
 * câu *"Điền địa chỉ nhận hàng trước rồi mới đặt được nhé"* chỉ đường tới một nơi họ
 * không vào được: một ngõ cụt hoàn chỉnh, chặn đúng người đang muốn trả tiền.
 *
 * Thứ tự trên trang là **địa chỉ trước, giỏ sau**, cố ý: địa chỉ là thứ chặn, và
 * `AddressForm` tự thu lại còn một dòng khi đã điền xong nên không chiếm chỗ của giỏ.
 */
export default async function GioCuaToi() {
  const me = await requireUser("/cho/gio");
  // Nông dân không mua trên chợ (§9.14) - và cổng nông dân là một thế giới khác hẳn,
  // không có giỏ hàng nào để bày. Đá về hộp việc thay vì vẽ một trang rỗng.
  if (me.role === "WORKER") redirect("/nong-trai");

  const loTrongDon = {
    where: { status: "RESERVED" as const },
    orderBy: { reservedAt: "asc" as const },
    select: {
      id: true, priceVnd: true, reservedAt: true,
      lot: { select: { type: true, qty: true, weightKg: true, barn: { select: { label: true } } } },
    },
  };

  const [gio, choTra, giaoHang, zones] = await Promise.all([
    // Giỏ đang mở. `findFirst` chứ không `findUnique`: luật "một giỏ" cưỡng chế trong
    // action, không bằng khoá DB - xem `market-actions.gioDangMo`.
    prisma.marketOrder.findFirst({
      where: { buyerId: me.id, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, listings: loTrongDon },
    }),
    // ⭐ ĐƠN ĐÃ CHỐT ĐANG CHỜ TIỀN (Đợt 15). Trước đó `chotGio` đưa đơn sang `RESERVED`
    // rồi trang này **không còn thấy nó** (chỉ hỏi `OPEN`): giỏ hiện "đang trống", và
    // câu duy nhất chỉ đường là dòng toast vừa trôi qua. Ô chuyển khoản nằm ở
    // `/cho/cua-toi`, một trang không có lối nào dẫn tới từ đây. Nay cả luồng - gom giỏ,
    // chốt, chuyển khoản, bấm xác nhận - chạy trọn trên MỘT trang.
    //
    // `findMany` chứ không `findFirst`: chốt xong rồi bỏ thêm lô vào giỏ mới là chuyện
    // bình thường, nên một người có thể có nhiều đơn đang chờ tiền cùng lúc. Giấu bớt
    // là giấu một khoản họ phải trả.
    prisma.marketOrder.findMany({
      where: { buyerId: me.id, status: { in: ["RESERVED", "REPORTED"] } },
      orderBy: { reservedAt: "asc" },
      take: 5,
      select: {
        id: true, status: true, payCode: true, goodsVnd: true, shipVnd: true,
        totalVnd: true, zoneName: true, listings: loTrongDon,
      },
    }),
    diaChiVaVung(me.id),
    vungDangMo(),
  ]);

  const trongGio = gio?.listings ?? [];
  // Tiền tính ở SERVER từ vùng giao thật (§9.6) - client không gửi lên con số nào.
  const tien = tienDon(trongGio.map((l) => l.priceVnd), giaoHang.zone);
  const vuong = vuongMacGiaoHang(giaoHang.address, giaoHang.zone);

  const diaChiVM: AddressVM | null = giaoHang.address
    ? {
        ...giaoHang.address,
        zoneName: giaoHang.zone?.name ?? null,
        zoneFeeVnd: giaoHang.zone?.feeVnd ?? null,
      }
    : null;

  const gioVM = trongGio.map((l) => ({
    id: l.id,
    tomTat: lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg }),
    barnLabel: l.lot.barn.label,
    priceVnd: l.priceVnd,
  }));

  // MỘT mốc cho cả trang - cùng lý do với `/cho`.
  const bayGio = Date.now();
  const hanGanNhat = (ls: { reservedAt: Date | null }[]) => conLaiCuaDon(ls, bayGio);
  const conLaiGio = hanGanNhat(trongGio);

  return (
    <div className="screen">
      <Link href="/cho" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chợ</Link>

      <div className="mt-2">
        <span className="eyebrow">Chợ nông trại</span>
        <h2 className="display text-[19px] mt-0.5">Giỏ của tôi</h2>
      </div>

      <p className="lede mt-1.5">
        Gom nhiều lô rồi <b>chuyển khoản một lần</b> - phí giao tính đúng một chuyến, bỏ thêm
        lô vào giỏ không tốn thêm phí.
      </p>

      {/* ---------- Đơn đã chốt, đang chờ tiền ----------
          Đứng TRÊN CÙNG, trên cả ô địa chỉ: đây là khoản người ta đang nợ và có đồng hồ
          đếm ngược, còn mọi thứ khác trên trang thì đợi được. */}
      {choTra.map((don) => {
        const conLai = hanGanNhat(don.listings);
        const daBao = don.status === "REPORTED";
        return (
          <div key={don.id} className="card mt-3" style={{ borderColor: "#EBD8AE" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex-none text-[17px]">🧾</span>
              <div className="font-bold text-[14px]">
                Đơn {don.listings.length} lô · {MARKET_ORDER_VI[don.status] ?? don.status}
              </div>
              <b className="ml-auto text-[15px]">{fmtVnd(don.totalVnd)}</b>
            </div>

            {don.listings.map((l) => (
              <div key={l.id} className="flex items-center gap-2 py-1.5 text-[12.6px]"
                style={{ borderTop: "1px solid var(--line-soft)" }}>
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg })}
                  </div>
                  <div className="text-[11.4px] truncate" style={{ color: "var(--ink-soft)" }}>{l.lot.barn.label}</div>
                </div>
                <span className="flex-none">{fmtVnd(l.priceVnd)}</span>
              </div>
            ))}

            <div className="soft mt-2 text-[12.4px]">
              <div className="flex justify-between"><span>Tiền hàng</span><span>{fmtVnd(don.goodsVnd)}</span></div>
              <div className="flex justify-between" style={{ color: don.shipVnd > 0 ? "var(--ink-soft)" : "var(--paddy-deep)" }}>
                <span>Phí giao{don.zoneName ? ` · ${don.zoneName}` : ""}</span>
                <span>{don.shipVnd > 0 ? fmtVnd(don.shipVnd) : "miễn phí"}</span>
              </div>
              <div className="flex justify-between pt-1.5 mt-1.5" style={{ borderTop: "1px dashed var(--line)" }}>
                <span>Phải chuyển</span><b style={{ color: "var(--paddy-deep)" }}>{fmtVnd(don.totalVnd)}</b>
              </div>
            </div>

            {don.payCode ? (
              <>
                {/* Quá hạn thì cảnh báo, nhưng **KHÔNG giấu nút "Tôi đã chuyển khoản"**.
                    Đó là cái bẫy tôi suýt đặt: người chốt lúc 2h50, ra ngân hàng, quay
                    lại lúc 3h10 - tiền đã đi thật, và đúng lúc đó màn hình bỏ mất cái
                    nút duy nhất để họ nói ra điều ấy. Bấm nút là ĐÓNG BĂNG chỗ giữ
                    (§9.34), tức nó chính là thứ cứu họ, không phải thứ nên khoá lại. */}
                {!daBao && conLai !== null && conLai <= 0 && (
                  <div className="rounded-[13px] p-3 mt-2 text-[12.6px]"
                    style={{ background: "#FBEDE9", border: "1px solid #F0CFC6", color: "#B4472F" }}>
                    <b>⌛ Đơn này đã quá hạn giữ chỗ.</b> Nếu bạn <b>đã chuyển tiền</b> thì bấm
                    nút bên dưới ngay - lô sẽ được giữ lại cho bạn và nông trại đối soát.
                    Chưa chuyển thì thôi, lô sẽ tự quay lại chợ.
                  </div>
                )}
                <MarketPayBox
                  orderId={don.id} payCode={don.payCode} priceVnd={don.totalVnd}
                  daBao={daBao} conLai={conLai !== null && !daBao && conLai > 0 ? conLaiVi(conLai) : null}
                />
              </>
            ) : (
              <div className="soft mt-2 text-[12.4px]" style={{ color: "var(--ink-soft)" }}>
                Đơn này chưa có mã chuyển khoản - nhắn nông trại giúp mình nhé.
              </div>
            )}
          </div>
        );
      })}

      {/* ---------- Địa chỉ ----------
          Đứng TRÊN giỏ vì nó là thứ chặn. Ô tự bung ra khi chưa có địa chỉ hoặc địa chỉ
          cũ chưa chọn khu vực; đã đủ thì nó thu lại còn một dòng. */}
      <AddressForm initial={diaChiVM} zones={zones} />

      {/* ---------- Giỏ ---------- */}
      {gioVM.length === 0 ? (
        <div className="soft text-center py-8 mt-3">
          <div className="text-[34px]">🧺</div>
          <h3 className="display text-[17px] mt-2">Giỏ đang trống</h3>
          <p className="lede mt-1.5 px-2">
            {vuong
              ? <>Điền địa chỉ nhận hàng ở ô trên là bỏ hàng vào giỏ được ngay.</>
              : <>Chọn lô bạn muốn ở chợ rồi bấm <b>Bỏ vào giỏ</b>.</>}
          </p>
          <Link href="/cho" className="btn btn-primary btn-sm no-underline mt-3">🏪 Xem chợ</Link>
        </div>
      ) : (
        <>
          <GioHang
            lo={gioVM} goodsVnd={tien.goodsVnd} shipVnd={tien.shipVnd} totalVnd={tien.totalVnd}
            zoneName={giaoHang.zone?.name ?? null}
            vuongMac={vuong ? VUONG_MAC_VI[vuong] : null}
            conLai={conLaiGio !== null ? conLaiVi(conLaiGio) : null}
          />
          <p className="text-[11.6px] mt-2" style={{ color: "var(--ink-soft)" }}>
            Nông trại giữ chỗ các lô trong giỏ {Math.round(RESERVE_HOLD_MINUTES / 60)} giờ. Quá hạn
            mà chưa chốt thì lô về lại chợ cho người khác - bỏ vào giỏ là <b>người khác không
            mua được nữa</b>, nên đừng giữ hộ thứ mình không lấy.
          </p>
          <Link href="/cho" className="btn btn-ghost btn-sm w-full no-underline mt-2.5">
            🏪 Xem thêm ở chợ
          </Link>
        </>
      )}

      <Link href="/cho/cua-toi" className="block text-center text-[12.8px] font-semibold no-underline mt-3"
        style={{ color: "var(--paddy)" }}>Đơn đã đặt của tôi ›</Link>
    </div>
  );
}
