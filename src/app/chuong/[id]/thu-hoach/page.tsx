export const dynamic = "force-dynamic";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canViewBarn, requireUser } from "@/lib/auth";
import BarnLocked from "@/components/BarnLocked";
import { ListLotButton } from "@/components/MarketForms";
import { coTraCuuTen } from "@/app/market-actions";
import { AddressForm, CancelClaimButton, ClaimLotButton, type AddressVM } from "@/components/HarvestForms";
import {
  LOT_KEEP_DAYS, LOT_STATUS_VI, LOT_TYPE_EMOJI, LOT_TYPE_VI, STORAGE_VI,
  daysLeft, keepLabel, lotSummary, unitOf,
  type LotStatus, type LotType, type StorageMode,
} from "@/lib/harvest";
import { lotMoney, priceFor } from "@/lib/market";
import { qrSvg, traceUrl } from "@/lib/qr";

/**
 * SỔ THU HOẠCH của một chuồng — mỗi lần nông dân nhặt trứng hoặc mổ gà là một dòng.
 *
 * Đây là trang trả lời câu hỏi "chuồng tôi làm ra được cái gì rồi", thứ mà trước bản
 * này app không trả lời được: ô "Trứng chu kỳ này" đọc `Product.qty`, mà cột đó không
 * có lệnh `update` nào trong `src/` nên mọi chuồng thật vĩnh viễn là 0 quả (§11.11).
 *
 * HIỆU NĂNG: một truy vấn danh sách (có `take`) + một `groupBy` cho tổng, chạy song
 * song. Tổng KHÔNG cộng từ danh sách đã cắt — đó là cách tạo ra một con số sai âm thầm.
 */
const PAGE = 60;

export default async function ThuHoach({ params }: { params: { id: string } }) {
  const next = `/chuong/${params.id}/thu-hoach`;
  // requireUser Ở DÒNG ĐẦU, trước mọi truy vấn nặng (bẫy §10).
  const me = await requireUser(next);
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    select: {
      id: true, slug: true, label: true, ownerId: true, workerId: true, isPublic: true,
      flock: { select: { productLine: true, breed: { select: { slug: true } } } },
    },
  });
  if (!barn) return notFound();
  if (!(await canViewBarn(barn, next))) return <BarnLocked slug={barn.slug} />;

  const [lots, totals, prices, addr, payAcc] = await Promise.all([
    prisma.harvestLot.findMany({
      where: { barnId: barn.id },
      orderBy: { collectedAt: "desc" },
      take: PAGE,
      select: {
        id: true, type: true, qty: true, weightKg: true, storage: true,
        collectedAt: true, status: true, note: true, ownerId: true, publicCode: true,
        worker: { select: { name: true } },
        proofMedia: { select: { url: true } },
        listing: { select: { id: true, status: true } },
      },
    }),
    prisma.harvestLot.groupBy({
      by: ["type"],
      where: { barnId: barn.id },
      _sum: { qty: true, weightKg: true },
    }),
    // Bảng giá để HIỆN số trước khi bấm. Server vẫn tra và tính lại lúc đăng (§9.6) —
    // con số ở đây chỉ là để người bán biết mình sắp nhận bao nhiêu.
    prisma.marketPrice.findMany({
      select: { type: true, breedSlug: true, unitVnd: true, effectiveFrom: true },
    }),
    // Địa chỉ nhận hàng của NGƯỜI ĐANG XEM (không phải của chủ chuồng): lô thuộc về
    // người đã trả tiền nuôi nó, và trang này admin cũng mở được.
    prisma.address.findUnique({
      where: { userId: me.id },
      select: { fullName: true, phone: true, line: true, note: true },
    }),
    // Tài khoản nhận tiền — để nút "bán lại" biết có mở được ô điền ngay tại chỗ không,
    // thay vì để người ta bấm tới bước cuối rồi mới bị từ chối và không biết đi đâu.
    prisma.payoutAccount.findUnique({
      where: { userId: me.id },
      select: { bankName: true, accountNo: true, holderName: true },
    }),
  ]);
  const coTraTen = await coTraCuuTen();

  // Tên miền lấy từ chính request — mã QR phải mang URL TUYỆT ĐỐI, và đọc từ biến môi
  // trường thì một cái mã in sai tên miền chỉ lộ ra khi hộp trứng đã tới tay người ta.
  const host = headers().get("host");

  const isLayer = barn.flock?.productLine === "LAYER";
  const sum = (t: LotType) => totals.find((x) => x.type === t);
  const eggs = sum("EGG")?._sum.qty ?? 0;
  const meatBirds = sum("MEAT")?._sum.qty ?? 0;
  const meatKg = sum("MEAT")?._sum.weightKg ?? 0;

  /** Lô còn trong hạn nông trại giữ hộ — thứ nhận về nhà hoặc bán lại được. */
  const conHan = lots.filter((l) => l.status === "AT_FARM" && daysLeft(l.collectedAt) > 0);
  /** Có gì đang nằm ở nông trại không (kể cả lô đã xin nhận) — quyết định có hỏi địa chỉ. */
  const dangONongTrai = conHan.length > 0 || lots.some((l) => l.status === "CLAIMED");

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline"
        style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>

      <div className="mt-2">
        <span className="eyebrow">Sổ thu hoạch</span>
        <h2 className="display text-[18px] mt-0.5 leading-tight">{barn.label}</h2>
      </div>

      <div className="statusband mt-2.5">
        <div>
          <div className="sb-k">{isLayer ? "Tổng trứng" : "Tổng gà thịt"}</div>
          <div className="sb-v">{isLayer ? `${eggs} quả` : `${meatBirds} con`}</div>
        </div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div>
          <div className="sb-k">{isLayer ? "Số lô" : "Tổng cân"}</div>
          <div className="sb-v">{isLayer ? `${lots.length}` : `${meatKg.toLocaleString("vi-VN")}kg`}</div>
        </div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Còn ở nông trại</div><div className="sb-v">{conHan.length} lô</div></div>
      </div>

      <p className="text-[12.4px] mt-2.5 leading-snug" style={{ color: "var(--ink-soft)" }}>
        Mỗi lô do nông dân ghi tận nơi kèm ảnh. Nông trại <b>giữ hộ {LOT_KEEP_DAYS} ngày</b> kể
        từ lúc thu — trong hạn đó bạn <b>nhận về nhà</b> hoặc <b>bán lại trên chợ</b>, tuỳ bạn.
      </p>

      {/* Địa chỉ nhận hàng. Chỉ hiện khi CÓ lô đang ở nông trại — chưa thu hoạch được
          gì mà đã hỏi địa chỉ là hỏi một thứ chưa dùng tới. */}
      {dangONongTrai && <AddressForm initial={addr as AddressVM | null} />}

      {lots.length === 0 ? (
        <div className="soft text-center py-8 mt-3">
          <div className="text-[34px]">{isLayer ? "🥚" : "🍗"}</div>
          <h3 className="display text-[17px] mt-2">Chưa có lô nào</h3>
          <p className="lede mt-1.5 px-2">
            {isLayer
              ? "Khi đàn vào đẻ, mỗi lần nhặt trứng cô chú sẽ ghi vào đây kèm một tấm ảnh giỏ trứng."
              : "Tới lứa thu hoạch, cô chú cân từng con rồi ghi vào đây kèm ảnh."}
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {lots.map((l) => {
            const con = daysLeft(l.collectedAt);
            const sapHet = l.status === "AT_FARM" && con > 0 && con <= 2;
            const quaHan = l.status === "AT_FARM" && con <= 0;
            return (
              <div key={l.id} className="card"
                style={quaHan ? { borderColor: "#F0CFC6" } : sapHet ? { borderColor: "#EBD8AE" } : undefined}>
                <div className="flex items-center gap-2.5">
                  <span className="flex-none text-[19px]">{LOT_TYPE_EMOJI[l.type as LotType]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px]">
                      {lotSummary({ type: l.type as LotType, qty: l.qty, weightKg: l.weightKg })}
                    </div>
                    <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                      {LOT_TYPE_VI[l.type as LotType]} · thu {new Date(l.collectedAt).toLocaleDateString("vi-VN")}
                      {l.worker?.name && ` · ${l.worker.name}`}
                    </div>
                  </div>
                  {/* Cách bảo quản ĐỌC TỪ DỮ LIỆU, không suy từ loại lô rồi viết cứng:
                      "gà tươi" và "gà đông lạnh" là hai món hàng khác nhau (§9.11). */}
                  {l.storage && (
                    <span className="flex-none text-[11px] font-semibold rounded-full px-2 py-0.5"
                      style={l.storage === "FROZEN"
                        ? { background: "#EAF1F6", color: "#2A5674" }
                        : { background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                      {STORAGE_VI[l.storage as StorageMode]}
                    </span>
                  )}
                </div>

                {l.proofMedia?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.proofMedia.url} alt={`Ảnh lô ${l.qty} ${unitOf(l.type as LotType)}`}
                    className="w-full rounded-[11px] mt-2" style={{ maxHeight: 200, objectFit: "cover" }} />
                )}

                {l.note && <div className="text-[12.8px] mt-1.5">{l.note}</div>}

                <div className="text-[12px] mt-1.5 font-semibold"
                  style={{ color: quaHan ? "#B4472F" : sapHet ? "var(--yolk-deep)" : "var(--ink-soft)" }}>
                  {l.status === "AT_FARM" ? keepLabel(l.collectedAt) : LOT_STATUS_VI[l.status as LotStatus] ?? l.status}
                </div>

                {/* HAI LỐI RA cho một lô còn trong hạn, cố ý đặt cạnh nhau: nhận về nhà
                    (thứ người ta nhận nuôi để có) và bán lại (thứ đỡ phí khi bận). Trước
                    bản này chỉ có lối thứ hai, nên ai không bán được thì lô hết hạn rồi
                    thôi — một ngõ cụt ngay cuối vòng đời sản phẩm (§11.12).
                    Giá hiện ở đây chỉ để xem trước; server tra và tính lại (§9.6). */}
                {l.ownerId === me.id && l.status === "AT_FARM" && !quaHan && (() => {
                  const type = l.type as LotType;
                  const unit = priceFor(prices, type, barn.flock?.breed?.slug);
                  const money = unit
                    ? lotMoney(unit, { type, qty: l.qty, weightKg: l.weightKg })
                    : null;
                  const tomTat = lotSummary({ type, qty: l.qty, weightKg: l.weightKg });
                  return (
                    <>
                      <ClaimLotButton lotId={l.id} hasAddress={!!addr} summary={tomTat} />
                      <ListLotButton
                        lotId={l.id}
                        account={payAcc}
                        coTraTen={coTraTen}
                        priceVnd={money?.priceVnd ?? null}
                        netVnd={money?.netVnd ?? null}
                        disabledReason={
                          type === "MEAT" && !l.weightKg
                            ? "Chưa có số cân — nhờ nông dân cân giúp thì mới bán lại được."
                            : null
                        }
                      />
                    </>
                  );
                })()}

                {l.ownerId === me.id && l.status === "CLAIMED" && (
                  <div className="mt-1.5">
                    <div className="text-[12px]" style={{ color: "var(--paddy-deep)" }}>
                      🏠 Nông dân đang thu xếp giao về địa chỉ của bạn — xong sẽ có ảnh trao tay.
                    </div>
                    <CancelClaimButton lotId={l.id} />
                  </div>
                )}
                {/* MÃ TRUY XUẤT — mã QR thật, quét ra trang công khai của riêng lô này.
                    Dùng <details> chứ không phải một client component: đây là một hình
                    vẽ xong là xong, không đáng để gửi thêm JavaScript xuống máy người
                    dùng chỉ để mở/đóng một khối. */}
                {l.publicCode && l.ownerId === me.id && (() => {
                  const url = traceUrl(host, l.publicCode);
                  return (
                    <details className="mt-1.5">
                      <summary className="text-[12.6px] font-semibold cursor-pointer"
                        style={{ color: "var(--paddy)" }}>
                        🔖 Mã truy xuất — dán lên hộp khi đem tặng
                      </summary>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="w-[112px] h-[112px] flex-none rounded-[12px] p-1.5 bg-white"
                          style={{ border: "1px solid var(--line)" }}
                          dangerouslySetInnerHTML={{ __html: qrSvg(url) }} />
                        <div className="min-w-0 text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                          Người nhận quét mã là thấy ảnh cô chú chụp lúc thu, giống gà,
                          chế độ ăn và tên người chăm — <b>không thấy</b> chuồng hay tên bạn.
                          <div className="mt-1 break-all" style={{ color: "var(--ink)" }}>{url}</div>
                        </div>
                      </div>
                    </details>
                  );
                })()}

                {l.listing && l.status === "LISTED" && (
                  <div className="text-[12px] mt-1.5" style={{ color: "var(--paddy-deep)" }}>
                    🏪 Đang rao trên chợ — <Link href="/cho/cua-toi" style={{ color: "var(--paddy)" }}>xem đơn ›</Link>
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
