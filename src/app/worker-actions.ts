"use server";
// Cổng nông dân: nhận việc, làm xong thì gửi ảnh/video minh chứng rồi tích hoàn thành.
// Nguyên tắc: KHÔNG tích xong được nếu chưa có ảnh/video - "đã xong" luôn kèm bằng chứng.
import { decorProofSnapshot } from "@/lib/decor-proof";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { activeWorkerSession } from "@/lib/auth";
import { normalizeMediaUrl, cleanLine } from "@/lib/decor";
import { LifecycleError } from "@/lib/lifecycle";
import { acceptLifecycle, lockLifecycleTask, completeLifecycle, closeLifecycle, prepareLifecycleHarvest } from "@/lib/lifecycle-store";
import { notify } from "@/lib/notify";
import { ghiNhieuSuKien, ghiSuKien } from "@/lib/su-kien";
import { track } from "@/lib/track";
import { TASK_META, type TaskKind } from "@/lib/tasks";
import { locNhan } from "@/lib/van-hanh-meta";
import {
  WEIGH_GAM_MAX, WEIGH_GAM_MIN, canLabel, clampGram, clampSample, mauLabel, tuanThu,
} from "@/lib/weighin";
import {
  MAX_BIRDS_PER_LOG, MAX_EGGS_PER_LOG, WEIGHT_MAX, WEIGHT_MIN,
  defaultStorage, lotSummary, newTraceCode, type LotType, type StorageMode,
} from "@/lib/harvest";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Loại việc → loại mục nhật ký hiện cho chủ chuồng. */
const UPDATE_KIND: Record<TaskKind, "DECOR" | "RANGE" | "CARE" | "PHOTO" | "MILESTONE"> = {
  DECOR: "DECOR", RANGE_OUT: "RANGE", RANGE_IN: "RANGE", FEED: "CARE", CHECK: "PHOTO",
  GEAR: "CARE", DELIVER: "MILESTONE", HARVEST: "MILESTONE", HANDOVER: "MILESTONE",
  FREEZE: "CARE", WEIGH: "CARE", RETIRE: "MILESTONE",
};

function touch(barnSlug: string) {
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${barnSlug}`);
  revalidatePath(`/chuong/${barnSlug}`);
  revalidatePath(`/chuong/${barnSlug}/nhat-ky`);
  revalidatePath(`/chuong/${barnSlug}/dan-ga`);
  revalidatePath(`/chuong/${barnSlug}/thu-hoach`);
  revalidatePath(`/chuong/${barnSlug}/ket-chu-ky`);
  revalidatePath(`/chuong/${barnSlug}/nghi-huu`);
  revalidatePath("/tai-khoan");
}

/** Nông dân mở hộp việc → hết dấu "mới" trên các việc đang chờ. */
export async function markTasksSeen(): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");
  const { count } = await prisma.barnTask.updateMany({
    where: { workerId: w.workerId, status: "OPEN", seenAt: null },
    data: { seenAt: new Date() },
  });
  revalidatePath("/nong-trai");
  return count > 0 ? ok(`Đã đánh dấu đã đọc ${count} việc.`) : ok("Không có việc mới nào.");
}

/**
 * Hoàn thành một nhiệm vụ.
 * formData: url (bắt buộc), type PHOTO|VIDEO, note (ghi chú gửi chủ chuồng).
 */
export async function completeTask(taskId: string, formData: FormData): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");

  const task = await prisma.barnTask.findUnique({
    where: { id: taskId },
    include: {
      // `flock` chỉ để gắn vào sự kiện nghiệp vụ (§9.38) - bài học của bé bám theo ĐÀN, mà
      // một chuồng có thể đã sang lứa khác từ lúc việc được giao.
      barn: { select: { id: true, slug: true, label: true, workerId: true, ownerId: true, flock: { select: { id: true } } } },
    },
  });
  if (!task) return nope("Việc này không còn nữa.");
  if (task.workerId !== w.workerId) return nope("Việc này không thuộc danh sách của bạn.");
  if (task.status === "DONE") return ok("Việc này đã hoàn tất; minh chứng đã được lưu.");
  if (task.status !== "OPEN") return nope("Việc này đã bị từ chối hoặc được rút lại.");

  const url = normalizeMediaUrl(String(formData.get("url") ?? ""));
  if (!url) return nope("Cần ảnh hoặc video minh chứng - dán đường dẫn bắt đầu bằng https:// hoặc /");

  const type = String(formData.get("type") ?? "PHOTO") === "VIDEO" ? "VIDEO" : "PHOTO";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const kind = task.kind as TaskKind;
  const meta = TASK_META[kind];

  // NHÃN MỘT CHẠM (Epic 7 · spec §18.3 · FL-D24). Tuỳ chọn, và `locNhan` bỏ luôn khoá không
  // hợp với loại việc này thay vì từ chối cả việc - xem chú thích dài ở `van-hanh-meta`.
  const nhan = locNhan(kind, formData.get("nhan"));

  // Thứ tự ba nhánh này là toàn bộ lý do nhãn đáng một cái chạm: **chữ cô chú tự gõ luôn
  // thắng**, rồi mới tới nhãn, cuối cùng mới là câu chung chung. Gắn nhãn vì thế là *bớt*
  // gõ chứ không phải thêm việc - và chủ chuồng đọc được đúng thứ vừa xảy ra thay vì
  // "đã kiểm tra chuồng" cho cả ba việc khác nhau.
  const text = note || nhan?.cau || `${meta.emoji} ${meta.label} - đã làm xong, gửi bạn ảnh chụp lại.`;

  // Việc cũ thiếu đích phải đối soát, không đoán theo chuồng/ngày.
  if ((kind === "HARVEST" || kind === "RETIRE") && !task.lifecycleRequestId) {
    return nope("Việc vòng đời cũ chưa gắn đúng yêu cầu và đàn. Báo nông trại đối soát trước khi hoàn tất.");
  }

  // Việc giao đơn chợ phải biết đang giao ĐƠN NÀO (§11.44). Việc `DELIVER` sinh từ
  // `confirmMarketPaid` luôn mang `orderId`, và việc cũ đã được gắn lúc chuyển tiếp dữ
  // liệu - tới được đây là dữ liệu hỏng. Dừng lại kèm câu người thật đọc được, còn hơn
  // đoán bừa rồi chi tiền cho nhầm người bán.
  if (kind === "DELIVER" && !task.orderId) {
    return nope("Việc giao này không gắn với đơn nào - báo nông trại giúp mình, đừng tích vội.");
  }

  // Cùng khuôn với `HARVEST` ngay trên: việc "cân mẫu đàn" chỉ xong khi CON SỐ đã nằm
  // trong sổ, không phải khi có một tấm ảnh cái cân. Thiếu chốt này thì cô chú chụp
  // ảnh, tích xong, và biểu đồ của chủ chuồng vẫn trống - đúng lỗi §11.10 cũ.
  if (kind === "WEIGH") {
    const w2 = await prisma.weighIn.findFirst({
      where: { barnId: task.barn.id, createdAt: { gte: task.createdAt } },
      select: { id: true },
    });
    if (!w2) {
      return nope(
        'Ghi số cân vào ô "Cân nặng tuần này" trước đã nhé - cân vài con rồi lấy số trung bình. ' +
        "Ghi xong quay lại tích việc này là được.",
      );
    }
  }

  const now = new Date();
  let changed;
  try {
    changed = await prisma.$transaction(async (tx) => {
    if (!task.lifecycleRequestId) {
      const barn = await tx.barn.updateMany({
        where: { id: task.barn.id, workerId: w.workerId }, data: { workerId: w.workerId },
      });
      if (barn.count !== 1) throw new LifecycleError("Chuồng vừa đổi người phụ trách. Tải lại danh sách giúp nhé.");
    }
    const locked = task.lifecycleRequestId ? await lockLifecycleTask(tx, task.id, w.workerId) : null;
    // Chiếm việc trước mọi side effect; bên thua không tạo media/nhật ký/outcome.
    const claimed = await tx.barnTask.updateMany({
      where: { id: task.id, workerId: w.workerId, status: "OPEN" },
      data: { status: "DONE", doneAt: now },
    });
    if (claimed.count !== 1) return false;
    if (kind === "DECOR") {
      const plan = await tx.barn.findUniqueOrThrow({ where: { id: task.barn.id }, select: { label: true, decor: true } });
      if (formData.get("decorSnapshot") !== decorProofSnapshot(plan.decor, plan.label)) throw new LifecycleError("Bản vẽ vừa thay đổi. Tải lại và đối chiếu vị trí, màu, chữ trước khi gửi minh chứng nhé.");
    }
    let gearIds: string[] = [];
    if (kind === "GEAR") {
      const live = await tx.birdGear.findMany({ where: { bird: { flock: { barnId: task.barn.id } }, status: { in: ["PENDING_ON", "PENDING_OFF"] } }, select: { id: true, status: true } });
      let snapshot: unknown;
      try { snapshot = JSON.parse(String(formData.get("gearSnapshot") ?? "")); } catch { throw new LifecycleError("Tải lại danh sách yếm trước khi gửi minh chứng nhé."); }
      if (!Array.isArray(snapshot) || snapshot.length === 0 || snapshot.length > 100 || snapshot.some((x) => !x || typeof x.id !== "string" || !["PENDING_ON", "PENDING_OFF"].includes(x.status))) throw new LifecycleError("Chưa có danh sách yếm hợp lệ để đối soát.");
      const expected = snapshot.map((x) => `${x.id}:${x.status}`).sort();
      if (new Set(expected).size !== expected.length || JSON.stringify(expected) !== JSON.stringify(live.map((x) => `${x.id}:${x.status}`).sort())) throw new LifecycleError("Yêu cầu yếm vừa thay đổi. Tải lại danh sách và kiểm tra từng con trước khi hoàn tất.");
      gearIds = live.map((g) => g.id);
    }
    const update = await tx.farmUpdate.create({
      data: { barnId: task.barn.id, workerId: w.workerId, kind: UPDATE_KIND[kind], text },
    });
    const media = await tx.barnMedia.create({
      data: {
        barnId: task.barn.id, workerId: w.workerId, type, url,
        caption: text.slice(0, 200), capturedAt: new Date(), updateId: update.id,
      },
    });
    const attached = await tx.barnTask.updateMany({
      where: { id: task.id, status: "DONE", workerId: w.workerId, proofMediaId: null },
      data: {
        status: "DONE", doneAt: new Date(), doneNote: note || null, proofMediaId: media.id,
        careTag: nhan?.khoa ?? null,
      },
    });
    if (attached.count !== 1) throw new LifecycleError("Việc vừa đổi trạng thái.");
    if (locked) await completeLifecycle(tx, locked, {
      confirmedCount: Number(formData.get("confirmedCount") ?? NaN),
      proofMediaId: media.id, workerId: w.workerId,
    }, now);

    // Việc chăm sóc vừa xong THẬT, có ảnh trao tay - nguồn sự kiện lớn nhất của cả chương
    // trình học (§14.2). Nằm ngay sau dòng đặt `DONE` và trong cùng transaction: không có
    // đường nào việc "đã xong" mà sự kiện không sinh, hoặc ngược lại.
    await ghiSuKien(tx, {
      type: "CARE_TASK_COMPLETED",
      taskId: task.id, barnId: task.barn.id, flockId: locked?.request.flockId ?? task.barn.flock?.id ?? null,
      // `tag` là khoá đóng, hoặc `null` khi cô chú bỏ qua. Nó ở đây vì `CHECK` gộp BA mong
      // muốn khác nhau của bé (kiểm tra nước · dọn ổ đẻ · chụp cận cảnh) vào một loại việc,
      // nên không có nó thì báo cáo pilot không phân biệt nổi cô chú thật sự đã làm gì.
      //
      // ⚠️ Nhãn **chưa** đổi bài học nào cả - `chonDonVi` vẫn chọn theo `kind`. Tách nội dung
      // theo nhãn nghĩa là viết thêm biến thể bài, mà mọi biến thể phải qua chuyên gia giáo
      // dục trước (NO-GO §23). Ở đợt này nhãn là **đầu vào để đo**, không phải một nhánh nội
      // dung - và nói thẳng thế còn hơn để người sau tưởng nó đang làm gì đó.
      kind, mediaType: type, proofMediaId: media.id, tag: nhan?.khoa ?? null,
    }, now);

    // Việc làm xong ngoài đời thì trạng thái trong app mới đổi theo.
      if (kind === "RANGE_OUT") await tx.barn.update({ where: { id: task.barn.id }, data: { outside: true } });
    if (kind === "RANGE_IN") await tx.barn.update({ where: { id: task.barn.id }, data: { outside: false } });
    if (kind === "DECOR") {
      // Ảnh chứng minh gắn vào các món vừa lắp mà chưa có ảnh nào
      await tx.barnDecor.updateMany({ where: { barnId: task.barn.id, photoUrl: null }, data: { photoUrl: url } });
    }
    if (kind === "GEAR") {
      // ⭐ CHỖ DUY NHẤT yếm đổi trạng thái thật (§9.2, y hệt `Barn.outside` ở trên).
      // Chủ chuồng bấm "mặc yếm cho con Miu" chỉ đặt PENDING_ON; tới đây - khi cô Lan
      // đã mặc thật ngoài đời và gửi ảnh - mới thành WORN.
      //
      // Gộp cả đàn trong một câu lệnh giống DECOR: `upsertTask` gộp nhiều con vào MỘT
      // việc GEAR, nên một lần hoàn thành có thể xử lý nhiều con cùng lúc. Hai
      // `updateMany` thay vì vòng lặp - DB ở xa, mỗi câu lệnh là một lượt đi–về.
      const inBarn = { id: { in: gearIds }, bird: { flock: { barnId: task.barn.id } } };
      await tx.birdGear.updateMany({
        where: { ...inBarn, status: "PENDING_ON" },
        data: { status: "WORN", wornAt: new Date(), photoUrl: url },
      });
      await tx.birdGear.updateMany({
        where: { ...inBarn, status: "PENDING_OFF" },
        data: { status: "OFF", removedAt: new Date() },
      });
    }
    if (kind === "FREEZE") {
      // ⭐ CHỖ DUY NHẤT `storage` đổi sau khi lô đã vào sổ (§9.2). Chủ lô bấm "nhờ cấp
      // đông" chỉ tạo việc; tới đây - khi lô đã nằm thật trong tủ và có ảnh - mới đổi.
      //
      // Điều kiện `status: "AT_FARM"` nằm trong WHERE (§9.24): đúng lúc cô chú tích
      // xong, lô có thể vừa được đăng bán hoặc vừa được xin giao về ở tab khác, và
      // đổi cách bảo quản một món người khác vừa trả tiền là đổi món hàng sau lưng họ.
      await tx.harvestLot.updateMany({
        where: { barnId: task.barn.id, status: "AT_FARM", storage: { not: "FROZEN" } },
        data: { storage: "FROZEN" },
      });
    }
    if (kind === "HANDOVER") {
      // Giao lô về nhà CHÍNH CHỦ chuồng. Cố ý tách khỏi nhánh `DELIVER` ngay bên dưới
      // dù hai việc trông giống nhau ngoài đời:
      //  · `DELIVER` là hàng đã bán → đóng `MarketListing` và **sinh `Payout`**.
      //  · `HANDOVER` không có đồng nào - chỉ là hàng của người ta về tới tay người ta.
      // Gộp một loại việc thì một tấm ảnh sẽ đóng cả hai chuyến, tức một lần giao
      // không có minh chứng (§9.1).
      //
      // `updateMany` mang điều kiện `CLAIMED` trong WHERE (§9.24): chủ lô có thể vừa
      // bấm rút yêu cầu ở tab khác đúng lúc cô chú tích xong.
      //
      // Đọc danh sách TRƯỚC khi đổi, cùng điều kiện và cùng transaction, để biết đúng những
      // lô nào vừa về tới nhà - `updateMany` chỉ trả về một con số.
      const veNha = await tx.harvestLot.findMany({
        where: { barnId: task.barn.id, status: "CLAIMED" },
        select: { id: true, type: true, qty: true, flockId: true },
      });
      await tx.harvestLot.updateMany({
        where: { barnId: task.barn.id, status: "CLAIMED" },
        data: { status: "DELIVERED" },
      });
      // ⚠️ `payload` KHÔNG mang `deliverTo` (§9.38): đó là tên, số điện thoại và địa chỉ nhà
      // của một gia đình, và đây là dữ liệu sẽ chảy vào màn hình của một đứa trẻ.
      await ghiNhieuSuKien(tx, veNha.map((l) => ({
        type: "HANDOVER_COMPLETED" as const,
        lotId: l.id, barnId: task.barn.id, flockId: l.flockId,
        lotType: l.type, qty: l.qty,
      })), now);
    }
    if (kind === "DELIVER") {
      // ⭐ ĐÂY LÀ CHỖ DUY NHẤT TIỀN ĐƯỢC PHÉP RỜI HỆ THỐNG (§9.29).
      //
      // Lô chỉ sang DELIVERED khi có ảnh trao tay, và `Payout` chỉ sinh ra cùng lúc
      // đó. Không ảnh ⟹ không DELIVERED ⟹ không chi trả. Đây là toàn bộ cơ chế ký
      // quỹ của chợ, và là lý do 20% phí tồn tại.
      //
      // ⚠️ **Lọc theo ĐƠN của chính việc này, không theo chuồng** (§11.44). Bản cũ lấy
      // mọi tin đăng `PAID` của chuồng, nên một tấm ảnh trao tay cho người A cũng đóng
      // luôn đơn của người B mua cùng chuồng - và sinh `Payout` cho cả hai. Người B
      // chưa nhận được gì mà trong sổ đã là "đã giao".
      // `orderId` đã được chốt khác null ở cổng phía trên; gán vào biến để TS thu hẹp
      // kiểu, và để đọc rõ rằng mọi câu lệnh dưới đây bám vào ĐÚNG một đơn.
      const orderId = task.orderId as string;
      await tx.marketOrder.updateMany({
        where: { id: orderId, status: "PAID" },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      const paid = await tx.marketListing.findMany({
        where: { status: "PAID", orderId },
        select: { id: true, sellerId: true, netVnd: true, lotId: true },
      });
      for (const l of paid) {
        // So-sánh-rồi-đặt: hai nông dân (hoặc hai lần bấm) không tạo được hai Payout.
        const { count } = await tx.marketListing.updateMany({
          where: { id: l.id, status: "PAID" },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
        if (count === 0) continue;
        await tx.harvestLot.update({ where: { id: l.lotId }, data: { status: "DELIVERED" } });

        // Số tài khoản CHỤP LẠI lúc chi: người bán đổi tài khoản sau thì sổ cũ vẫn
        // phải nói đúng tiền đã đi về đâu.
        const acc = await tx.payoutAccount.findUnique({ where: { userId: l.sellerId } });
        await tx.payout.create({
          data: {
            listingId: l.id, userId: l.sellerId, amountVnd: l.netVnd,
            bankSnapshot: acc
              ? { bankName: acc.bankName, accountNo: acc.accountNo, holderName: acc.holderName }
              : { thieu: "Người bán chưa điền tài khoản nhận tiền" },
          },
        });
      }
    }
    return true;
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof LifecycleError) return nope(error.message);
    throw error;
  }
  if (!changed) {
    touch(task.barn.slug);
    const latest = await prisma.barnTask.findUnique({ where: { id: task.id }, select: { status: true } });
    return latest?.status === "DONE" ? ok("Việc đã hoàn tất; không ghi thêm lần nữa.") : nope("Việc vừa bị từ chối hoặc đổi người phụ trách.");
  }

  await track("task_done", {
    userId: w.user.id, barnSlug: task.barn.slug,
    props: {
      kind, mediaType: type,
      // Từ lúc giao tới lúc xong - đo thời gian đáp ứng thật của nông trại.
      hoursToDo: Math.round((Date.now() - task.createdAt.getTime()) / 3_600_000),
      overdue: !!task.dueAt && task.dueAt.getTime() < Date.now(),
    },
  });

  // ⚠️ **Chỉ bắn khi cô chú THẬT SỰ gắn nhãn** (Epic 7 · §18.3). Cố ý không có sự kiện
  // "đã bỏ qua nhãn": đếm số lần bỏ qua là biến một thứ tuỳ chọn thành một thứ bị theo dõi,
  // và đó là bước đầu tiên của con đường nó thành bắt buộc.
  if (nhan) {
    await track("care_tag_used", {
      userId: w.user.id, barnSlug: task.barn.slug,
      props: { nhan: nhan.khoa, viec: kind },
    });
  }

  await notify({
    userId: task.barn.ownerId,
    kind: "TASK_DONE",
    title: `${meta.emoji} ${w.name} đã xong "${meta.label}"`,
    body: `${task.barn.label} · ${note || "đã gửi kèm ảnh/video minh chứng"}`,
    href: `/chuong/${task.barn.slug}`,
  });

  touch(task.barn.slug);
  return ok(`Đã báo xong "${meta.label}" cho ${task.barn.label} - ảnh đã gửi tới chủ chuồng.`);
}

/** Không làm được (mưa bão, đàn ốm…) - nói thật, kèm lý do. */
export async function declineTask(taskId: string, reason: string): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");

  const body = cleanLine(reason, 300);
  if (body.length < 5) return nope("Ghi giúp lý do ngắn gọn để chủ chuồng hiểu nhé.");

  const task = await prisma.barnTask.findUnique({
    where: { id: taskId },
    include: { barn: { select: { id: true, slug: true, label: true, ownerId: true } } },
  });
  if (!task) return nope("Việc này không còn nữa.");
  if (task.workerId !== w.workerId) return nope("Việc này không thuộc danh sách của bạn.");
  if (task.status === "DECLINED") return ok("Việc này đã được từ chối trước đó.");
  if (task.status !== "OPEN") return nope("Việc này đã xử lý rồi.");
  let changed;
  try {
    changed = await prisma.$transaction(async (tx) => {
    if (task.lifecycleRequestId) {
      const locked = await lockLifecycleTask(tx, task.id, w.workerId);
      if (!(await closeLifecycle(tx, locked, "DECLINED", body))) return false;
    } else {
      const barn = await tx.barn.updateMany({
        where: { id: task.barn.id, workerId: w.workerId }, data: { workerId: w.workerId },
      });
      if (barn.count !== 1) throw new LifecycleError("Chuồng vừa đổi người phụ trách. Tải lại danh sách giúp nhé.");
    }
    const cas = await tx.barnTask.updateMany({
      where: { id: task.id, status: "OPEN", workerId: w.workerId },
      data: { status: "DECLINED", doneAt: new Date(), doneNote: body },
    });
    if (cas.count !== 1) throw new LifecycleError("Việc vừa được xử lý ở lượt khác.");
    await tx.farmUpdate.create({
      data: {
        barnId: task.barn.id, workerId: w.workerId, kind: "NOTE",
        text: `Chưa làm được "${TASK_META[task.kind as TaskKind].label}": ${body}`,
      },
    });
    return true;
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof LifecycleError) return nope(error.message);
    throw error;
  }
  if (!changed) return ok("Việc này đã được từ chối trước đó.");

  await track("task_declined", {
    userId: w.user.id, barnSlug: task.barn.slug,
    props: { kind: task.kind },
  });

  await notify({
    userId: task.barn.ownerId,
    kind: "TASK_DECLINED",
    title: `${w.name} chưa làm được "${TASK_META[task.kind as TaskKind].label}"`,
    body: `${task.barn.label} · ${body}`,
    href: `/chuong/${task.barn.slug}`,
  });

  touch(task.barn.slug);
  return ok("Đã báo lại cho chủ chuồng kèm lý do.");
}

/** Nông dân nhận đúng việc; với RETIRE là cam kết farm tiếp tục chăm đàn. */
export async function acceptLifecycleTask(taskId: string): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân không hoạt động.");
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const locked = await lockLifecycleTask(tx, taskId, w.workerId);
      const changed = await acceptLifecycle(tx, locked, w.workerId);
      const barn = await tx.barn.findUniqueOrThrow({ where: { id: locked.request.barnId } });
      return { changed, barn };
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof LifecycleError) return nope(error.message);
    throw error;
  }
  if (result.changed) await notify({
    userId: result.barn.ownerId, kind: "MILESTONE", title: "Cô chú đã nhận yêu cầu kết chu kỳ",
    body: result.barn.label + " · đang chờ thực hiện và gửi minh chứng.",
    href: `/chuong/${result.barn.slug}/ket-chu-ky`,
  });
  touch(result.barn.slug);
  return ok("Đã nhận việc. Kiểm tra đúng đàn và gửi minh chứng sau khi thực hiện.");
}

/**
 * SỔ THU HOẠCH - nông dân ghi "hôm nay chuồng X thu 12 quả" kèm ảnh giỏ trứng.
 *
 * Không cần ai giao việc, giống `postDailyUpdate`: nhặt trứng là việc hằng ngày của
 * cô chú, bắt chủ chuồng phải "đặt lịch thu trứng" là bịa ra một bước vô nghĩa.
 *
 * Đây là chỗ vá khoảng trống lớn nhất còn lại của sản phẩm (CODEMAP §11.11): trước
 * bản này `Product.qty` không có một lệnh `update` nào trong `src/`, nên ô "Trứng chu
 * kỳ này" của MỌI chuồng thật vĩnh viễn là 0 quả. Từ nay số đó là số thật, có ảnh
 * kèm theo, và mỗi lô là một tài sản có chủ - sau này bán lại được trên chợ.
 *
 * §9.1 nguyên vẹn: **không có ảnh thì không có lô.**
 *
 * formData: barn · type (EGG|MEAT) · qty · weightKg (chỉ MEAT) · storage · url · note
 */
export async function logHarvest(formData: FormData): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");

  const barnSlug = String(formData.get("barn") ?? "");
  const type: LotType = String(formData.get("type") ?? "EGG") === "MEAT" ? "MEAT" : "EGG";
  const qty = Number(formData.get("qty") ?? 0);
  const flockId = String(formData.get("flockId") ?? "");
  const lifecycleRequestId = String(formData.get("lifecycleRequestId") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  const barn = await prisma.barn.findUnique({
    where: { slug: barnSlug },
    select: {
      id: true, slug: true, label: true, workerId: true, ownerId: true,
      flock: { select: { id: true, productLine: true, stage: true, lifecyclePolicy: true } },
    },
  });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (barn.workerId !== w.workerId) return nope("Chuồng này không thuộc danh sách bạn phụ trách.");
  if (!barn.flock) return nope("Chuồng này chưa có đàn.");

  if (flockId !== barn.flock.id) return nope("Đàn của biểu mẫu đã thay đổi. Tải lại trang trước khi ghi lô.");
  if (type === "MEAT" && barn.flock.lifecyclePolicy === "FAMILY_RETIRE_ONLY") {
    return nope("Đàn ChicChic Gia đình chỉ được nghỉ hưu, không ghi lô thịt.");
  }
  if (type === "MEAT" && !lifecycleRequestId) return nope("Cần chọn đúng yêu cầu thu hoạch đã được cô chú nhận.");

  // Trần theo loại - gõ nhầm một số 0 là sổ sách sai và (với gà thịt) tiền cũng sai.
  const max = type === "EGG" ? MAX_EGGS_PER_LOG : MAX_BIRDS_PER_LOG;
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > max) {
    return nope(`Số lượng phải trong khoảng 1–${max}. Nhiều hơn thì ghi làm nhiều lần giúp mình nhé.`);
  }

  // ⭐ CÂN là con số nhạy cảm nhất trong cả luồng: nông dân gõ tay, và trên chợ nó
  // nhân thẳng vào số tiền người mua trả. Gõ `18` thay `1,8` là hoá đơn gấp mười.
  let weightKg: number | null = null;
  if (type === "MEAT") {
    const raw = Number(String(formData.get("weightKg") ?? "").replace(",", "."));
    if (!Number.isFinite(raw) || raw <= 0) return nope("Cân giúp mình rồi ghi số cân nhé.");
    weightKg = Math.round(raw * 100) / 100;
    const lo = WEIGHT_MIN * qty, hi = WEIGHT_MAX * qty;
    if (weightKg < lo || weightKg > hi) {
      return nope(`Tổng cân ${weightKg}kg cho ${qty} con nghe chưa đúng (khoảng hợp lý: ${lo}–${hi}kg). Kiểm lại giúp mình.`);
    }
  }

  const rawStorage = String(formData.get("storage") ?? "");
  const storage: StorageMode =
    rawStorage === "CHILLED" || rawStorage === "FROZEN" ? rawStorage : defaultStorage(type);

  // Ảnh BẮT BUỘC - đây là bằng chứng lô hàng có thật, và sau này là ảnh người mua
  // nhìn trước khi trả tiền trên chợ.
  const url = normalizeMediaUrl(String(formData.get("url") ?? ""));
  if (!url) return nope("Cần ảnh giỏ trứng (hoặc ảnh cân gà) để chủ chuồng thấy - chụp giúp mình một tấm nhé.");
  const mediaType = String(formData.get("mediaType") ?? "PHOTO") === "VIDEO" ? "VIDEO" : "PHOTO";

  const tomTat = lotSummary({ type, qty, weightKg });
  const text = note || (type === "EGG"
    ? `🥚 Hôm nay thu được ${tomTat}.`
    : `🍗 Đã thu hoạch ${tomTat}.`);

  // Chống bấm hai lần: cùng chuồng, cùng loại, cùng số lượng trong 60 giây -
  // cùng cửa sổ với `postDailyUpdate` và `stamp` (§9.7).
  const dup = type === "EGG" && await prisma.harvestLot.findFirst({
    where: { barnId: barn.id, type, qty, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (dup) return nope("Vừa ghi đúng lô này rồi - không ghi trùng.");

  // ⭐ QUẢ TRỨNG ĐẦU TIÊN đưa đàn sang giai đoạn "đang đẻ" - xem chú thích ở
  // `lib/flock.ts`. Việc nền chạy theo lịch CỐ Ý không được đặt `LAYING`: một cái nhãn
  // "Đang đẻ" bật lên chỉ vì hôm nay là ngày thứ 140 là lời khẳng định không có gì bảo
  // chứng (§9.11). Ở đây thì có: lô này bắt buộc kèm ảnh, nên khi nhãn đổi là vì ngoài
  // đời đã có trứng thật.
  const firstEgg =
    type === "EGG" &&
    barn.flock.productLine === "LAYER" &&
    (barn.flock.stage === "BROODING" || barn.flock.stage === "GROWING");

  let laid = false;
  const now = new Date();
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
    if (type === "MEAT") {
      const target = await tx.barnTask.findUnique({ where: { lifecycleRequestId } });
      if (!target || target.barnId !== barn.id) throw new LifecycleError("Không tìm thấy việc thu hoạch của yêu cầu này.");
      const locked = await lockLifecycleTask(tx, target.id, w.workerId);
      if (locked.request.flockId !== flockId || locked.request.choice !== "MEAT") {
        throw new LifecycleError("Lô không trỏ tới đúng đàn và yêu cầu nhận thịt.");
      }
      if (!(await prepareLifecycleHarvest(tx, locked, { qty, weightKg, url, storage, mediaType }, now))) return false;
    }
    const update = await tx.farmUpdate.create({
      data: { barnId: barn.id, workerId: w.workerId, kind: "MILESTONE", text },
    });
    const media = await tx.barnMedia.create({
      data: {
        barnId: barn.id, workerId: w.workerId, type: mediaType, url,
        caption: text.slice(0, 200), capturedAt: new Date(), updateId: update.id,
      },
    });
    const lot = await tx.harvestLot.create({
      data: {
        barnId: barn.id, flockId: barn.flock!.id, workerId: w.workerId,
        type, qty, weightKg, storage,
        lifecycleRequestId: type === "MEAT" ? lifecycleRequestId : null,
        // Chủ lô LÚC THU - chuồng đổi chủ sau này thì lô cũ vẫn thuộc người đã nuôi nó.
        ownerId: barn.ownerId,
        proofMediaId: media.id,
        note: note || null,
        // Mã cho trang truy xuất công khai `/tx/<mã>` - sinh NGAY LÚC GHI LÔ, không
        // sinh lúc ai đó mở trang: sinh khi đọc nghĩa là một phép ghi DB nấp trong
        // một lượt xem trang, và hai người mở cùng lúc sẽ đua nhau (§7.14).
        publicCode: newTraceCode(),
      },
      select: { id: true },
    });

    // Lô đã nằm trong sổ - dữ kiện cho bài học đếm/chia của bé (§14.2). `qty` và `weightKg`
    // đi kèm vì đó chính là con số bài học dùng; `note` của nông dân thì KHÔNG (§9.38).
    await ghiSuKien(tx, {
      type: "HARVEST_LOGGED",
      lotId: lot.id, barnId: barn.id, flockId: barn.flock!.id,
      lotType: type, qty, weightKg, storage, proofMediaId: media.id,
    }, now);

    if (firstEgg) {
      // So-sánh-rồi-đặt (§9.24): hai lô ghi cùng lúc thì chỉ MỘT lần được tính là
      // "quả trứng đầu tiên", nên chủ chuồng không nhận hai lần cùng một mốc son.
      const { count } = await tx.flock.updateMany({
        where: { id: barn.flock!.id, stage: { in: ["BROODING", "GROWING"] } },
        data: { stage: "LAYING" },
      });
      laid = count > 0;
      if (laid) {
        await tx.farmUpdate.create({
          data: {
            barnId: barn.id, workerId: w.workerId, kind: "MILESTONE",
            text: "🥚 Quả trứng đầu tiên của đàn! Từ hôm nay chuồng chính thức vào chu kỳ đẻ.",
          },
        });
        // Mốc son riêng, KHÔNG phải `FLOCK_STAGE_CHANGED` (§14.2): chặng do lịch đẩy là việc
        // nền, còn quả trứng đầu tiên là thứ có ảnh làm chứng. Hai bài học khác hẳn nhau, và
        // gộp lại thì bé nhận hai lần cùng một câu chuyện.
        await ghiSuKien(tx, {
          type: "FIRST_EGG_RECORDED",
          flockId: barn.flock!.id, barnId: barn.id, productLine: barn.flock!.productLine,
          qty, proofMediaId: media.id,
        }, now);
      }
    }
    return true;
    }, { timeout: 20_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof LifecycleError) return nope(error.message);
    throw error;
  }
  if (!created) {
    touch(barn.slug);
    return ok("Lô của yêu cầu này đã được ghi; không tạo thêm lô.");
  }

  await track("harvest_logged", {
    userId: w.user.id, barnSlug: barn.slug,
    props: { type, qty, weightKg, storage },
  });

  // Một thông báo thôi, kể cả lúc có mốc son: dội hai dòng liền nhau là cách nhanh
  // nhất để người ta tắt chuông (§9.8). Mốc son thì đổi lời, không thêm dòng.
  await notify({
    userId: barn.ownerId,
    kind: "MILESTONE",
    title: laid
      ? `🥚 Quả trứng đầu tiên của ${barn.label}!`
      : type === "EGG" ? `🥚 Chuồng bạn thu được ${qty} quả` : `🍗 Đã thu hoạch ${tomTat}`,
    body: laid
      ? `${w.name} vừa nhặt ${tomTat} và gửi ảnh - đàn đã chính thức vào chu kỳ đẻ.`
      : `${barn.label} · ${w.name} vừa ghi vào sổ kèm ảnh.`,
    href: `/chuong/${barn.slug}/thu-hoach`,
  });

  touch(barn.slug);
  return ok(
    laid
      ? `Đã ghi vào sổ: ${tomTat} - và đây là lô trứng ĐẦU TIÊN của chuồng này, chủ chuồng vừa nhận được tin vui 🎉`
      : `Đã ghi vào sổ: ${tomTat}. Chủ chuồng nhận được thông báo kèm ảnh rồi nhé!`,
  );
}

/**
 * Cập nhật hằng ngày do nông dân tự gửi (không cần ai giao việc).
 * Đây là vòng lặp giữ chân của sản phẩm: mỗi ngày chủ chuồng mở app là thấy tin mới.
 */
export async function postDailyUpdate(formData: FormData): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");

  const barnSlug = String(formData.get("barn") ?? "");
  const text = String(formData.get("text") ?? "").trim().slice(0, 1000);
  const rawUrl = String(formData.get("url") ?? "").trim();
  const type = String(formData.get("type") ?? "PHOTO") === "VIDEO" ? "VIDEO" : "PHOTO";

  if (!text) return nope("Viết vài dòng cho chủ chuồng đã nhé.");

  const barn = await prisma.barn.findUnique({ where: { slug: barnSlug }, select: { id: true, slug: true, label: true, workerId: true, ownerId: true } });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (barn.workerId !== w.workerId) return nope("Chuồng này không thuộc danh sách bạn phụ trách.");

  const url = rawUrl ? normalizeMediaUrl(rawUrl) : null;
  if (rawUrl && !url) return nope("Đường dẫn ảnh/video chưa hợp lệ (cần https:// hoặc /).");

  // Cùng chuồng + cùng nội dung trong 1 phút → coi như bấm hai lần
  const dup = await prisma.farmUpdate.findFirst({
    where: { barnId: barn.id, text, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (dup) return nope("Vừa gửi đúng nội dung này rồi - không đăng trùng.");

  await prisma.$transaction(async (tx) => {
    const update = await tx.farmUpdate.create({
      data: { barnId: barn.id, workerId: w.workerId, kind: url ? type : "CARE", text },
    });
    if (url) {
      await tx.barnMedia.create({
        data: {
          barnId: barn.id, workerId: w.workerId, type, url,
          caption: text.slice(0, 200), capturedAt: new Date(), updateId: update.id,
        },
      });
    }
  });

  // Nhịp nội dung hằng ngày - thứ quyết định chủ chuồng có lý do mở app hôm nay không.
  await track("worker_daily_update", {
    userId: w.user.id, barnSlug: barn.slug,
    props: { hasMedia: !!url, mediaType: url ? type : null },
  });

  await notify({
    userId: barn.ownerId,
    kind: "BARN_UPDATE",
    title: `${w.name} vừa gửi tin từ ${barn.label}`,
    body: url ? `📷 Có ảnh/video mới · ${text}` : text,
    href: `/chuong/${barn.slug}/nhat-ky`,
  });

  touch(barn.slug);
  return ok(`Đã gửi cập nhật tới chủ ${barn.label}${url ? " kèm ảnh/video" : ""}.`);
}

/**
 * SỔ LỚN - nông dân cân mẫu vài con gà thịt rồi ghi số cân trung bình của tuần này.
 *
 * Cùng khuôn với `logHarvest`: đây là **sự thật ngoài đời**, nên bắt buộc có ảnh cái
 * cân (§9.1) và không có đường ghi nào khác. Khác một chỗ: một tuần chỉ có **một** dòng
 * (`@@unique([flockId, weekNo])`), cân lại trong cùng tuần thì ĐÈ lên số cũ - cô chú
 * cân hụt rồi cân lại là chuyện bình thường, và hai điểm cùng một tuần làm hỏng biểu đồ.
 *
 * ⚠️ Chỉ cho **đàn gà thịt đang nuôi**. Gà đẻ không cân (chủ chuồng đã có trứng để nhìn,
 * và cân gà mái đang đẻ mỗi tuần là làm phiền con vật vì một con số không ai dùng).
 *
 * formData: barn · avgGram · sample · url · note
 */
export async function logWeighIn(formData: FormData): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động - liên hệ nông trại nhé.");

  const barnSlug = String(formData.get("barn") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const avgGram = clampGram(formData.get("avgGram"));
  const sample = clampSample(formData.get("sample"));

  if (avgGram === null) {
    return nope(`Số cân chưa hợp lệ - ghi theo GAM, trong khoảng ${WEIGH_GAM_MIN}–${WEIGH_GAM_MAX}.`);
  }

  const url = normalizeMediaUrl(String(formData.get("url") ?? ""));
  if (!url) return nope("Cần một tấm ảnh cái cân - con số này sẽ nằm mãi trong sổ của chủ chuồng.");

  const barn = await prisma.barn.findUnique({
    where: { slug: barnSlug },
    select: {
      id: true, slug: true, label: true, workerId: true, ownerId: true,
      flock: { select: { id: true, productLine: true, stage: true, startDate: true } },
    },
  });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (barn.workerId !== w.workerId) return nope("Chuồng này không thuộc danh sách bạn phụ trách.");
  if (!barn.flock) return nope("Chuồng này chưa có đàn.");
  if (barn.flock.productLine !== "BROILER") {
    return nope("Sổ cân chỉ dành cho đàn gà thịt - gà đẻ thì ghi trứng vào sổ thu hoạch nhé.");
  }
  if (barn.flock.stage === "HARVESTED" || barn.flock.stage === "RETIRED") {
    return nope("Đàn này đã khép lứa rồi.");
  }

  const weekNo = tuanThu(barn.flock.startDate);
  const flockId = barn.flock.id;

  const truoc = await prisma.weighIn.findFirst({
    where: { flockId, weekNo: { lt: weekNo } },
    orderBy: { weekNo: "desc" },
    select: { avgGram: true },
  });

  await prisma.$transaction(async (tx) => {
    const media = await tx.barnMedia.create({
      data: {
        barnId: barn.id, workerId: w.workerId, type: "PHOTO", url,
        caption: `Cân tuần ${weekNo}: trung bình ${canLabel(avgGram)}/con`,
        capturedAt: new Date(),
      },
    });
    // Cân lại trong cùng tuần thì ĐÈ - không đẻ ra hai điểm cho một tuần.
    await tx.weighIn.upsert({
      where: { flockId_weekNo: { flockId, weekNo } },
      update: { avgGram, sample, note: note || null, workerId: w.workerId, proofMediaId: media.id, weighedAt: new Date() },
      create: {
        flockId, barnId: barn.id, weekNo, avgGram, sample,
        note: note || null, workerId: w.workerId, proofMediaId: media.id,
      },
    });
    // Việc `WEIGH` của tuần này (nếu có) coi như xong - cô chú vừa làm đúng thứ nó yêu
    // cầu. Nhưng KHÔNG đặt `DONE` ở đây: §9.1 chỉ có một cửa là `completeTask`, và cửa
    // đó đòi ảnh riêng của việc. Chỉ ghi một dòng nhật ký cho chủ chuồng đọc.
    await tx.farmUpdate.create({
      data: {
        barnId: barn.id, workerId: w.workerId, kind: "CARE",
        text: `⚖️ Tuần ${weekNo}: đàn nặng trung bình ${canLabel(avgGram)}/con (${mauLabel(sample)}).`
          + (note ? ` ${note}` : ""),
      },
    });
  });

  await track("weighin_logged", {
    userId: w.user.id, barnSlug: barn.slug,
    props: { weekNo, avgGram, sample },
  });

  const them = truoc ? avgGram - truoc.avgGram : null;
  await notify({
    userId: barn.ownerId,
    kind: "MILESTONE",
    title: `⚖️ Tuần ${weekNo}: đàn nặng ${canLabel(avgGram)}/con`,
    // Nói mức TĂNG khi có số cũ để so - đó mới là thứ đáng mong mỗi tuần. Không có số
    // cũ thì im, đừng so với một con số giả định nào.
    body: them !== null && them > 0
      ? `${barn.label} · tăng ${canLabel(them)} so với lần cân trước. ${w.name} gửi kèm ảnh.`
      : `${barn.label} · ${w.name} vừa cân và gửi ảnh.`,
    href: `/chuong/${barn.slug}`,
  });

  touch(barn.slug);
  return ok(`Đã ghi tuần ${weekNo}: trung bình ${canLabel(avgGram)}/con. Chủ chuồng nhận được tin rồi nhé!`);
}
