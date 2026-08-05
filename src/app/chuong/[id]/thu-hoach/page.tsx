export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canViewBarn, requireUser } from "@/lib/auth";
import BarnLocked from "@/components/BarnLocked";
import { ListLotButton } from "@/components/MarketForms";
import {
  LOT_KEEP_DAYS, LOT_TYPE_EMOJI, LOT_TYPE_VI, STORAGE_VI,
  daysLeft, keepLabel, lotSummary, unitOf,
  type LotType, type StorageMode,
} from "@/lib/harvest";
import { lotMoney, priceFor } from "@/lib/market";

/** Nhãn cho lô đã rời trạng thái "đang ở nông trại". */
const LOT_STATUS_VI: Record<string, string> = {
  LISTED: "Đang rao trên chợ",
  SOLD: "Đã bán · chờ nông dân giao",
  DELIVERED: "Đã giao cho người mua",
  EXPIRED: "Hết hạn giữ hộ",
};

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

  const [lots, totals, prices] = await Promise.all([
    prisma.harvestLot.findMany({
      where: { barnId: barn.id },
      orderBy: { collectedAt: "desc" },
      take: PAGE,
      select: {
        id: true, type: true, qty: true, weightKg: true, storage: true,
        collectedAt: true, status: true, note: true, ownerId: true,
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
  ]);

  const isLayer = barn.flock?.productLine === "LAYER";
  const sum = (t: LotType) => totals.find((x) => x.type === t);
  const eggs = sum("EGG")?._sum.qty ?? 0;
  const meatBirds = sum("MEAT")?._sum.qty ?? 0;
  const meatKg = sum("MEAT")?._sum.weightKg ?? 0;

  /** Lô còn trong hạn nông trại giữ hộ — sau này đây là thứ bán lại được trên chợ. */
  const conHan = lots.filter((l) => l.status === "AT_FARM" && daysLeft(l.collectedAt) > 0);

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
        từ lúc thu — hết hạn thì nông trại báo bạn để thu xếp nhận.
      </p>

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
                  {l.status === "AT_FARM" ? keepLabel(l.collectedAt) : LOT_STATUS_VI[l.status] ?? l.status}
                </div>

                {/* Bán lại — chỉ hiện cho CHỦ LÔ, và chỉ khi lô còn ở nông trại trong hạn.
                    Giá hiện ở đây chỉ để xem trước; `listLot` tra bảng giá và tính lại
                    toàn bộ ở server (§9.6). */}
                {l.ownerId === me.id && l.status === "AT_FARM" && !quaHan && (() => {
                  const type = l.type as LotType;
                  const unit = priceFor(prices, type, barn.flock?.breed?.slug);
                  const money = unit
                    ? lotMoney(unit, { type, qty: l.qty, weightKg: l.weightKg })
                    : null;
                  return (
                    <ListLotButton
                      lotId={l.id}
                      priceVnd={money?.priceVnd ?? null}
                      netVnd={money?.netVnd ?? null}
                      disabledReason={
                        type === "MEAT" && !l.weightKg
                          ? "Chưa có số cân — nhờ nông dân cân giúp thì mới bán lại được."
                          : null
                      }
                    />
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
