"use server";
// Cổng nông dân: nhận việc, làm xong thì gửi ảnh/video minh chứng rồi tích hoàn thành.
// Nguyên tắc: KHÔNG tích xong được nếu chưa có ảnh/video — "đã xong" luôn kèm bằng chứng.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { activeWorkerSession } from "@/lib/auth";
import { normalizeMediaUrl } from "@/lib/decor";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { TASK_META, type TaskKind } from "@/lib/tasks";
import {
  MAX_BIRDS_PER_LOG, MAX_EGGS_PER_LOG, WEIGHT_MAX, WEIGHT_MIN,
  defaultStorage, lotSummary, type LotType, type StorageMode,
} from "@/lib/harvest";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Loại việc → loại mục nhật ký hiện cho chủ chuồng. */
const UPDATE_KIND: Record<TaskKind, "DECOR" | "RANGE" | "CARE" | "PHOTO" | "MILESTONE"> = {
  DECOR: "DECOR", RANGE_OUT: "RANGE", RANGE_IN: "RANGE", FEED: "CARE", CHECK: "PHOTO",
  GEAR: "CARE", DELIVER: "MILESTONE", HARVEST: "MILESTONE", HANDOVER: "MILESTONE",
};

function touch(barnSlug: string) {
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${barnSlug}`);
  revalidatePath(`/chuong/${barnSlug}`);
  revalidatePath(`/chuong/${barnSlug}/nhat-ky`);
  revalidatePath(`/chuong/${barnSlug}/dan-ga`);
  revalidatePath(`/chuong/${barnSlug}/thu-hoach`);
  revalidatePath("/tai-khoan");
}

/** Nông dân mở hộp việc → hết dấu "mới" trên các việc đang chờ. */
export async function markTasksSeen(): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động — liên hệ nông trại nhé.");
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
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động — liên hệ nông trại nhé.");

  const task = await prisma.barnTask.findUnique({
    where: { id: taskId },
    include: { barn: { select: { id: true, slug: true, label: true, workerId: true, ownerId: true } } },
  });
  if (!task) return nope("Việc này không còn nữa.");
  if (task.workerId !== w.workerId) return nope("Việc này không thuộc danh sách của bạn.");
  if (task.status === "DONE") return nope("Việc này đã báo xong trước đó rồi.");

  const url = normalizeMediaUrl(String(formData.get("url") ?? ""));
  if (!url) return nope("Cần ảnh hoặc video minh chứng — dán đường dẫn bắt đầu bằng https:// hoặc /");

  const type = String(formData.get("type") ?? "PHOTO") === "VIDEO" ? "VIDEO" : "PHOTO";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const kind = task.kind as TaskKind;
  const meta = TASK_META[kind];
  const text = note || `${meta.emoji} ${meta.label} — đã làm xong, gửi bạn ảnh chụp lại.`;

  // Việc "sơ chế đàn" chỉ thật sự xong khi lô gà đã NẰM TRONG SỔ của chủ chuồng —
  // đó mới là thứ họ nhận được, không phải một tấm ảnh. Chặn ở đây thay vì chỉ nhắc
  // trong ghi chú: trước bản này cô chú phải tự nhớ ghi lô, và quên thì chủ chuồng
  // thấy "đã xong" trong khi sổ thu hoạch trống trơn (CODEMAP §11.10).
  //
  // §9.1 nguyên vẹn: đây KHÔNG phải đường ghi `DONE` thứ hai — vẫn đúng một cửa là
  // hàm này, chỉ thêm một điều kiện phải qua.
  if (kind === "HARVEST") {
    const lot = await prisma.harvestLot.findFirst({
      where: { barnId: task.barn.id, type: "MEAT", createdAt: { gte: task.createdAt } },
      select: { id: true },
    });
    if (!lot) {
      return nope(
        "Ghi lô gà vào sổ thu hoạch trước đã nhé — số con, số cân và ảnh lúc cân. " +
        "Ghi xong quay lại tích việc này là được.",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    const update = await tx.farmUpdate.create({
      data: { barnId: task.barn.id, workerId: w.workerId, kind: UPDATE_KIND[kind], text },
    });
    const media = await tx.barnMedia.create({
      data: {
        barnId: task.barn.id, workerId: w.workerId, type, url,
        caption: text.slice(0, 200), capturedAt: new Date(), updateId: update.id,
      },
    });
    await tx.barnTask.update({
      where: { id: task.id },
      data: { status: "DONE", doneAt: new Date(), doneNote: note || null, proofMediaId: media.id },
    });

    // Việc làm xong ngoài đời thì trạng thái trong app mới đổi theo.
    if (kind === "RANGE_OUT") await tx.barn.update({ where: { id: task.barn.id }, data: { outside: true } });
    if (kind === "RANGE_IN") await tx.barn.update({ where: { id: task.barn.id }, data: { outside: false } });
    if (kind === "DECOR") {
      // Ảnh chứng minh gắn vào các món vừa lắp mà chưa có ảnh nào
      await tx.barnDecor.updateMany({ where: { barnId: task.barn.id, photoUrl: null }, data: { photoUrl: url } });
    }
    if (kind === "GEAR") {
      // ⭐ CHỖ DUY NHẤT yếm đổi trạng thái thật (§9.2, y hệt `Barn.outside` ở trên).
      // Chủ chuồng bấm "mặc yếm cho con Miu" chỉ đặt PENDING_ON; tới đây — khi cô Lan
      // đã mặc thật ngoài đời và gửi ảnh — mới thành WORN.
      //
      // Gộp cả đàn trong một câu lệnh giống DECOR: `upsertTask` gộp nhiều con vào MỘT
      // việc GEAR, nên một lần hoàn thành có thể xử lý nhiều con cùng lúc. Hai
      // `updateMany` thay vì vòng lặp — DB ở xa, mỗi câu lệnh là một lượt đi–về.
      const inBarn = { bird: { flock: { barnId: task.barn.id } } };
      await tx.birdGear.updateMany({
        where: { ...inBarn, status: "PENDING_ON" },
        data: { status: "WORN", wornAt: new Date(), photoUrl: url },
      });
      await tx.birdGear.updateMany({
        where: { ...inBarn, status: "PENDING_OFF" },
        data: { status: "OFF", removedAt: new Date() },
      });
    }
    if (kind === "HANDOVER") {
      // Giao lô về nhà CHÍNH CHỦ chuồng. Cố ý tách khỏi nhánh `DELIVER` ngay bên dưới
      // dù hai việc trông giống nhau ngoài đời:
      //  · `DELIVER` là hàng đã bán → đóng `MarketListing` và **sinh `Payout`**.
      //  · `HANDOVER` không có đồng nào — chỉ là hàng của người ta về tới tay người ta.
      // Gộp một loại việc thì một tấm ảnh sẽ đóng cả hai chuyến, tức một lần giao
      // không có minh chứng (§9.1).
      //
      // `updateMany` mang điều kiện `CLAIMED` trong WHERE (§9.24): chủ lô có thể vừa
      // bấm rút yêu cầu ở tab khác đúng lúc cô chú tích xong.
      await tx.harvestLot.updateMany({
        where: { barnId: task.barn.id, status: "CLAIMED" },
        data: { status: "DELIVERED" },
      });
    }
    if (kind === "DELIVER") {
      // ⭐ ĐÂY LÀ CHỖ DUY NHẤT TIỀN ĐƯỢC PHÉP RỜI HỆ THỐNG (§9.29).
      //
      // Lô chỉ sang DELIVERED khi có ảnh trao tay, và `Payout` chỉ sinh ra cùng lúc
      // đó. Không ảnh ⟹ không DELIVERED ⟹ không chi trả. Đây là toàn bộ cơ chế ký
      // quỹ của chợ, và là lý do 20% phí tồn tại.
      const paid = await tx.marketListing.findMany({
        where: { status: "PAID", lot: { barnId: task.barn.id } },
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
  });

  await track("task_done", {
    userId: w.user.id, barnSlug: task.barn.slug,
    props: {
      kind, mediaType: type,
      // Từ lúc giao tới lúc xong — đo thời gian đáp ứng thật của nông trại.
      hoursToDo: Math.round((Date.now() - task.createdAt.getTime()) / 3_600_000),
      overdue: !!task.dueAt && task.dueAt.getTime() < Date.now(),
    },
  });

  await notify({
    userId: task.barn.ownerId,
    kind: "TASK_DONE",
    title: `${meta.emoji} ${w.name} đã xong "${meta.label}"`,
    body: `${task.barn.label} · ${note || "đã gửi kèm ảnh/video minh chứng"}`,
    href: `/chuong/${task.barn.slug}`,
  });

  touch(task.barn.slug);
  return ok(`Đã báo xong "${meta.label}" cho ${task.barn.label} — ảnh đã gửi tới chủ chuồng.`);
}

/** Không làm được (mưa bão, đàn ốm…) — nói thật, kèm lý do. */
export async function declineTask(taskId: string, reason: string): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động — liên hệ nông trại nhé.");

  const body = reason.trim().slice(0, 300);
  if (body.length < 5) return nope("Ghi giúp lý do ngắn gọn để chủ chuồng hiểu nhé.");

  const task = await prisma.barnTask.findUnique({
    where: { id: taskId },
    include: { barn: { select: { id: true, slug: true, label: true, ownerId: true } } },
  });
  if (!task) return nope("Việc này không còn nữa.");
  if (task.workerId !== w.workerId) return nope("Việc này không thuộc danh sách của bạn.");
  if (task.status !== "OPEN") return nope("Việc này đã xử lý rồi.");

  await prisma.$transaction(async (tx) => {
    await tx.barnTask.update({
      where: { id: task.id },
      data: { status: "DECLINED", doneAt: new Date(), doneNote: body },
    });
    await tx.farmUpdate.create({
      data: {
        barnId: task.barn.id, workerId: w.workerId, kind: "NOTE",
        text: `Chưa làm được "${TASK_META[task.kind as TaskKind].label}": ${body}`,
      },
    });
  });

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

/**
 * SỔ THU HOẠCH — nông dân ghi "hôm nay chuồng X thu 12 quả" kèm ảnh giỏ trứng.
 *
 * Không cần ai giao việc, giống `postDailyUpdate`: nhặt trứng là việc hằng ngày của
 * cô chú, bắt chủ chuồng phải "đặt lịch thu trứng" là bịa ra một bước vô nghĩa.
 *
 * Đây là chỗ vá khoảng trống lớn nhất còn lại của sản phẩm (CODEMAP §11.11): trước
 * bản này `Product.qty` không có một lệnh `update` nào trong `src/`, nên ô "Trứng chu
 * kỳ này" của MỌI chuồng thật vĩnh viễn là 0 quả. Từ nay số đó là số thật, có ảnh
 * kèm theo, và mỗi lô là một tài sản có chủ — sau này bán lại được trên chợ.
 *
 * §9.1 nguyên vẹn: **không có ảnh thì không có lô.**
 *
 * formData: barn · type (EGG|MEAT) · qty · weightKg (chỉ MEAT) · storage · url · note
 */
export async function logHarvest(formData: FormData): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động — liên hệ nông trại nhé.");

  const barnSlug = String(formData.get("barn") ?? "");
  const type: LotType = String(formData.get("type") ?? "EGG") === "MEAT" ? "MEAT" : "EGG";
  const qty = Math.floor(Number(formData.get("qty") ?? 0));
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  const barn = await prisma.barn.findUnique({
    where: { slug: barnSlug },
    select: {
      id: true, slug: true, label: true, workerId: true, ownerId: true,
      flock: { select: { id: true, productLine: true, stage: true } },
    },
  });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (barn.workerId !== w.workerId) return nope("Chuồng này không thuộc danh sách bạn phụ trách.");
  if (!barn.flock) return nope("Chuồng này chưa có đàn.");

  // Trần theo loại — gõ nhầm một số 0 là sổ sách sai và (với gà thịt) tiền cũng sai.
  const max = type === "EGG" ? MAX_EGGS_PER_LOG : MAX_BIRDS_PER_LOG;
  if (!Number.isFinite(qty) || qty <= 0 || qty > max) {
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

  // Ảnh BẮT BUỘC — đây là bằng chứng lô hàng có thật, và sau này là ảnh người mua
  // nhìn trước khi trả tiền trên chợ.
  const url = normalizeMediaUrl(String(formData.get("url") ?? ""));
  if (!url) return nope("Cần ảnh giỏ trứng (hoặc ảnh cân gà) để chủ chuồng thấy — chụp giúp mình một tấm nhé.");
  const mediaType = String(formData.get("mediaType") ?? "PHOTO") === "VIDEO" ? "VIDEO" : "PHOTO";

  const tomTat = lotSummary({ type, qty, weightKg });
  const text = note || (type === "EGG"
    ? `🥚 Hôm nay thu được ${tomTat}.`
    : `🍗 Đã thu hoạch ${tomTat}.`);

  // Chống bấm hai lần: cùng chuồng, cùng loại, cùng số lượng trong 60 giây —
  // cùng cửa sổ với `postDailyUpdate` và `stamp` (§9.7).
  const dup = await prisma.harvestLot.findFirst({
    where: { barnId: barn.id, type, qty, createdAt: { gt: new Date(Date.now() - 60_000) } },
    select: { id: true },
  });
  if (dup) return nope("Vừa ghi đúng lô này rồi — không ghi trùng.");

  // ⭐ QUẢ TRỨNG ĐẦU TIÊN đưa đàn sang giai đoạn "đang đẻ" — xem chú thích ở
  // `lib/flock.ts`. Việc nền chạy theo lịch CỐ Ý không được đặt `LAYING`: một cái nhãn
  // "Đang đẻ" bật lên chỉ vì hôm nay là ngày thứ 140 là lời khẳng định không có gì bảo
  // chứng (§9.11). Ở đây thì có: lô này bắt buộc kèm ảnh, nên khi nhãn đổi là vì ngoài
  // đời đã có trứng thật.
  const firstEgg =
    type === "EGG" &&
    barn.flock.productLine === "LAYER" &&
    (barn.flock.stage === "BROODING" || barn.flock.stage === "GROWING");

  let laid = false;
  await prisma.$transaction(async (tx) => {
    const update = await tx.farmUpdate.create({
      data: { barnId: barn.id, workerId: w.workerId, kind: "MILESTONE", text },
    });
    const media = await tx.barnMedia.create({
      data: {
        barnId: barn.id, workerId: w.workerId, type: mediaType, url,
        caption: text.slice(0, 200), capturedAt: new Date(), updateId: update.id,
      },
    });
    await tx.harvestLot.create({
      data: {
        barnId: barn.id, flockId: barn.flock!.id, workerId: w.workerId,
        type, qty, weightKg, storage,
        // Chủ lô LÚC THU — chuồng đổi chủ sau này thì lô cũ vẫn thuộc người đã nuôi nó.
        ownerId: barn.ownerId,
        proofMediaId: media.id,
        note: note || null,
      },
    });

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
      }
    }
  });

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
      ? `${w.name} vừa nhặt ${tomTat} và gửi ảnh — đàn đã chính thức vào chu kỳ đẻ.`
      : `${barn.label} · ${w.name} vừa ghi vào sổ kèm ảnh.`,
    href: `/chuong/${barn.slug}/thu-hoach`,
  });

  touch(barn.slug);
  return ok(
    laid
      ? `Đã ghi vào sổ: ${tomTat} — và đây là lô trứng ĐẦU TIÊN của chuồng này, chủ chuồng vừa nhận được tin vui 🎉`
      : `Đã ghi vào sổ: ${tomTat}. Chủ chuồng nhận được thông báo kèm ảnh rồi nhé!`,
  );
}

/**
 * Cập nhật hằng ngày do nông dân tự gửi (không cần ai giao việc).
 * Đây là vòng lặp giữ chân của sản phẩm: mỗi ngày chủ chuồng mở app là thấy tin mới.
 */
export async function postDailyUpdate(formData: FormData): Promise<ActionResult> {
  const w = await activeWorkerSession();
  if (!w) return nope("Tài khoản nông dân của bạn không hoạt động — liên hệ nông trại nhé.");

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
  if (dup) return nope("Vừa gửi đúng nội dung này rồi — không đăng trùng.");

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

  // Nhịp nội dung hằng ngày — thứ quyết định chủ chuồng có lý do mở app hôm nay không.
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
