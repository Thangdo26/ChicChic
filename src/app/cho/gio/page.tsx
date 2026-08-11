export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { GioHang } from "@/components/MarketForms";
import { AddressForm, type AddressVM } from "@/components/HarvestForms";
import { VUONG_MAC_VI, tienDon, vuongMacGiaoHang } from "@/lib/delivery";
import { diaChiVaVung, vungDangMo } from "@/lib/zones";
import { lotSummary, type LotType } from "@/lib/harvest";
import { RESERVE_HOLD_MINUTES } from "@/lib/market";

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

  const [gio, giaoHang, zones] = await Promise.all([
    // Giỏ đang mở. `findFirst` chứ không `findUnique`: luật "một giỏ" cưỡng chế trong
    // action, không bằng khoá DB - xem `market-actions.gioDangMo`.
    prisma.marketOrder.findFirst({
      where: { buyerId: me.id, status: "OPEN" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        listings: {
          where: { status: "RESERVED" },
          orderBy: { reservedAt: "asc" },
          select: {
            id: true, priceVnd: true,
            lot: { select: { type: true, qty: true, weightKg: true, barn: { select: { label: true } } } },
          },
        },
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
