export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { stageLabel } from "@/lib/flock";
import {
  LOT_TYPE_EMOJI, LOT_TYPE_VI, STORAGE_VI,
  lotSummary, normalizeTraceCode, unitOf,
  type LotType, type StorageMode,
} from "@/lib/harvest";

/**
 * TRANG TRUY XUẤT CÔNG KHAI của MỘT LÔ — thứ mã QR trên hộp trứng trỏ tới.
 *
 * ⭐ ĐÂY LÀ NGOẠI LỆ CÓ CHỦ Ý CỦA §9.5 ("đăng nhập trước mọi trang chuồng"), và ranh
 * giới của nó là toàn bộ lý do nó được phép tồn tại — xem §9.31.
 *
 * Vì sao phải công khai: cả sản phẩm bán một câu — *"gà này có thật, người chăm có
 * thật, ảnh chụp thật"*. Câu đó chỉ có sức nặng khi NGƯỜI ĐƯỢC TẶNG kiểm được, mà
 * người được tặng thì không có tài khoản. Bắt họ đăng nhập để xem nguồn gốc quả trứng
 * ai đó vừa cho là vứt bỏ đúng cái tác dụng của tính năng — cùng lập luận đã dùng cho
 * nửa công khai của `/nong-dan/[id]` (§9.15).
 *
 * HIỆN GÌ — chỉ những gì thuộc về LÔ HÀNG:
 *   lô là gì · thu ngày nào · ảnh nông dân chụp lúc thu · giống · chế độ ăn ·
 *   người chăm (hồ sơ vốn đã công khai) · khu nuôi · tiêm phòng (nói thật là chưa
 *   cập nhật) · thời gian ngừng thuốc.
 *
 * KHÔNG HIỆN — mọi thứ thuộc về NGƯỜI NUÔI:
 *   tên chuồng (người ta tự đặt, thường là tên riêng trong nhà) · `slug` (§11.19 đã
 *   lo chuyện lộ slug) · danh tính hay email chủ chuồng · các lô khác · nhật ký ·
 *   hộp thư · tiền nong. Người được tặng cần biết quả trứng đến từ đâu, KHÔNG cần
 *   biết ai đã tặng mình — và người tặng cũng chưa đồng ý cho biết điều đó.
 */

/**
 * ⚠️ MÃ SAI TRẢ VỀ **HTTP 200**, không phải 404 — đã đo trên bản `npm run build` +
 * `npm start`, và **bỏ `force-dynamic` cũng không đổi được** (đã thử). `notFound()`
 * trong route động của Next 14 render đúng màn không-tìm-thấy nhưng không đặt được mã
 * trạng thái. Cùng họ với bẫy `redirect()` ở §10.
 *
 * Chấp nhận được ở đây vì đường dẫn này đã `robots: noindex` và là một chìa khoá gửi
 * cho đúng một người, không phải một trang để tìm kiếm. Nhưng **đừng kiểm bằng mã
 * trạng thái**: muốn biết mã sai có bị chặn không thì đọc NỘI DUNG trang.
 */
type Props = { params: { code: string } };

async function loadLot(rawCode: string) {
  const publicCode = normalizeTraceCode(rawCode);
  if (publicCode.length < 6) return null;

  const lot = await prisma.harvestLot.findUnique({
    where: { publicCode },
    select: {
      type: true, qty: true, weightKg: true, storage: true, collectedAt: true,
      publicCode: true, flockId: true,
      proofMedia: { select: { url: true, type: true } },
      worker: { select: { id: true, name: true, area: true, yearsExp: true, consentMedia: true } },
      barn: {
        // CHỈ khu nuôi và nông trại. Không `slug`, không `label`, không `owner`.
        select: { zone: { select: { name: true, farm: { select: { name: true } } } } },
      },
    },
  });
  if (!lot) return null;

  // Truy vấn riêng, CỐ Ý: `HarvestLot` giữ `flockId` chứ không có quan hệ `flock`, và
  // ở trang này khác biệt đó có nghĩa thật — tra qua `barn.flock` sẽ ra ĐÀN HIỆN TẠI,
  // mà sau một lứa mới (`decideEndOfLay` nhánh RENEW) đó là một đàn gà khác hẳn. Người
  // quét mã hỏi "quả trứng NÀY từ đâu ra", không hỏi trong chuồng bây giờ có con gì.
  const flock = await prisma.flock.findUnique({
    where: { id: lot.flockId },
    select: {
      productLine: true, stage: true, startDate: true, vaccinatedAt: true,
      breed: { select: { name: true } },
      feedingPlan: { select: { name: true, ratio: true } },
      healthEvents: { orderBy: { createdAt: "desc" }, take: 1, select: { withdrawalUntil: true } },
    },
  });
  if (!flock) return null;

  return { ...lot, flock };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const lot = await loadLot(params.code);
  if (!lot) return { title: "Không tìm thấy mã truy xuất — ChicChic" };
  const tomTat = lotSummary({ type: lot.type as LotType, qty: lot.qty, weightKg: lot.weightKg });
  return {
    title: `Truy xuất ${tomTat} — ChicChic`,
    description: `${tomTat} thu ngày ${new Date(lot.collectedAt).toLocaleDateString("vi-VN")} tại ${lot.barn.zone.farm.name}. Người chăm: ${lot.worker.name}.`,
    // Trang này là một chìa khoá gửi cho đúng một người — đừng để nó vào kết quả tìm kiếm.
    robots: { index: false, follow: false },
  };
}

export default async function TraceLot({ params }: Props) {
  const lot = await loadLot(params.code);
  // Mã sai và lô không tồn tại trả VỀ CÙNG MỘT MÀN — không xác nhận giúp người dò rằng
  // họ đoán gần đúng.
  if (!lot) return notFound();

  const { flock } = lot;
  const type = lot.type as LotType;
  const isLayer = flock.productLine === "LAYER";
  const tomTat = lotSummary({ type, qty: lot.qty, weightKg: lot.weightKg });
  const withdrawal = flock.healthEvents[0]?.withdrawalUntil;
  const inWithdrawal = !!withdrawal && new Date(withdrawal) > new Date();

  const KV = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="kv">
      <span style={{ color: "var(--ink-soft)" }}>{k}</span>
      <span className="font-semibold text-right">{v}</span>
    </div>
  );

  return (
    <div className="screen">
      <div className="text-center mt-1">
        <span className="eyebrow">Truy xuất nguồn gốc</span>
        <h2 className="display text-[21px] mt-1 leading-tight">
          {LOT_TYPE_EMOJI[type]} {tomTat}
        </h2>
        <p className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Thu ngày <b>{new Date(lot.collectedAt).toLocaleDateString("vi-VN")}</b> tại{" "}
          {lot.barn.zone.farm.name} · {lot.barn.zone.name}
        </p>
      </div>

      {/* Ảnh nông dân chụp LÚC THU — bằng chứng đáng xem nhất của cả trang, nên nó
          đứng trước mọi bảng số liệu. */}
      {lot.proofMedia?.url && (
        lot.proofMedia.type === "VIDEO" ? (
          <video src={lot.proofMedia.url} controls playsInline
            className="w-full rounded-[14px] mt-3" style={{ maxHeight: 320 }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lot.proofMedia.url} alt={`Ảnh ${lot.qty} ${unitOf(type)} lúc thu hoạch`}
            className="w-full rounded-[14px] mt-3" style={{ maxHeight: 320, objectFit: "cover" }} />
        )
      )}

      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">Lô này đến từ đâu</div>
        <KV k="Loại" v={`${LOT_TYPE_VI[type]}${lot.storage ? ` · ${STORAGE_VI[lot.storage as StorageMode]}` : ""}`} />
        <KV k="Giống" v={flock.breed.name} />
        <KV k="Chế độ ăn" v={`${flock.feedingPlan.name} · ${flock.feedingPlan.ratio}`} />
        <KV k="Đàn vào chuồng" v={new Date(flock.startDate).toLocaleDateString("vi-VN")} />
        <KV k="Giai đoạn đàn" v={stageLabel(flock.stage, flock.productLine)} />
        {/* §9.11: nói đúng những gì có trong sổ. Chưa ghi nhận thì nói chưa. */}
        <KV
          k="Tiêm phòng úm"
          v={flock.vaccinatedAt
            ? `✓ Đã tiêm ${new Date(flock.vaccinatedAt).toLocaleDateString("vi-VN")}`
            : <span style={{ color: "var(--ink-soft)", fontWeight: 500 }}>Chưa cập nhật</span>}
        />
        <KV k="Mã lô" v={<code>{lot.publicCode}</code>} />
      </div>

      {/* Người chăm — hồ sơ này vốn đã công khai (§9.15), nên dẫn thẳng sang được. */}
      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1">Người chăm đàn này</div>
        <div className="text-[14px] font-semibold">{lot.worker.name}</div>
        <div className="text-[12.4px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
          {lot.worker.area} · {lot.worker.yearsExp} năm kinh nghiệm
        </div>
        {lot.worker.consentMedia && (
          <Link href={`/nong-dan/${lot.worker.id}`} className="text-[12.8px] font-semibold no-underline mt-1.5 inline-block"
            style={{ color: "var(--paddy)" }}>Xem mặt và ảnh cô/chú tự giới thiệu ›</Link>
        )}
      </div>

      <div className="flex gap-2.5 rounded-[13px] p-[11px] mt-3 text-[12.6px]"
        style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
        ⏳ <div>
          <b>Thời gian ngừng thuốc:</b> nếu đàn phải dùng thuốc thì {isLayer ? "trứng" : "thịt"} trong
          thời gian ngừng thuốc <b>không được giao</b>. Lô này:{" "}
          {inWithdrawal
            ? <b style={{ color: "#B4472F" }}>đàn đang trong thời gian ngừng thuốc tới {new Date(withdrawal!).toLocaleDateString("vi-VN")}</b>
            : <b style={{ color: "var(--paddy)" }}>không nằm trong thời gian ngừng thuốc</b>}.
        </div>
      </div>

      <div className="soft text-center py-6 mt-3">
        <h3 className="display text-[17px]">Quả trứng này có một cái chuồng thật</h3>
        <p className="lede mt-1.5 px-2">
          Ai đó đã nhận nuôi một chuồng gà ở Ba Vì và nhờ cô chú nông dân chăm hộ — mỗi
          việc làm xong đều kèm một tấm ảnh. Đây là trang của riêng lô hàng bạn đang cầm.
        </p>
        <Link href="/" className="btn btn-primary mt-3 no-underline">Xem ChicChic là gì</Link>
      </div>

      <p className="text-[11.4px] text-center mt-3" style={{ color: "var(--ink-soft)" }}>
        Trang này chỉ hiện thông tin của lô hàng. Chuồng, nhật ký và người nhận nuôi là
        riêng tư — chúng tôi không hiển thị ở đây.
      </p>
    </div>
  );
}
