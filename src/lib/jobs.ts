// VIỆC NỀN CHẠY THEO NGÀY - những thứ trong hệ thống chỉ có thể xảy ra khi THỜI GIAN
// trôi qua, chứ không có ai bấm nút để kích hoạt.
//
// Bốn việc đầu ĐỔI dữ liệu. Việc thứ năm (`remindStuff`) không đổi gì cả, nó chỉ NÓI -
// dành cho lớp khoảng trống mà hệ thống không được phép tự quyết thay người dùng.
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
//     hay hoá đơn `REPORTED` - người đã nói "tôi chuyển rồi" thì phải để người thật
//     đối soát, tự huỷ là cách chắc chắn nhất để một hôm nào đó nuốt mất tiền của khách.
//  3. **Một việc hỏng không được kéo ba việc kia chết theo.** Mỗi việc tự bắt lỗi và
//     ghi vào `errors`; route trả 500 để lần chạy hiện đỏ trên Vercel, nhưng ba việc
//     còn lại vẫn chạy xong.
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notify";
import { ghiNhieuSuKien } from "@/lib/su-kien";
import { dungKhoanhKhac } from "@/lib/bai-hoc";
import type { NguonSuKien } from "@/lib/su-kien-meta";
import {
  ENDOFLAY_NUDGE_DAYS, daysSinceCycleEnd, plannedStage, stageLabel, stageMilestone,
  type FlockStage,
} from "@/lib/flock";
import { LOT_EXPIRY_WARN_DAYS, LOT_KEEP_DAYS, daysLeft, lotSummary, type LotType } from "@/lib/harvest";
import { MARKET_REPORTED_NUDGE_HOURS, RESERVE_HOLD_MINUTES } from "@/lib/market";
import { NHAC_CHI_TRA_GIO, NHAC_HOAN_GIO } from "@/lib/hang-doi";
import { DECOR_ORDER_EXPIRE_HOURS, DECOR_REPORTED_NUDGE_HOURS } from "@/lib/decor";
import { TASK_STALE_DAYS, TASK_META, type TaskKind } from "@/lib/tasks";
import { CARE_NHAC_TRUOC_NGAY, ngayConLai } from "@/lib/care";
import { hoaDonLabel, invoiceTinhTrang } from "@/lib/billing";
import { billingCuaChuong, ensureInvoices } from "@/lib/invoices";
import { upsertTask } from "@/lib/task-store";
import { tuanCanCan } from "@/lib/weighin";

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
  /** Số lời nhắc đã gửi, tách theo loại. Xem `remindStuff()`. */
  nudges: Record<string, number>;
  /**
   * Chuồng đang gắn tên một nông dân tạm dừng, tại thời điểm chạy.
   *
   * KHÔNG phải "số lời nhắc" - đây là con số hiện trạng, in ra mỗi lần chạy để nó có
   * mặt trong log Vercel kể cả khi hệ thống chưa có tài khoản `role = ADMIN` nào để
   * gửi chuông tới.
   */
  orphanBarns: number;
  /** Hoá đơn `REPORTED` đang chờ người thật đối soát, tại thời điểm chạy. Cùng lý do trên. */
  decorReportedPending: number;
  /** ĐƠN CHỢ `REPORTED` đang chờ đối soát, tại thời điểm chạy. Cùng lý do trên. */
  marketReportedPending: number;
  /** Yêu cầu hoàn tiền treo quá `NHAC_HOAN_GIO` - tiền nông trại nợ NGƯỜI MUA. */
  refundPending: number;
  /** Khoản chi đã bấm rút quá `NHAC_CHI_TRA_GIO` - tiền nợ NGƯỜI BÁN. */
  payoutPending: number;
  /** Giỏ rỗng bỏ quên đã dọn trong lần chạy này. */
  emptyCartsCleaned: number;
  /** Dòng đếm tần suất đã hết hạn, dọn trong lần chạy này (§11.50). */
  rateLimitsCleaned: number;
  /** Hoá đơn tiền nuôi vừa phát hành trong lần chạy này. */
  invoicesIssued: number;
  /** Số chuồng đang bị khoá vì hoá đơn quá hạn, tại thời điểm chạy. */
  barnsLocked: number;
  /** Việc "cân mẫu đàn" vừa giao cho nông dân trong lần chạy này. */
  weighTasks: number;
  /** Bài học dựng được cho bé trong lần chạy này (§9.39). */
  momentsCreated: number;
  /** Sự kiện đã xét nhưng không có bài - đã ghi biên nhận để lần sau khỏi duyệt lại. */
  momentsSkipped: number;
  /** Sự kiện dựng bài hỏng - xem khối chẩn đoán ở `/admin`. */
  momentsFailed: number;
  errors: string[];
};

/** Chạy cả bốn việc. Không bao giờ ném lỗi ra ngoài - lỗi nằm trong `report.errors`. */
export async function runDailyJobs(): Promise<JobReport> {
  const t0 = Date.now();
  const report: JobReport = {
    ok: true, ms: 0,
    flocksAdvanced: {}, holdsReleased: 0, listingsWithdrawn: 0,
    lotsExpired: 0, decorOrdersCancelled: 0,
    nudges: {}, orphanBarns: 0, decorReportedPending: 0, marketReportedPending: 0,
    refundPending: 0, payoutPending: 0, emptyCartsCleaned: 0, rateLimitsCleaned: 0,
    invoicesIssued: 0, barnsLocked: 0, weighTasks: 0,
    momentsCreated: 0, momentsSkipped: 0, momentsFailed: 0, errors: [],
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
  // Phát hoá đơn tiền nuôi cho MỌI chuồng đang nuôi. Trang chuồng cũng gọi
  // `ensureInvoices` khi chủ chuồng mở app, nhưng người không bao giờ mở app vẫn phải có
  // hoá đơn - nếu không thì "không dùng app" thành cách trốn tiền.
  await run("phat-hoa-don", async () => {
    const r = await issueInvoices();
    report.invoicesIssued = r.issued;
    report.barnsLocked = r.locked;
  });
  await run("hen-can-dan", async () => { report.weighTasks = await scheduleWeighIns(); });
  // Dựng bài học cho bé từ những việc thật đã xảy ra (§9.39). Đặt SAU `dan-lon` là có ý:
  // việc đó vừa phát `FLOCK_STAGE_CHANGED`, nên đàn vừa qua chặng đêm nay là có bài ngay
  // sáng mai, không phải chờ thêm một vòng.
  //
  // Cờ tổng tắt ⟹ `dungKhoanhKhac` tự trả về rỗng, không chạm DB. Hỏng ⟹ `run` nuốt vào
  // `report.errors`: chương trình học không được phép kéo theo việc của nông trại.
  await run("bai-hoc-cho-be", async () => {
    const r = await dungKhoanhKhac();
    report.momentsCreated = r.taoBai;
    report.momentsSkipped = r.boQua;
    report.momentsFailed = r.hong;
  });
  // SAU CÙNG, và cố ý: bốn việc trên vừa đổi đúng những thứ mà vòng nhắc đi soi. Chạy
  // trước thì nó sẽ nhắc về một lô mà một giây sau chính job này đóng sổ.
  await run("nhac-viec-bo-quen", async () => {
    const r = await remindStuff();
    report.nudges = r.sent;
    report.orphanBarns = r.orphanBarns;
    report.decorReportedPending = r.decorReportedPending;
    report.marketReportedPending = r.marketReportedPending;
    report.refundPending = r.refundPending;
    report.payoutPending = r.payoutPending;
  });
  await run("don-gio-mo-coi", async () => { report.emptyCartsCleaned = await cleanupEmptyCarts(); });
  await run("don-dem-tan-suat", async () => { report.rateLimitsCleaned = await cleanupRateLimits(); });
  await run("don-dau-nhac-cu", cleanupNudges);

  report.ms = Date.now() - t0;
  return report;
}

// ---------------- 6. Hẹn cân đàn gà thịt hằng tuần ----------------

/**
 * Mỗi tuần giao cho nông dân MỘT việc "cân mẫu đàn" cho mỗi chuồng gà thịt đang nuôi.
 *
 * Vì sao là việc nền chứ không phải nút bấm của chủ chuồng: chủ chuồng không biết tuần
 * này đã cân chưa, và bắt họ đi xin từng tuần thì phần lớn sẽ không xin - rồi cả lứa
 * trôi qua không có một con số nào. Cái đồng hồ nhớ giúp, đúng loại việc §9.30 cho phép
 * việc nền làm: nó **giao một việc**, không khẳng định gì về đàn gà.
 *
 * Ba chốt để nó không thành cỗ máy làm phiền:
 *  · `upsertTask` gộp vào việc đang mở ⟹ cô chú bỏ lỡ hai tuần thì vẫn chỉ có MỘT việc
 *    trong hộp, không phải một danh sách nợ (§9.8 - người bị dội là người tắt chuông);
 *  · đã cân tuần này rồi thì bỏ qua hẳn;
 *  · **không đòi bù tuần đã trôi qua** - quá khứ không cân lại được (`tuanCanCan`).
 */
async function scheduleWeighIns(): Promise<number> {
  const flocks = await prisma.flock.findMany({
    where: {
      productLine: "BROILER",
      stage: { in: ["BROODING", "GROWING", "FINISHING"] },
      barn: { workerId: { not: null }, ownerId: { not: null } },
    },
    select: {
      id: true, startDate: true,
      barn: { select: { id: true, slug: true, label: true, workerId: true, ownerId: true } },
      weighIns: { select: { weekNo: true } },
    },
  });

  let n = 0;
  for (const f of flocks) {
    const tuan = tuanCanCan(f.startDate, f.weighIns.map((x) => x.weekNo));
    if (tuan === null) continue;
    // Tuần 1 là tuần đàn vừa được thả - cân gà con mới về vừa vô nghĩa vừa làm chúng
    // stress. Bắt đầu từ tuần 2.
    if (tuan < 2) continue;

    const { created } = await upsertTask({
      barnId: f.barn.id,
      workerId: f.barn.workerId!,
      requestedById: f.barn.ownerId!,
      kind: "WEIGH",
      title: TASK_META.WEIGH.label,
      note: `Tuần ${tuan} của lứa. Cân 3–5 con bất kỳ rồi ghi số trung bình (theo GAM) vào ô "Cân nặng tuần ${tuan}".`,
    });
    if (created) n++;
  }
  return n;
}

// ---------------- 5. Hoá đơn tiền nuôi ----------------

/**
 * Phát hoá đơn còn thiếu cho mọi chuồng đang nuôi.
 *
 * Vì sao cần cả ở đây lẫn ở trang chuồng: trang chuồng chỉ chạy khi chủ chuồng MỞ APP.
 * Không có nhánh này thì "không mở app" trở thành cách trốn tiền - và đó là đúng nhóm
 * người mà nông trại đang nuôi hộ miễn phí.
 *
 * Chống trùng nằm ở `@@unique([barnId, seq])` nên hai đường cùng chạy là vô hại.
 */
async function issueInvoices(): Promise<{ issued: number; locked: number }> {
  // Chỉ chuồng đã kích hoạt và đàn còn đang nuôi. Đàn đã khép (`HARVESTED`/`RETIRED`)
  // hay đang chờ quyết định (`END_OF_LAY`) thì `ensureInvoices` tự bỏ qua, nhưng lọc
  // sẵn ở đây cho đỡ kéo về hàng loạt chuồng không liên quan.
  const barns = await prisma.barn.findMany({
    where: {
      ownerId: { not: null },
      // Chuồng trưng bày không phát hoá đơn (xem `BarnBilling.isPublic`). `ensureInvoices`
      // cũng tự chặn, nhưng lọc sẵn ở đây thì khỏi kéo về rồi bỏ.
      isPublic: false,
      reservation: { paymentStatus: "CONFIRMED" },
      flock: { stage: { notIn: ["END_OF_LAY", "HARVESTED", "RETIRED"] } },
    },
    select: { slug: true },
  });

  let issued = 0;
  for (const b of barns) {
    const bill = await billingCuaChuong(b.slug);
    if (bill) issued += await ensureInvoices(bill);
  }

  const locked = await prisma.barnInvoice.groupBy({
    by: ["barnId"],
    where: { paymentStatus: { not: "CONFIRMED" }, dueAt: { lt: new Date() } },
  });
  return { issued, locked: locked.length };
}

// ---------------- 1. Đàn gà lớn lên ----------------

/**
 * Đẩy đàn sang giai đoạn mà LỊCH nói nó đang ở.
 *
 * Luật "cái gì được tự đổi, cái gì phải có ảnh" nằm trong `lib/flock.plannedStage()` -
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

  // ĐỌC LẠI rồi mới báo tin. `updateMany` chỉ trả về số dòng, không nói dòng nào - mà
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
  const suKien: NguonSuKien[] = [];

  for (const f of flocks) {
    if (!moved.has(f.id)) continue;
    const to = target.get(f.id)!;
    const text = stageMilestone(to, f.productLine);
    done[to] = (done[to] ?? 0) + 1;

    // ⚠️ **Nguồn DUY NHẤT trong bảy nguồn không ghi sự kiện trong transaction của chính nó**
    // (§14.3 nói "khi có thể"). Ở đây `updateMany` gom nhiều đàn một câu lệnh và **không nói
    // đàn nào đã đổi** - nên phải đọc lại (`moved` ngay trên) mới biết sự thật, và lúc đó
    // transaction đã đóng. Đổi lại: chỉ đàn đã đọc-lại-xác-nhận mới có sự kiện, và khoá
    // `flock-stage:<flockId>:<chặng>` khiến lần chạy sau ghi đè lên chính nó chứ không nhân
    // đôi. Cái mất là quãng giữa hai câu lệnh: tiến trình chết đúng lúc đó thì đàn đã sang
    // chặng mới mà sự kiện không có, và ngày mai không phát hiện lại được nữa. Chấp nhận -
    // đổi lại là không giữ khoá trên bảng `Flock` suốt cả vòng lặp thông báo.
    suKien.push({
      type: "FLOCK_STAGE_CHANGED",
      flockId: f.id, barnId: f.barn.id,
      from: f.stage as FlockStage, to, productLine: f.productLine,
    });

    if (!text) continue;

    // `FarmUpdate.workerId` là cột bắt buộc và nhật ký không có tên người thì mất luôn
    // ý nghĩa - cùng luật với `lib/farm-log.stamp()`.
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
      title: closing ? closingTitle : `🐔 ${f.barn.label}: ${text.split(" -")[0]}`,
      body: closing ? "Vào chọn giúp mình chặng tiếp theo cho đàn nhé." : text,
      href: closing ? `/chuong/${f.barn.slug}/ket-chu-ky` : `/chuong/${f.barn.slug}`,
    }));
  }

  if (logs.length) await prisma.farmUpdate.createMany({ data: logs });
  await ghiNhieuSuKien(prisma, suKien, new Date());
  await Promise.all(pings);
  return done;
}

// ---------------- 2. Nhả chỗ giữ trên chợ ----------------

/**
 * Người mua giữ chỗ rồi không chuyển khoản → trả lô về "đang rao".
 *
 * `themVaoGio` đã tự nhả chỗ ngay trong `WHERE` của nó, nhưng chỉ khi có NGƯỜI KHÁC
 * bấm mua, và **chỉ với lô còn nằm trong giỏ** (§9.34). Không ai vào chợ thì lô nằm
 * treo tới lúc hết hạn giữ hộ - người bán mất lượt bán mà không hiểu vì sao (§11.30a).
 *
 * ⚠️ **Làm việc ở mức ĐƠN, không ở mức tin đăng** (sửa ở Đợt 15). Bản trước viết khi
 * chưa có `MarketOrder`: nó nhả từng `MarketListing` rồi xoá `MarketListing.payCode` -
 * một cột không còn mang mã nào từ Đợt 13. Hậu quả là lô về lại chợ nhưng **`MarketOrder`
 * vẫn `RESERVED` với `payCode` còn sống**: người mua vẫn thấy mã QR, vẫn chuyển khoản
 * được, và webhook vẫn khớp mã đó vào một đơn không còn lô nào. Nay huỷ cả đơn, xoá mã
 * ở đúng chỗ nó nằm, và báo **một** chuông cho cả đơn thay vì mỗi lô một chuông (§9.8).
 *
 * ⚠️ Xoá `payCode` là bắt buộc, không phải dọn cho đẹp: giữ lại thì khoản chuyển khoản
 * muộn khớp vào một đơn đã chết. Xoá đi thì tiền muộn rơi vào `BankTxn` dạng UNMATCHED
 * để người trực xử lý tay - đúng §9.22.
 *
 * ⚠️ **KHÔNG đụng vào đơn `REPORTED`** (§9.34) - cùng luật với hoá đơn trang trí: người
 * đã bấm "tôi đã chuyển khoản" thì tiền có thể đang trên đường, huỷ đi là vừa nhả hàng
 * cho người khác vừa nhận tiền của họ. Loại đó chỉ được **nhắc** ở `remindStuff`.
 */
async function releaseStaleHolds(): Promise<number> {
  const cutoff = new Date(Date.now() - RESERVE_HOLD_MINUTES * 60_000);

  // Lô quá hạn, gom theo ĐƠN. Đơn `REPORTED`/`PAID`/`DELIVERED` bị loại ngay ở đây.
  const stale = await prisma.marketListing.findMany({
    where: {
      status: "RESERVED",
      reservedAt: { lt: cutoff },
      OR: [{ orderId: null }, { order: { status: { in: ["OPEN", "RESERVED"] } } }],
    },
    select: {
      id: true, buyerId: true, orderId: true,
      order: { select: { status: true } },
      lot: { select: { type: true, qty: true, weightKg: true } },
    },
  });
  if (stale.length === 0) return 0;

  const theoDon = new Map<string, typeof stale>();
  for (const l of stale) theoDon.set(l.orderId ?? `le:${l.id}`, [...(theoDon.get(l.orderId ?? `le:${l.id}`) ?? []), l]);

  let n = 0;
  for (const lo of theoDon.values()) {
    const orderId = lo[0].orderId;
    const daChot = lo[0].order?.status === "RESERVED";
    // So-sánh-rồi-đặt: đúng lúc này người mua có thể vừa bấm "đã chuyển khoản" hoặc
    // webhook vừa xác nhận. Điều kiện cũ nằm trong WHERE nên bên thua không đổi được gì.
    const { count } = await prisma.marketListing.updateMany({
      where: {
        id: { in: lo.map((l) => l.id) },
        status: "RESERVED",
        reservedAt: { lt: cutoff },
        OR: [{ orderId: null }, { order: { status: { in: ["OPEN", "RESERVED"] } } }],
      },
      data: { status: "LISTED", buyerId: null, payCode: null, reservedAt: null, orderId: null },
    });
    if (count === 0) continue;
    n += count;

    // Huỷ luôn cái đơn rỗng còn lại. `CANCELLED` chứ không xoá: nó là dấu vết một lần
    // người ta suýt mua, và mã đã phát ra ngoài đời thì phải còn tra ngược được.
    if (orderId) {
      await prisma.marketOrder.updateMany({
        where: { id: orderId, status: { in: ["OPEN", "RESERVED"] } },
        data: { status: "CANCELLED", payCode: null },
      });
    }

    const tomTat = lo
      .map((l) => lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg }))
      .join(" + ");
    const gio = Math.round(RESERVE_HOLD_MINUTES / 60);
    await notify({
      userId: lo[0].buyerId,
      kind: "PAYMENT",
      title: `⌛ Hết hạn giữ chỗ ${lo.length > 1 ? `${lo.length} lô` : tomTat}`,
      body: daChot
        ? `Quá ${gio} giờ chưa nhận được chuyển khoản nên đơn đã huỷ và lô quay lại chợ. Mã cũ không dùng được nữa - nếu bạn vừa chuyển tiền thì nhắn nông trại ngay giúp mình.`
        : `Quá ${gio} giờ chưa chốt đơn nên ${tomTat} đã quay lại chợ cho người khác. Vẫn muốn mua thì bỏ vào giỏ lại giúp mình nhé.`,
      href: "/cho",
    });
  }
  return n;
}

/**
 * Xoá GIỎ RỖNG bỏ quên - hàng `MarketOrder` `OPEN` không còn lô nào.
 *
 * `gioDangMo` cố ý không có khoá `@@unique([buyerId, status])` (lý do ghi ở schema), nên
 * hai tab cùng lúc đẻ ra một giỏ thừa; và mỗi lần `boKhoiGio` bỏ nốt lô cuối, hoặc
 * `releaseStaleHolds` nhả hết lô của một giỏ, thì cái vỏ rỗng ở lại. §11.45 đã ghi trước
 * là "thấy tích lại thì dọn bằng cron" - đây là chỗ đó.
 *
 * ⚠️ **XOÁ hẳn, không `CANCELLED`** - khác hẳn `releaseStaleHolds`. Ở đó cái đơn từng
 * mang `payCode` phát ra ngoài đời nên phải tra ngược được; còn ở đây là một hàng chưa
 * bao giờ có mã, chưa bao giờ có lô, chưa ai chuyển đồng nào. Giữ lại chỉ là rác, mà
 * `CANCELLED` rỗng thì lại lẫn vào danh sách đơn đã huỷ THẬT của người dùng.
 *
 * ⚠️ Chỉ đụng giỏ đã cũ (`ONE_DAY`): người đang gom giỏ ngay lúc này có thể vừa bỏ lô
 * cuối ra để chọn lại, và xoá mất giỏ dưới tay họ thì lần bấm sau đẻ ra một giỏ khác -
 * vô hại, nhưng là một thứ nhấp nháy không có lý do.
 */
async function cleanupEmptyCarts(): Promise<number> {
  const { count } = await prisma.marketOrder.deleteMany({
    where: {
      status: "OPEN",
      createdAt: { lt: new Date(Date.now() - 86_400_000) },
      listings: { none: {} },
    },
  });
  return count;
}

/**
 * Dọn bộ đếm của hàng rào tần suất (§11.50).
 *
 * `RateLimit` đẻ một dòng cho mỗi (ngăn, khoá) từng chạm tới - mà khoá thì gồm cả **email
 * người gọi tự bịa** và **địa chỉ mạng**, tức là một tập không có trần. Không dọn thì bảng
 * này lớn mãi và trở thành phần tốn chỗ nhất của cả DB, vì một thứ chỉ có ý nghĩa trong
 * vài chục phút.
 *
 * Ngưỡng rộng nhất là 60 phút, nên **24 giờ là thừa an toàn**: dòng cũ hơn thế chắc chắn
 * đã hết cửa sổ và lượt gọi tiếp theo đằng nào cũng ghi lại từ đầu. Xoá nhầm một dòng còn
 * hạn cũng chỉ mở lại một cửa sổ đếm, không mất gì.
 */
async function cleanupRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { windowAt: { lt: new Date(Date.now() - 86_400_000) } },
  });
  return count;
}

// ---------------- 3. Lô hết hạn nông trại giữ hộ ----------------

/**
 * Đóng sổ những lô đã quá `LOT_KEEP_DAYS` ngày.
 *
 * Hạn giữ hộ trước nay chỉ được tính LÚC HIỂN THỊ (`daysLeft`) và lúc lọc - chưa có gì
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
    if (count === 0) continue; // ai đó vừa bấm mua ngay lúc này - để yên cho họ
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
    // cùng hết một lúc - bắn 7 thông báo rời rạc thì người ta tắt chuông, và tắt chuông
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
 * ⚠️ CHỈ `UNPAID`. Hoá đơn `REPORTED` - người dùng đã bấm "tôi đã chuyển khoản" - tuyệt
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
    // Xoá đơn và cộng kho trong CÙNG một transaction - cùng khuôn với
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
      body: `Quá ${DECOR_ORDER_EXPIRE_HOURS} giờ chưa nhận được chuyển khoản nên hàng đã trả về kho nông trại cho người khác mua. ${o.barn.label} vẫn nguyên vẹn - bạn đặt lại bất cứ lúc nào.`,
      href: `/chuong/${o.barn.slug}/trang-tri`,
    });
  }

  // Số tồn kho ở cửa hàng đi qua cache 1 giờ - vừa trả hàng về mà không đá cache thì
  // người mua vẫn thấy "hết hàng" suốt một tiếng nữa (§9.27).
  if (n > 0) revalidateTag("catalog");
  return n;
}

// ---------------- 5. Vòng nhắc ----------------
//
// Bốn việc trên ĐỔI dữ liệu khi thời gian trôi. Việc thứ năm này không đổi gì cả - nó
// chỉ NÓI. Lý do nó tồn tại: có một lớp khoảng trống mà hệ thống không được phép tự
// quyết thay người ta (§9.2 - app không đổi hiện thực), nên thứ duy nhất làm được là
// gõ cửa. Trước bản này cả năm chỗ dưới đây đều im lặng tuyệt đối:
//
//   · đàn END_OF_LAY chủ chuồng chưa quyết định   → nằm đó vô hạn (§11.10)
//   · lô sắp hết hạn giữ hộ                        → chỉ báo SAU khi đã mất
//   · việc giao cho nông dân nằm im nhiều ngày     → chủ chuồng chờ mà không biết chờ ai
//   · hoá đơn REPORTED chưa ai đối soát            → giữ hàng vô hạn (§11.26)
//   · chuồng của nông dân bị tạm dừng              → chuồng có chủ mà không ai chăm (§11.9)
//
// ⭐ LUẬT RIÊNG của vòng này: **nhắc một lần, không nhắc mỗi ngày.** Job chạy hằng ngày
// trên cùng một tập dữ liệu, nên không có dấu "đã nhắc rồi" thì mỗi sáng người dùng
// nhận lại đúng dòng chuông cũ - và người bị dội chuông sẽ tắt chuông, tức là mất luôn
// vòng lặp giữ chân của sản phẩm (§9.8). Dấu đó là bảng `Nudge`.

/** Nhắc lại cùng một chuyện sau ngần này ngày, nếu nó vẫn chưa được xử lý. */
const NUDGE_COOLDOWN_DAYS = 14;
/** Dọn dấu nhắc cũ hơn ngần này ngày - bảng này không cần lịch sử. */
const NUDGE_KEEP_DAYS = 90;

/**
 * Lọc ra những khoá CHƯA nhắc (hoặc đã quá hạn nhắc lại), và đánh dấu luôn.
 *
 * Ba câu lệnh cho cả lô thay vì ba câu cho mỗi đối tượng - DB ở xa, mỗi lượt đi–về là
 * tiền thật (§10).
 *
 * ⚠️ Không phải claim nguyên tử tuyệt đối: hai lần chạy chồng lên nhau có thể cùng đọc
 * ra một khoá rồi cùng gửi (`skipDuplicates` chặn được dòng trùng, không chặn được cái
 * chuông thứ hai). Chấp nhận có ý thức - Vercel Cron chạy 1 lần/ngày và không gọi
 * chồng; đổi lấy nguyên tử thật thì phải `create` từng khoá một, tức N lượt đi–về.
 */
async function dueNudges(keys: string[], cooldownDays = NUDGE_COOLDOWN_DAYS): Promise<Set<string>> {
  const uniq = Array.from(new Set(keys));
  if (uniq.length === 0) return new Set();

  // Dấu quá hạn nhắc lại thì xoá đi - chuyện vẫn chưa được xử lý sau hai tuần thì đáng
  // gõ cửa lần nữa.
  await prisma.nudge.deleteMany({
    where: { key: { in: uniq }, sentAt: { lt: new Date(Date.now() - cooldownDays * 86_400_000) } },
  });
  const already = await prisma.nudge.findMany({ where: { key: { in: uniq } }, select: { key: true } });
  const seen = new Set(already.map((n) => n.key));
  const due = uniq.filter((k) => !seen.has(k));
  if (due.length) {
    await prisma.nudge.createMany({ data: due.map((key) => ({ key })), skipDuplicates: true });
  }
  return new Set(due);
}

async function cleanupNudges(): Promise<void> {
  await prisma.nudge.deleteMany({
    where: { sentAt: { lt: new Date(Date.now() - NUDGE_KEEP_DAYS * 86_400_000) } },
  });
}

async function remindStuff(): Promise<{
  sent: Record<string, number>;
  orphanBarns: number;
  decorReportedPending: number;
  marketReportedPending: number;
  refundPending: number;
  payoutPending: number;
}> {
  const sent: Record<string, number> = {};
  const bump = (k: string, n = 1) => { if (n > 0) sent[k] = (sent[k] ?? 0) + n; };

  // Chín truy vấn KHÔNG phụ thuộc nhau → một đợt. Nối tiếp là chín lượt đi–về xếp hàng.
  const [
    endOfLay, expiring, staleTasks, reportedOrders, orphanBarnRows, admins, hoaDonCho,
    careDue, donChoDoiSoat, hoanCho, chiTraCho,
  ] = await Promise.all([
    prisma.flock.findMany({
      where: { stage: "END_OF_LAY" },
      select: {
        id: true, productLine: true, startDate: true, cycleDays: true,
        barn: { select: { slug: true, label: true, ownerId: true } },
      },
    }),
    // Lô còn nằm ở nông trại và chưa ai đăng bán. Lô đang `LISTED` thì người ta đã làm
    // phần việc của mình rồi - nhắc nữa là phiền.
    prisma.harvestLot.findMany({
      where: {
        status: "AT_FARM",
        collectedAt: { lt: new Date(Date.now() - (LOT_KEEP_DAYS - LOT_EXPIRY_WARN_DAYS) * 86_400_000) },
      },
      select: { id: true, ownerId: true, type: true, qty: true, weightKg: true, collectedAt: true },
    }),
    prisma.barnTask.findMany({
      where: {
        status: "OPEN",
        createdAt: { lt: new Date(Date.now() - TASK_STALE_DAYS * 86_400_000) },
        // Nông dân bị tạm dừng thì việc nằm im KHÔNG phải lỗi của cô chú, và cô chú
        // cũng không đăng nhập được để đọc lời nhắc. Chuồng đó đã có lối riêng bên dưới.
        barn: { worker: { active: true } },
      },
      select: {
        id: true, kind: true, title: true, createdAt: true,
        barn: { select: { slug: true, label: true, worker: { select: { userId: true } } } },
      },
    }),
    prisma.decorOrder.findMany({
      where: {
        paymentStatus: "REPORTED",
        reportedAt: { lt: new Date(Date.now() - DECOR_REPORTED_NUDGE_HOURS * 3_600_000) },
      },
      select: { id: true, payCode: true, totalVnd: true, barn: { select: { label: true } } },
    }),
    prisma.barn.findMany({
      where: { worker: { active: false } },
      select: { id: true, label: true, worker: { select: { name: true } } },
    }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
    // Hoá đơn tiền nuôi chưa trả - để nhắc TRƯỚC khi chuồng bị khoá.
    prisma.barnInvoice.findMany({
      where: { paymentStatus: { not: "CONFIRMED" } },
      select: {
        id: true, seq: true, totalVnd: true, dueAt: true, paymentStatus: true, userId: true,
        barn: { select: { slug: true, label: true, flock: { select: { productLine: true } } } },
      },
    }),
    // Kỳ nuôi dưỡng đàn nghỉ hưu sắp hết. Nhắc TRƯỚC, không báo sau - cùng nguyên tắc
    // với lô sắp hết hạn giữ hộ. Lấy kỳ xa nhất của mỗi chuồng, vì mua nối tiếp thì chỉ
    // mốc cuối cùng mới có nghĩa.
    prisma.careOrder.groupBy({
      by: ["barnId"],
      where: { paymentStatus: "CONFIRMED" },
      _max: { coversTo: true },
    }),
    // ĐƠN CHỢ đã báo chuyển khoản mà chưa ai đối soát (Đợt 15). Cùng vai với
    // `reportedOrders` của trang trí ở trên, và cùng lý do: loại này KHÔNG bao giờ tự
    // huỷ (§9.34) nên nó giữ lô vô hạn - mà ở đầu kia là một người đã chuyển tiền thật
    // và một nông dân chưa nhận được việc giao nào.
    prisma.marketOrder.findMany({
      where: {
        status: "REPORTED",
        reportedAt: { lt: new Date(Date.now() - MARKET_REPORTED_NUDGE_HOURS * 3_600_000) },
      },
      select: { id: true, payCode: true, totalVnd: true },
    }),
    // ⭐ TIỀN NÔNG TRẠI ĐANG NỢ NGƯỜI DÙNG - hai chiều, và trước Đợt 16 **không chiều
    // nào có gì tự nhắc** (§11.49): file này nhắc tới `Refund` đúng 0 lần và `Payout`
    // đúng 0 lần. Cả hai đều chi trả bằng tay (§9.29), nên quên một khoản là im lặng
    // tuyệt đối - không màn hình nào đỏ, và người chờ không có ai để hỏi.
    prisma.refund.findMany({
      where: {
        status: "REQUESTED",
        createdAt: { lt: new Date(Date.now() - NHAC_HOAN_GIO * 3_600_000) },
      },
      select: { id: true, amountVnd: true },
    }),
    // Chỉ khoản người bán ĐÃ BẤM RÚT. `Payout` sinh ngay lúc giao hàng xong, còn người
    // bán có thể để đó vài tuần - gõ cửa người trực về khoản chưa ai đòi là làm phiền
    // vì một chuyện không ai đang đợi.
    prisma.payout.findMany({
      where: {
        status: "PENDING",
        requestedAt: { not: null, lt: new Date(Date.now() - NHAC_CHI_TRA_GIO * 3_600_000) },
      },
      select: { id: true, amountVnd: true },
    }),
  ]);

  // (a) Đàn hết chu kỳ mà chủ chuồng chưa chọn gì.
  const quenQuyetDinh = endOfLay.filter((f) => daysSinceCycleEnd(f) >= ENDOFLAY_NUDGE_DAYS);
  const dueFlocks = await dueNudges(quenQuyetDinh.map((f) => `end_of_lay:${f.id}`));
  await Promise.all(quenQuyetDinh
    .filter((f) => dueFlocks.has(`end_of_lay:${f.id}`))
    .map((f) => {
      bump("end_of_lay");
      return notify({
        userId: f.barn.ownerId,
        kind: "MILESTONE",
        title: `🌾 ${f.barn.label} đang chờ bạn chọn chặng tiếp theo`,
        body: `Đàn đã ở "${stageLabel("END_OF_LAY", f.productLine)}" ${daysSinceCycleEnd(f)} ngày rồi. Các bạn gà vẫn được chăm bình thường - chỉ là đang chờ bạn quyết định.`,
        href: `/chuong/${f.barn.slug}/ket-chu-ky`,
      });
    }));

  // (a1) Hoá đơn tiền nuôi SẮP tới hạn - nhắc TRƯỚC khi khoá.
  //
  // Chỉ nhắc ở trạng thái `sap-den-han`. Đã quá hạn thì THÔI: lúc đó chuồng đã khoá và
  // màn khoá đã nói đủ mọi thứ cần nói, nhắc thêm mỗi ngày chỉ là đòi nợ. Đây cũng là
  // lý do `dueNudges` khoá theo id hoá đơn chứ không theo chuồng - mỗi kỳ nhắc một lần.
  const sapKhoa = hoaDonCho.filter((h) => invoiceTinhTrang(h) === "sap-den-han");
  const dueHd = await dueNudges(sapKhoa.map((h) => `invoice_due:${h.id}`));
  await Promise.all(sapKhoa.map((h) => {
    if (!dueHd.has(`invoice_due:${h.id}`)) return null;
    bump("invoice_due");
    const ten = hoaDonLabel(h.barn.flock?.productLine ?? "BROILER", h.seq).toLowerCase();
    return notify({
      userId: h.userId,
      kind: "PAYMENT",
      title: `🌾 ${h.barn.label} - ${ten} tới hạn ${h.dueAt.toLocaleDateString("vi-VN")}`,
      body: `${h.totalVnd.toLocaleString("vi-VN")}đ. Quá hạn thì trang chuồng tạm khoá, nhưng các bạn gà vẫn được chăm bình thường nhé.`,
      href: `/chuong/${h.barn.slug}`,
    });
  }));

  // (a2) Kỳ nuôi dưỡng đàn nghỉ hưu sắp hết.
  //
  // ⚠️ §9.32 - lời nhắc này KHÔNG được doạ. Không đếm ngược, không "nếu không đóng
  // thì…". Nông trại vẫn nuôi; đây chỉ là một lời nhắc lịch sự về chuyện tiền, gửi cho
  // NGƯỜI. Ai định thêm hậu quả vào đây thì đọc §9.32 trước.
  const capHetHan = careDue.filter((r) => {
    const n = ngayConLai(r._max.coversTo);
    // Chỉ nhắc trong CỬA SỔ trước hạn. Đã quá hạn thì thôi - người ta đã nhận một lời
    // nhắc lúc sắp hết rồi, nhắc lại mỗi ngày sau đó là đòi nợ, không phải nhắc.
    return n !== null && n >= 0 && n <= CARE_NHAC_TRUOC_NGAY;
  });
  if (capHetHan.length) {
    const barns = await prisma.barn.findMany({
      where: { id: { in: capHetHan.map((r) => r.barnId) } },
      select: { id: true, slug: true, label: true, ownerId: true },
    });
    const theoId = new Map(barns.map((b) => [b.id, b]));
    const dueCare = await dueNudges(capHetHan.map((r) => `care_expiring:${r.barnId}`));
    await Promise.all(capHetHan.map((r) => {
      const b = theoId.get(r.barnId);
      if (!b?.ownerId || !dueCare.has(`care_expiring:${r.barnId}`)) return null;
      bump("care_expiring");
      const n = ngayConLai(r._max.coversTo) ?? 0;
      return notify({
        userId: b.ownerId,
        kind: "MILESTONE",
        title: `🌾 ${b.label} sắp tới kỳ đóng nuôi dưỡng`,
        body: `Kỳ hiện tại còn ${n} ngày. Các bạn gà vẫn được chăm bình thường - khi nào tiện thì đóng kỳ tiếp giúp tụi mình nhé.`,
        href: `/chuong/${b.slug}/nghi-huu`,
      });
    }));
  }

  // (b) Lô sắp hết hạn giữ hộ - GỘP theo chủ lô. Một chuồng gà đẻ ghi sổ mỗi ngày nên
  // tới hạn là cả tuần lô cùng sắp hết một lúc; bắn 7 dòng rời rạc là dội chuông (§9.8).
  const dueLots = await dueNudges(expiring.map((l) => `lot_expiring:${l.id}`));
  const lotsByOwner = new Map<string, typeof expiring>();
  for (const l of expiring) {
    if (!l.ownerId || !dueLots.has(`lot_expiring:${l.id}`)) continue;
    if (!lotsByOwner.has(l.ownerId)) lotsByOwner.set(l.ownerId, []);
    lotsByOwner.get(l.ownerId)!.push(l);
  }
  await Promise.all([...lotsByOwner].map(([userId, lots]) => {
    bump("lot_expiring", lots.length);
    // Nói theo lô gấp nhất - người ta cần biết mình còn bao nhiêu thời gian, không cần
    // một danh sách ngày tháng.
    const gap = Math.max(0, Math.min(...lots.map((l) => daysLeft(l.collectedAt))));
    const dau = lots[0];
    return notify({
      userId,
      kind: "MILESTONE",
      title: gap <= 1
        ? `⏳ ${lots.length > 1 ? `${lots.length} lô` : lotSummary({ type: dau.type as LotType, qty: dau.qty, weightKg: dau.weightKg })} chỉ còn hôm nay`
        : `⏳ ${lots.length > 1 ? `${lots.length} lô` : lotSummary({ type: dau.type as LotType, qty: dau.qty, weightKg: dau.weightKg })} còn ${gap} ngày giữ hộ`,
      body: `Nông trại giữ hộ ${LOT_KEEP_DAYS} ngày kể từ lúc thu. Hết hạn là lô đóng sổ - đăng bán trên chợ giúp mình trước đó nhé.`,
      href: "/cho/cua-toi",
    });
  }));

  // (c) Việc nằm im quá lâu → nhắc chính nông dân. CỐ Ý không báo cho chủ chuồng ở lần
  // nhắc đầu: mách trước khi hỏi là cách nhanh nhất làm hỏng quan hệ giữa hai bên, mà
  // quan hệ đó chính là thứ sản phẩm này bán.
  const dueTasks = await dueNudges(staleTasks.map((t) => `task_stale:${t.id}`));
  await Promise.all(staleTasks
    .filter((t) => dueTasks.has(`task_stale:${t.id}`))
    .map((t) => {
      bump("task_stale");
      const meta = TASK_META[t.kind as TaskKind];
      const ngay = Math.floor((Date.now() - t.createdAt.getTime()) / 86_400_000);
      return notify({
        userId: t.barn.worker?.userId,
        kind: "TASK_NEW",
        title: `${meta.emoji} "${meta.label}" đã chờ ${ngay} ngày`,
        body: `${t.barn.label} · Làm chưa được thì bấm "Không làm được" kèm lý do cũng là nói thật giúp chủ chuồng rồi.`,
        href: `/nong-trai/chuong/${t.barn.slug}#viec`,
      });
    }));

  // (d) + (e) Hai chuyện chỉ NÔNG TRẠI xử lý được.
  //
  // ⚠️ Chưa có tài khoản `role = ADMIN` nào thì **không claim dấu nhắc** - claim rồi
  // mà không gửi được cho ai là chôn luôn chuyện đó 14 ngày. Đổi lại, hai con số hiện
  // trạng LUÔN đi vào `JobReport` để chúng có mặt trong log Vercel mỗi lần chạy: quản
  // trị của repo này đi bằng Basic Auth, hoàn toàn có thể không có `User` nào cả.
  if (admins.length) {
    const dueOrders = await dueNudges(reportedOrders.map((o) => `decor_reported:${o.id}`));
    const canDoiSoat = reportedOrders.filter((o) => dueOrders.has(`decor_reported:${o.id}`));
    const dueOrphans = await dueNudges(orphanBarnRows.map((b) => `orphan_barn:${b.id}`));
    const chuongKet = orphanBarnRows.filter((b) => dueOrphans.has(`orphan_barn:${b.id}`));

    // Đếm theo SỐ CHUYỆN, không phải số chuông: hai admin cùng nhận một lời nhắc vẫn
    // là một hoá đơn cần đối soát.
    const dueCho = await dueNudges(donChoDoiSoat.map((o) => `market_reported:${o.id}`));
    const choDoiSoat = donChoDoiSoat.filter((o) => dueCho.has(`market_reported:${o.id}`));

    bump("decor_reported", canDoiSoat.length);
    bump("orphan_barn", chuongKet.length);
    bump("market_reported", choDoiSoat.length);

    // Hai hàng đợi TIỀN ĐI RA. Gộp thành MỘT chuông mỗi loại chứ không phải một chuông
    // mỗi khoản: người trực cần biết "có N khoản đang treo, mở /admin xem", còn dội
    // mười chuông cho mười khoản là cách nhanh nhất để họ tắt chuông (§9.8).
    const dueHoan = await dueNudges(hoanCho.map((r) => `refund_stuck:${r.id}`));
    const hoanKet = hoanCho.filter((r) => dueHoan.has(`refund_stuck:${r.id}`));
    const dueChi = await dueNudges(chiTraCho.map((r) => `payout_stuck:${r.id}`));
    const chiKet = chiTraCho.filter((r) => dueChi.has(`payout_stuck:${r.id}`));
    bump("refund_stuck", hoanKet.length);
    bump("payout_stuck", chiKet.length);
    const tong = (rs: { amountVnd: number }[]) =>
      rs.reduce((t, r) => t + r.amountVnd, 0).toLocaleString("vi-VN");

    await Promise.all(admins.flatMap((a) => [
      ...(canDoiSoat.length ? [notify({
        userId: a.id,
        kind: "PAYMENT",
        title: `🧾 ${canDoiSoat.length} hoá đơn trang trí chờ đối soát`,
        body: `Đã quá ${DECOR_REPORTED_NUDGE_HOURS} giờ từ lúc khách báo chuyển khoản. Loại này không tự huỷ nên hàng đang bị giữ trong kho: ${canDoiSoat.map((o) => o.payCode).filter(Boolean).slice(0, 5).join(", ")}`,
        href: "/admin",
      })] : []),
      ...(hoanKet.length ? [notify({
        userId: a.id,
        kind: "PAYMENT",
        title: `↩️ ${hoanKet.length} khoản hoàn tiền đợi quá lâu`,
        body: `Đã quá ${NHAC_HOAN_GIO} giờ từ lúc khách gửi yêu cầu mà chưa ai duyệt - tổng ${tong(hoanKet)}đ. Người đang chờ được hoàn tiền là người ít kiên nhẫn nhất.`,
        href: "/admin",
      })] : []),
      ...(chiKet.length ? [notify({
        userId: a.id,
        kind: "PAYMENT",
        title: `💸 ${chiKet.length} khoản chi cho người bán chưa chuyển`,
        body: `Đã quá ${NHAC_CHI_TRA_GIO} giờ từ lúc người bán bấm rút - tổng ${tong(chiKet)}đ. Tiền này đã là của họ từ lúc lô được giao tận tay.`,
        href: "/admin",
      })] : []),
      ...(choDoiSoat.length ? [notify({
        userId: a.id,
        kind: "PAYMENT",
        title: `🧺 ${choDoiSoat.length} đơn chợ chờ đối soát`,
        body: `Đã quá ${MARKET_REPORTED_NUDGE_HOURS} giờ từ lúc người mua báo chuyển khoản. Loại này không tự huỷ nên lô đang bị giữ, và nông dân chưa nhận được việc giao nào: ${choDoiSoat.map((o) => o.payCode).filter(Boolean).slice(0, 5).join(", ")}`,
        href: "/admin",
      })] : []),
      ...(chuongKet.length ? [notify({
        userId: a.id,
        kind: "ACCOUNT",
        title: `🔄 ${chuongKet.length} chuồng đang không có người chăm`,
        body: `Nông dân phụ trách đang tạm dừng nên những chuồng này không có tin mới: ${chuongKet.map((b) => b.label).slice(0, 4).join(", ")}. Bàn giao ở /admin giúp mình nhé.`,
        href: "/admin",
      })] : []),
    ]));
  }

  return {
    sent,
    orphanBarns: orphanBarnRows.length,
    decorReportedPending: reportedOrders.length,
    marketReportedPending: donChoDoiSoat.length,
    refundPending: hoanCho.length,
    payoutPending: chiTraCho.length,
  };
}
