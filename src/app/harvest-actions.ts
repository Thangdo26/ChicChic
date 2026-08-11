"use server";
// NHẬN HÀNG TẬN NHÀ - chủ chuồng lấy về chính thứ chuồng mình làm ra.
//
// Đây là chỗ khép vòng đời sản phẩm (CODEMAP §11.12). Trước bản này lô thu hoạch chỉ
// có HAI kết cục: bán trên chợ, hoặc hết hạn rồi `EXPIRED`. Người nuôi 5 tháng, có lô
// trứng trong sổ, mà **không có cách nào nhận trứng của chính mình** - trong khi lời
// mời của cả sản phẩm là "nhận nuôi một chuồng gà để có trứng sạch". Cron còn bắn cho
// họ một thông báo "lô đã hết hạn" dẫn vào tường.
//
// Ba khác biệt so với luồng chợ (`market-actions.ts`), đừng gộp hai cái làm một:
//  1. **Không có tiền.** Không `Payout`, không phí 20%, không ký quỹ. §9.29 chỉ nói về
//     tiền rời hệ thống, và ở đây không có đồng nào rời đi cả.
//  2. **Không cần `PayoutAccount`**, cần `Address`.
//  3. Việc cho nông dân là `HANDOVER`, KHÔNG phải `DELIVER` - nếu dùng chung một loại
//     thì một chuồng vừa có lô bán vừa có lô nhận về sẽ bị đóng cả hai bằng MỘT tấm
//     ảnh, tức là một trong hai lần giao không có minh chứng (§9.1).
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { cleanLine } from "@/lib/decor";
import { upsertTask } from "@/lib/task-store";
import { TASK_META } from "@/lib/tasks";
import { LOT_KEEP_DAYS, deliverLine, lotSummary, type DeliverTo, type LotType } from "@/lib/harvest";
import { VUONG_MAC_VI, vuongMacGiaoHang } from "@/lib/delivery";
import { diaChiVaVung } from "@/lib/zones";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Ngày sớm nhất một lô còn được nông trại giữ hộ. Cùng mốc với `market-actions`. */
const keptSince = () => new Date(Date.now() - LOT_KEEP_DAYS * 86_400_000);

// ---------------- Địa chỉ nhận hàng ----------------

/**
 * Lưu địa chỉ nhận hàng. Một người một địa chỉ (`userId` unique), giống `PayoutAccount`.
 *
 * Đổi địa chỉ KHÔNG đụng tới lô đang trên đường: mỗi lô đã chụp lại địa chỉ vào
 * `HarvestLot.deliverTo` ngay lúc xin nhận.
 */
export async function saveAddress(input: {
  fullName: string; phone: string; line: string; note?: string; zoneId?: string;
}): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const fullName = cleanLine(input?.fullName, 60);
  const line = cleanLine(input?.line, 200);
  const note = cleanLine(input?.note ?? "", 120) || null;
  // Số điện thoại: chỉ giữ chữ số và dấu + đầu. Người ta hay gõ kèm dấu chấm/cách.
  const phone = String(input?.phone ?? "").replace(/[^\d+]/g, "").slice(0, 15);

  if (!fullName) return nope("Ghi tên người nhận giúp mình nhé.");
  if (phone.replace(/\D/g, "").length < 9) return nope("Số điện thoại chưa đúng - cô chú cần gọi trước khi tới.");
  if (line.length < 10) return nope("Ghi địa chỉ đầy đủ hơn giúp mình: số nhà, đường, phường/xã, quận/huyện, tỉnh.");

  // Vùng giao: KHÔNG tin id client gửi lên (§9.6). Tra lại trong bảng và bắt buộc phải
  // là vùng đang mở - client có thể đang cầm một danh sách cũ, hoặc gửi bừa một id.
  const zoneId = String(input?.zoneId ?? "").trim();
  if (!zoneId) return nope("Chọn khu vực giao hàng giúp mình nhé - nông trại cần biết chở đi đâu.");
  const zone = await prisma.deliveryZone.findFirst({
    where: { id: zoneId, active: true },
    select: { id: true, name: true },
  });
  if (!zone) return nope("Khu vực này nông trại đang không giao tới - chọn lại giúp mình nhé.");

  const data = { fullName, phone, line, note, zoneId: zone.id };
  await prisma.address.upsert({
    where: { userId: me.id }, update: data, create: { userId: me.id, ...data },
  });

  revalidatePath("/tai-khoan");
  revalidatePath("/cho");
  revalidatePath("/cho/cua-toi");
  return ok(`Đã lưu địa chỉ nhận hàng · khu vực ${zone.name}.`);
}

// ---------------- Xin nhận một lô về nhà ----------------

/**
 * Chủ lô xin nhận hàng tận nhà.
 *
 * Lô sang `CLAIMED` (nông trại vẫn đang giữ, nhưng đã có người đứng tên nhận) và nông
 * dân nhận một việc `HANDOVER`. §9.2 nguyên vẹn: **app không tự giao hàng** - nó chỉ
 * tạo việc, và lô chỉ thành `DELIVERED` khi có ảnh trao tay (`completeTask`).
 *
 * Việc `HANDOVER` được gộp theo chuồng như mọi việc khác (`upsertTask`), nên xin nhận
 * 3 lô cùng lúc là MỘT chuyến giao - đúng ngoài đời, và đỡ phiền cô chú ba lượt xe.
 */
export async function claimLot(lotId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const lot = await prisma.harvestLot.findUnique({
    where: { id: String(lotId) },
    select: {
      id: true, type: true, qty: true, weightKg: true, collectedAt: true, status: true, ownerId: true,
      barn: {
        select: {
          id: true, slug: true, label: true, workerId: true,
          worker: { select: { name: true, userId: true, active: true } },
        },
      },
    },
  });
  if (!lot) return nope("Không tìm thấy lô này.");
  if (lot.ownerId !== me.id) return nope("Lô này không thuộc về bạn.");
  if (lot.status === "CLAIMED") return nope("Bạn đã xin nhận lô này rồi - nông dân đang thu xếp giao.");
  if (lot.status !== "AT_FARM") return nope("Lô này không còn ở nông trại nữa.");
  if (lot.collectedAt < keptSince()) {
    return nope(`Lô này đã quá ${LOT_KEEP_DAYS} ngày nông trại giữ hộ - liên hệ nông trại nhé.`);
  }

  // Địa chỉ + VÙNG GIAO (§11.43). Nhận lô của chính mình về nhà vẫn **miễn phí** - họ đã
  // trả tiền nuôi rồi - nhưng vẫn phải nằm trong vùng nông trại chở tới được: nhận một
  // đơn rồi mới phát hiện không có ai đi hướng đó là lời hứa hụt, y hệt §11.12.
  const { address: addr, zone } = await diaChiVaVung(me.id);
  const vuong = vuongMacGiaoHang(addr, zone);
  if (vuong) return nope(VUONG_MAC_VI[vuong]);
  // `vuongMacGiaoHang` trả null ⟹ chắc chắn có cả hai, nhưng TS không suy ra được và
  // đoán bừa ở chỗ sắp ghi vào DB thì không nên.
  if (!addr || !zone) return nope(VUONG_MAC_VI["chua-co-dia-chi"]);

  // Không có ai giao thì đừng hứa: để lô ở `AT_FARM` còn hơn đẩy nó sang một trạng
  // thái mà không người nào có việc phải làm.
  if (!lot.barn.workerId || !lot.barn.worker) {
    return nope("Chuồng chưa có nông dân phụ trách - liên hệ nông trại để thu xếp giao nhé.");
  }
  if (!lot.barn.worker.active) {
    return nope("Nông dân phụ trách chuồng đang tạm nghỉ - nông trại sẽ bàn giao rồi giao lô cho bạn.");
  }

  const deliverTo: DeliverTo = {
    fullName: addr.fullName, phone: addr.phone, line: addr.line, note: addr.note,
    zone: zone.name,
  };
  const tomTat = lotSummary({ type: lot.type as LotType, qty: lot.qty, weightKg: lot.weightKg });

  // So-sánh-rồi-đặt (§9.24): đúng lúc này lô có thể vừa được đăng bán ở tab khác, hoặc
  // cron vừa đóng sổ vì hết hạn. Điều kiện cũ nằm trong WHERE nên bên thua không đổi
  // được gì - và không có việc nào được tạo cho một lô không còn ở nông trại.
  const { count } = await prisma.harvestLot.updateMany({
    where: { id: lot.id, status: "AT_FARM" },
    data: { status: "CLAIMED", claimedAt: new Date(), deliverTo },
  });
  if (count === 0) return nope("Lô này vừa đổi trạng thái - tải lại trang giúp mình.");

  // Ghi chú của việc phải ĐỦ để cô chú làm mà không cần mở thêm màn nào: gộp tất cả lô
  // đang chờ giao của chuồng này lại. Đọc lại từ DB thay vì cộng dồn trong đầu - lô có
  // thể được xin nhận từ nhiều tab, nhiều lúc.
  const dangCho = await prisma.harvestLot.findMany({
    where: { barnId: lot.barn.id, status: "CLAIMED" },
    select: { type: true, qty: true, weightKg: true },
    orderBy: { claimedAt: "asc" },
  });
  const danhSach = dangCho
    .map((l) => lotSummary({ type: l.type as LotType, qty: l.qty, weightKg: l.weightKg }))
    .join(" + ");

  const { created } = await upsertTask({
    barnId: lot.barn.id, workerId: lot.barn.workerId, requestedById: me.id,
    kind: "HANDOVER",
    title: TASK_META.HANDOVER.label,
    note: `Giao ${danhSach} tới: ${deliverLine(deliverTo)}`,
  });

  await track("lot_claimed", {
    userId: me.id, barnSlug: lot.barn.slug,
    props: { lotId: lot.id, type: lot.type, qty: lot.qty, gopVaoChuyenCu: !created },
  });

  // Gộp vào việc đang chờ thì KHÔNG báo lại (§9.8) - ghi chú vừa được cập nhật kèm lô
  // mới, cô chú sẽ thấy khi mở hộp việc.
  if (created) {
    await notify({
      userId: lot.barn.worker.userId,
      kind: "TASK_NEW",
      title: `${TASK_META.HANDOVER.emoji} Việc mới: ${TASK_META.HANDOVER.label}`,
      body: `${lot.barn.label} · ${danhSach} · ${deliverTo.line}`,
      href: `/nong-trai/chuong/${lot.barn.slug}#viec`,
    });
  }

  revalidatePath(`/chuong/${lot.barn.slug}/thu-hoach`);
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${lot.barn.slug}`);
  return ok(
    created
      ? `Đã nhờ ${lot.barn.worker.name} giao ${tomTat} về địa chỉ của bạn - xong sẽ có ảnh trao tay.`
      : `Đã thêm ${tomTat} vào chuyến giao đang chờ của ${lot.barn.worker.name} - cả nhà đi một lượt cho tiện.`,
  );
}

/**
 * Nhờ nông dân CẤP ĐÔNG một lô đang nằm ở nông trại.
 *
 * Vì sao cần: `storage` (ngăn mát / tủ đông) hiện chỉ đặt được đúng một lần, lúc nông
 * dân ghi lô vào sổ, theo mặc định của loại hàng. Sau đó chủ lô **không có tiếng nói
 * nào** - trong khi họ mới là người biết mình bao giờ mới lấy được hàng về. Trứng để
 * ngăn mát 7 ngày thì ăn được; một lô gà thịt để ngăn mát 7 ngày thì hỏng, và người
 * bận công tác một tuần đang mất trắng lô hàng của mình mà app không cho họ làm gì cả.
 *
 * §9.2 - app KHÔNG tự đổi `storage` được: cái tủ đông nằm ngoài đời, chỉ cô chú mới mở
 * nó ra. Nên đây tạo một `BarnTask` loại `FREEZE`, và `storage` chỉ đổi trong
 * `completeTask` khi đã có ảnh lô nằm trong tủ (§9.1) - đúng khuôn của `Barn.outside`
 * và `BirdGear`.
 *
 * ⚠️ **MỘT CHIỀU, không có "rã đông".** Cố ý: rã rồi đông lại là chuyện an toàn thực
 * phẩm, không phải một cái nút. Ai lỡ tay thì nhắn cô chú trong hộp thư.
 */
export async function requestFreeze(lotId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const lot = await prisma.harvestLot.findUnique({
    where: { id: String(lotId) },
    select: {
      id: true, type: true, qty: true, weightKg: true, storage: true, status: true,
      collectedAt: true, ownerId: true,
      barn: {
        select: {
          id: true, slug: true, label: true, workerId: true,
          worker: { select: { name: true, userId: true, active: true } },
        },
      },
    },
  });
  if (!lot) return nope("Không tìm thấy lô này.");
  if (lot.ownerId !== me.id) return nope("Lô này không thuộc về bạn.");
  if (lot.storage === "FROZEN") return nope("Lô này đang ở tủ đông rồi.");
  // Lô đã bán / đã xin giao về thì thôi: đổi cách bảo quản của một món người khác vừa
  // trả tiền là đổi món hàng sau lưng họ ("gà tươi" và "gà đông lạnh" là hai thứ khác
  // nhau cả về giá lẫn kỳ vọng - xem chú thích của `StorageMode`).
  if (lot.status !== "AT_FARM") return nope("Lô này không còn nằm chờ ở nông trại nữa.");
  if (lot.collectedAt < keptSince()) {
    return nope(`Lô này đã quá ${LOT_KEEP_DAYS} ngày nông trại giữ hộ - liên hệ nông trại nhé.`);
  }
  if (!lot.barn.workerId || !lot.barn.worker) {
    return nope("Chuồng chưa có nông dân phụ trách - liên hệ nông trại để thu xếp nhé.");
  }
  if (!lot.barn.worker.active) {
    return nope("Nông dân phụ trách đang tạm nghỉ - nông trại sẽ bàn giao rồi làm giúp bạn.");
  }

  const tomTat = lotSummary({ type: lot.type as LotType, qty: lot.qty, weightKg: lot.weightKg });
  const { created } = await upsertTask({
    barnId: lot.barn.id, workerId: lot.barn.workerId, requestedById: me.id,
    kind: "FREEZE",
    title: TASK_META.FREEZE.label,
    note: `Chủ lô nhờ cấp đông: ${tomTat} (thu ${lot.collectedAt.toLocaleDateString("vi-VN")}).`,
  });

  await track("lot_freeze_requested", {
    userId: me.id, barnSlug: lot.barn.slug,
    props: { lotId: lot.id, type: lot.type, gopVaoViecCu: !created },
  });

  if (created) {
    await notify({
      userId: lot.barn.worker.userId,
      kind: "TASK_NEW",
      title: `${TASK_META.FREEZE.emoji} Việc mới: ${TASK_META.FREEZE.label}`,
      body: `${lot.barn.label} · ${tomTat}`,
      href: `/nong-trai/chuong/${lot.barn.slug}#viec`,
    });
  }

  revalidatePath(`/chuong/${lot.barn.slug}/thu-hoach`);
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${lot.barn.slug}`);
  return ok(
    `Đã nhờ ${lot.barn.worker.name} cho ${tomTat} vào tủ đông - xong sẽ có ảnh gửi về. ` +
    "Hạn nông trại giữ hộ vẫn giữ nguyên nhé.",
  );
}

/**
 * Đổi ý: trả lô về "nông trại đang giữ hộ".
 *
 * Chỉ rút được khi nông dân CHƯA giao. Hạn giữ hộ vẫn đếm từ `collectedAt` như cũ
 * (§9.28) - xin nhận rồi rút lại không kéo dài thêm ngày nào.
 */
export async function cancelClaim(lotId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const lot = await prisma.harvestLot.findUnique({
    where: { id: String(lotId) },
    select: { id: true, ownerId: true, status: true, barn: { select: { id: true, slug: true } } },
  });
  if (!lot) return nope("Không tìm thấy lô này.");
  if (lot.ownerId !== me.id) return nope("Lô này không thuộc về bạn.");
  if (lot.status === "DELIVERED") return nope("Lô này đã được giao rồi.");

  const { count } = await prisma.harvestLot.updateMany({
    where: { id: lot.id, status: "CLAIMED" },
    // `Prisma.DbNull` chứ KHÔNG phải `null`/`undefined`: với cột Json nullable, Prisma
    // hiểu `undefined` là "đừng đụng tới trường này" - viết `undefined` ở đây thì địa
    // chỉ cũ nằm lại vĩnh viễn trên một lô không còn ai giao. Đã bị bắt lúc chạy thử.
    data: { status: "AT_FARM", claimedAt: null, deliverTo: Prisma.DbNull },
  });
  if (count === 0) return nope("Lô này không đang chờ giao.");

  // Chuyến giao còn lô nào không? Không còn thì rút luôn việc của nông dân - để một
  // việc "giao 0 lô" nằm trong hộp là bắt cô chú tự đoán xem có phải đi hay không.
  const conLai = await prisma.harvestLot.count({ where: { barnId: lot.barn.id, status: "CLAIMED" } });
  if (conLai === 0) {
    await prisma.barnTask.deleteMany({
      where: { barnId: lot.barn.id, kind: "HANDOVER", status: "OPEN" },
    });
  }

  revalidatePath(`/chuong/${lot.barn.slug}/thu-hoach`);
  revalidatePath("/nong-trai");
  revalidatePath(`/nong-trai/chuong/${lot.barn.slug}`);
  return ok(
    conLai === 0
      ? "Đã rút yêu cầu - lô về lại nông trại giữ hộ, và chuyến giao cũng được huỷ."
      : "Đã rút lô này khỏi chuyến giao. Những lô còn lại vẫn được giao như cũ.",
  );
}
