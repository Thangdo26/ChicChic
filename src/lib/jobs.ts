// VIỆC NỀN CHẠY THEO NGÀY — bốn thứ trong hệ thống chỉ có thể xảy ra khi THỜI GIAN
// trôi qua, chứ không có ai bấm nút để kích hoạt.
//
// Trước file này repo hoàn toàn không có job nền nào (CODEMAP §11.10), và hậu quả nằm
// rải khắp sản phẩm: đàn gà kẹt ở `BROODING` vĩnh viễn nên chuồng gà đẻ không bao giờ
// tới ngày đẻ; chỗ giữ trên chợ chỉ được nhả khi tình cờ có người khác bấm mua; lô quá
// hạn giữ hộ không ai đóng sổ; hoá đơn trang trí bỏ quên giữ hàng của người khác mãi.
//
// File này KHÔNG có "use server" (giống `notify.ts`, `task-store.ts`, `track.ts`): nó
// TIN dữ liệu đưa vào và không tự kiểm quyền. Cửa vào duy nhất là
// `app/api/cron/route.ts`, và cổng quyền nằm ở đó.
//
// ⭐ BA LUẬT CHUNG cho mọi việc trong file này:
//
//  1. **So-sánh-rồi-đặt** (§9.24). Việc nền chạy song song với người dùng thật: đúng
//     lúc job định nhả một chỗ giữ thì người mua có thể vừa chuyển khoản xong. Mọi
//     phép đổi trạng thái đều mang điều kiện cũ ngay trong `WHERE` rồi xét `count`.
//  2. **Không đụng vào tiền đã trả.** Không có nhánh nào chạm tới `PAID`/`DELIVERED`
//     hay hoá đơn `REPORTED` — người đã nói "tôi chuyển rồi" thì phải để người thật
//     đối soát, tự huỷ là cách chắc chắn nhất để một hôm nào đó nuốt mất tiền của khách.
//  3. **Một việc hỏng không được kéo ba việc kia chết theo.** Mỗi việc tự bắt lỗi và
//     ghi vào `errors`; route trả 500 để lần chạy hiện đỏ trên Vercel, nhưng ba việc
//     còn lại vẫn chạy xong.
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notify";
import { plannedStage, stageMilestone, type FlockStage } from "@/lib/flock";
import { LOT_KEEP_DAYS, lotSummary, type LotType } from "@/lib/harvest";
import { RESERVE_HOLD_MINUTES } from "@/lib/market";
import { DECOR_ORDER_EXPIRE_HOURS } from "@/lib/decor";

export type JobReport = {
  ok: boolean;
  ms: number;
  /** Số đàn sang giai đoạn mới, tách theo giai đoạn đích. */
  flocksAdvanced: Record<string, number>;
  /** Chỗ giữ trên chợ hết hạn, đã nhả về "đang rao". */
  holdsReleased: number;
  /** Tin đăng bị rút vì lô hết hạn nông trại giữ hộ. */
  listingsWithdrawn: number;
  /** Lô nằm ở nông trại quá `LOT_KEEP_DAYS` ngày, đã đóng sổ. */
  lotsExpired: number;
  /** Hoá đơn trang trí bỏ quên, đã huỷ và trả hàng về kho. */
  decorOrdersCancelled: number;
  errors: string[];
};

/** Chạy cả bốn việc. Không bao giờ ném lỗi ra ngoài — lỗi nằm trong `report.errors`. */
export async function runDailyJobs(): Promise<JobReport> {
  const t0 = Date.now();
  const report: JobReport = {
    ok: true, ms: 0,
    flocksAdvanced: {}, holdsReleased: 0, listingsWithdrawn: 0,
    lotsExpired: 0, decorOrdersCancelled: 0, errors: [],
  };

  const run = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      report.ok = false;
      report.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      console.error(`[jobs] "${name}" hỏng`, e);
    }
  };

  await run("dan-lon", async () => { report.flocksAdvanced = await advanceFlocks(); });
  // THỨ TỰ CÓ Ý NGHĨA: nhả chỗ giữ TRƯỚC rồi mới xét hết hạn. Một lô bị người mua giữ
  // chỗ vào ngày thứ 6 rồi bỏ đó sẽ được nhả ra ở bước trên, và tới bước dưới mới đóng
  // sổ được. Làm ngược lại thì nó nằm treo thêm trọn một ngày nữa.
  await run("nha-cho-giu", async () => { report.holdsReleased = await releaseStaleHolds(); });
  await run("lo-het-han", async () => {
    const r = await expireLots();
    report.listingsWithdrawn = r.listingsWithdrawn;
    report.lotsExpired = r.lotsExpired;
  });
  await run("hoa-don-bo-quen", async () => { report.decorOrdersCancelled = await cancelAbandonedDecorOrders(); });

  report.ms = Date.now() - t0;
  return report;
}

// ---------------- 1. Đàn gà lớn lên ----------------

/**
 * Đẩy đàn sang giai đoạn mà LỊCH nói nó đang ở.
 *
 * Luật "cái gì được tự đổi, cái gì phải có ảnh" nằm trong `lib/flock.plannedStage()` —
 * đọc chú thích ở đó trước khi thêm nhánh mới. Tóm tắt: hàm này KHÔNG bao giờ đặt
 * `LAYING` (quả trứng đầu tiên mới được nói câu đó) và KHÔNG bao giờ đặt `HARVESTED`
 * (đó là quyết định của chủ chuồng ở màn kết chu kỳ).
 */
async function advanceFlocks(): Promise<Record<string, number>> {
  const flocks = await prisma.flock.findMany({
    where: { stage: { notIn: ["END_OF_LAY", "HARVESTED", "RETIRED"] } },
    select: {
      id: true, stage: true, productLine: true, startDate: true, cycleDays: true,
      barn: { select: { id: true, slug: true, label: true, ownerId: true, workerId: true } },
    },
  });

  // Gom theo cặp (từ → sang) để mỗi cặp chỉ tốn MỘT câu lệnh, mà `WHERE` vẫn mang được
  // trạng thái cũ (so-sánh-rồi-đặt). Nhiều nhất 4 cặp, nên nhiều nhất 4 lượt đi–về.
  const moves = new Map<string, { from: FlockStage; to: FlockStage; ids: string[] }>();
  const target = new Map<string, FlockStage>();
  for (const f of flocks) {
    const to = plannedStage(f);
    if (!to) continue;
    const from = f.stage as FlockStage;
    const key = `${from}>${to}`;
    if (!moves.has(key)) moves.set(key, { from, to, ids: [] });
    moves.get(key)!.ids.push(f.id);
    target.set(f.id, to);
  }
  if (moves.size === 0) return {};

  for (const m of moves.values()) {
    await prisma.flock.updateMany({
      where: { id: { in: m.ids }, stage: m.from },
      data: { stage: m.to },
    });
  }

  // ĐỌC LẠI rồi mới báo tin. `updateMany` chỉ trả về số dòng, không nói dòng nào — mà
  // một dòng nhật ký "đàn đã qua giai đoạn úm" cho một đàn thật ra không đổi được là
  // một lời nói dối nằm vĩnh viễn trong sổ của chủ chuồng. Một câu lệnh để chắc chắn.
  const after = await prisma.flock.findMany({
    where: { id: { in: [...target.keys()] } },
    select: { id: true, stage: true },
  });
  const moved = new Set(after.filter((f) => f.stage === target.get(f.id)).map((f) => f.id));

  const done: Record<string, number> = {};
  const logs: { barnId: string; workerId: string; kind: "MILESTONE"; text: string }[] = [];
  const pings: Promise<void>[] = [];

  for (const f of flocks) {
    if (!moved.has(f.id)) continue;
    const to = target.get(f.id)!;
    const text = stageMilestone(to, f.productLine);
    done[to] = (done[to] ?? 0) + 1;
    if (!text) continue;

    // `FarmUpdate.workerId` là cột bắt buộc và nhật ký không có tên người thì mất luôn
    // ý nghĩa — cùng luật với `lib/farm-log.stamp()`.
    if (f.barn.workerId) logs.push({ barnId: f.barn.id, workerId: f.barn.workerId, kind: "MILESTONE", text });

    // Cuối chu kỳ là thông báo QUAN TRỌNG NHẤT của cả job: nó mở màn quyết định
    // (nhận thịt / nghỉ hưu / lứa mới), nên nó phải trỏ thẳng vào đó.
    const closing = to === "END_OF_LAY";
    const closingTitle = f.productLine === "BROILER"
      ? `🌾 ${f.barn.label} đã tới ngày xuất chuồng`
      : `🌾 ${f.barn.label} đã hết một chu kỳ đẻ`;
    pings.push(notify({
      userId: f.barn.ownerId,
      kind: "MILESTONE",
      title: closing ? closingTitle : `🐔 ${f.barn.label}: ${text.split(" —")[0]}`,
      body: closing ? "Vào chọn giúp mình chặng tiếp theo cho đàn nhé." : text,
      href: closing ? `/chuong/${f.barn.slug}/ket-chu-ky` : `/chuong/${f.barn.slug}`,
    }));
  }

  if (logs.length) await prisma.farmUpdate.createMany({ data: logs });
  await Promise.all(pings);
  return done;
}

// ---------------- 2. Nhả chỗ giữ trên chợ ----------------

/**
 * Người mua bấm mua rồi không chuyển khoản → trả lô về "đang rao".
 *
 * `reserveListing` đã tự nhả chỗ ngay trong `WHERE` của nó, nhưng chỉ khi có NGƯỜI KHÁC
 * bấm mua. Không ai vào chợ thì lô nằm treo tới lúc hết hạn giữ hộ — người bán mất
 * lượt bán mà không hiểu vì sao (CODEMAP §11.30a).
 *
 * ⚠️ Xoá `payCode` là bắt buộc, không phải dọn dẹp cho đẹp: giữ lại thì người mua cũ
 * chuyển khoản muộn sẽ khớp vào tin đăng mà NGƯỜI KHÁC vừa đặt. Xoá đi thì khoản tiền
 * muộn đó rơi vào `BankTxn` dạng UNMATCHED để người trực xử lý tay — đúng §9.22.
 */
async function releaseStaleHolds(): Promise<number> {
  const cutoff = new Date(Date.now() - RESERVE_HOLD_MINUTES * 60_000);
  const stale = await prisma.marketListing.findMany({
    where: { status: "RESERVED", reservedAt: { lt: cutoff } },
    select: {
      id: true, buyerId: true,
      lot: { select: { type: true, qty: true, weightKg: true } },
    },
  });

  let n = 0;
  for (const l of stale) {
    // So-sánh-rồi-đặt: đúng lúc này người mua có thể vừa trả tiền xong (webhook chạy
    // song song). Điều kiện cũ nằm trong WHERE nên bên thua không đổi được gì.
    const { count } = await prisma.marketListing.updateMany({
      where: { id: l.id, status: "RESERVED", reservedAt: { lt: cutoff } },
      data: { status: "LISTED", buyerId: null, payCode: null, reservedAt: null },
    });
    if (count === 0) continue;
    n++;

    const tomTat = lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg });
    await notify({
      userId: l.buyerId,
      kind: "PAYMENT",
      title: `⌛ Hết hạn giữ chỗ ${tomTat}`,
      body: `Quá ${Math.round(RESERVE_HOLD_MINUTES / 60)} giờ chưa nhận được chuyển khoản nên lô đã quay lại chợ. Mã cũ không dùng được nữa — nếu vẫn muốn mua thì bấm lại giúp mình nhé.`,
      href: "/cho",
    });
  }
  return n;
}

// ---------------- 3. Lô hết hạn nông trại giữ hộ ----------------

/**
 * Đóng sổ những lô đã quá `LOT_KEEP_DAYS` ngày.
 *
 * Hạn giữ hộ trước nay chỉ được tính LÚC HIỂN THỊ (`daysLeft`) và lúc lọc — chưa có gì
 * đặt `LotStatus.EXPIRED` (CODEMAP §11.30b), nên sổ thu hoạch cứ dài ra mãi với những
 * lô thật ra đã không còn.
 *
 * ⚠️ Chỉ đụng vào lô CHƯA ai trả tiền. `SOLD`/`DELIVERED` và tin đăng `RESERVED`/`PAID`
 * nằm ngoài tầm với: có người đã đặt hoặc đã trả tiền thì nông trại còn nợ họ một lần
 * giao hàng, hạn 7 ngày không xoá được món nợ đó.
 */
async function expireLots(): Promise<{ listingsWithdrawn: number; lotsExpired: number }> {
  const cutoff = new Date(Date.now() - LOT_KEEP_DAYS * 86_400_000);

  // (a) Tin còn đang rao mà lô đã quá hạn → rút tin, rồi mới đóng sổ lô.
  const dead = await prisma.marketListing.findMany({
    where: { status: "LISTED", lot: { collectedAt: { lt: cutoff } } },
    select: {
      id: true, sellerId: true, lotId: true,
      lot: { select: { type: true, qty: true, weightKg: true } },
    },
  });

  let listingsWithdrawn = 0;
  for (const l of dead) {
    const { count } = await prisma.marketListing.updateMany({
      where: { id: l.id, status: "LISTED" },
      data: { status: "CANCELLED", buyerId: null, payCode: null, reservedAt: null },
    });
    if (count === 0) continue; // ai đó vừa bấm mua ngay lúc này — để yên cho họ
    listingsWithdrawn++;
    await prisma.harvestLot.update({ where: { id: l.lotId }, data: { status: "EXPIRED" } });

    const tomTat = lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg });
    await notify({
      userId: l.sellerId,
      kind: "MILESTONE",
      title: `⌛ Hết hạn giữ hộ: ${tomTat}`,
      body: `Nông trại giữ hộ ${LOT_KEEP_DAYS} ngày kể từ lúc thu, hết hạn thì tin đăng tự rút. Lần sau đăng bán sớm hơn vài ngày là bán kịp nhé.`,
      href: "/cho/cua-toi",
    });
  }

  // (b) Lô nằm im ở nông trại, chưa từng đăng bán.
  const idle = await prisma.harvestLot.findMany({
    where: { status: "AT_FARM", collectedAt: { lt: cutoff } },
    select: { id: true, ownerId: true, type: true, qty: true, weightKg: true },
  });

  let lotsExpired = listingsWithdrawn;
  if (idle.length) {
    const { count } = await prisma.harvestLot.updateMany({
      where: { id: { in: idle.map((l) => l.id) }, status: "AT_FARM" },
      data: { status: "EXPIRED" },
    });
    lotsExpired += count;

    // GỘP theo người nhận. Một chuồng gà đẻ ghi sổ mỗi ngày, nên tới hạn là cả tuần lô
    // cùng hết một lúc — bắn 7 thông báo rời rạc thì người ta tắt chuông, và tắt chuông
    // là mất luôn cái vòng lặp giữ chân của sản phẩm (§9.8: đừng dội chuông).
    const byOwner = new Map<string, number>();
    for (const l of idle) {
      if (!l.ownerId) continue;
      byOwner.set(l.ownerId, (byOwner.get(l.ownerId) ?? 0) + 1);
    }
    await Promise.all([...byOwner].map(([userId, so]) =>
      notify({
        userId,
        kind: "MILESTONE",
        title: `⌛ ${so} lô đã hết hạn nông trại giữ hộ`,
        body: `Nông trại giữ hộ ${LOT_KEEP_DAYS} ngày kể từ lúc thu. Lô mới thu thì đăng bán trong tuần là kịp.`,
        href: "/cho/cua-toi",
      }),
    ));
  }

  return { listingsWithdrawn, lotsExpired };
}

// ---------------- 4. Hoá đơn trang trí bỏ quên ----------------

/**
 * Huỷ hoá đơn `UNPAID` quá hạn và TRẢ HÀNG VỀ KHO.
 *
 * Đặt hoá đơn là trừ kho ngay để giữ hàng (§9.27). Không có gì tự huỷ thì một chuồng
 * đặt 5 đoạn hàng rào rồi bỏ đó là 5 đoạn nằm treo mãi, không ai mua được, và không ai
 * phát hiện ra cho tới lúc màn hình báo hết hàng trong khi kệ vẫn đầy (§11.26).
 *
 * ⚠️ CHỈ `UNPAID`. Hoá đơn `REPORTED` — người dùng đã bấm "tôi đã chuyển khoản" — tuyệt
 * đối không tự huỷ: tiền của họ có thể đang trên đường, và huỷ đi là trả hàng về kho
 * trong khi vẫn nhận tiền. Loại đó phải để người trực đối soát tay ở `/admin`.
 */
async function cancelAbandonedDecorOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - DECOR_ORDER_EXPIRE_HOURS * 3_600_000);
  const stale = await prisma.decorOrder.findMany({
    where: { paymentStatus: "UNPAID", createdAt: { lt: cutoff } },
    select: {
      id: true, userId: true,
      barn: { select: { label: true, slug: true } },
      items: { select: { itemId: true, qty: true } },
    },
  });

  let n = 0;
  for (const o of stale) {
    // Xoá đơn và cộng kho trong CÙNG một transaction — cùng khuôn với
    // `decor-actions.cancelDecorOrder`. Nửa vời thì hoặc mất hàng, hoặc cộng khống.
    const freed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.decorOrder.deleteMany({
        where: { id: o.id, paymentStatus: "UNPAID" },
      });
      if (count === 0) return false; // vừa có người báo chuyển khoản / xác nhận
      for (const r of o.items) {
        await tx.decorItem.update({ where: { id: r.itemId }, data: { stockQty: { increment: r.qty } } });
      }
      return true;
    });
    if (!freed) continue;
    n++;

    await notify({
      userId: o.userId,
      kind: "PAYMENT",
      title: "🧾 Hoá đơn trang trí đã tự huỷ",
      body: `Quá ${DECOR_ORDER_EXPIRE_HOURS} giờ chưa nhận được chuyển khoản nên hàng đã trả về kho nông trại cho người khác mua. ${o.barn.label} vẫn nguyên vẹn — bạn đặt lại bất cứ lúc nào.`,
      href: `/chuong/${o.barn.slug}/trang-tri`,
    });
  }

  // Số tồn kho ở cửa hàng đi qua cache 1 giờ — vừa trả hàng về mà không đá cache thì
  // người mua vẫn thấy "hết hàng" suốt một tiếng nữa (§9.27).
  if (n > 0) revalidateTag("catalog");
  return n;
}
