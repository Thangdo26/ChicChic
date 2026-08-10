"use server";
// CHỢ NÔNG TRẠI - đăng bán, mua, và tài khoản nhận tiền.
//
// Ba luật sống còn của tính năng này, cả ba đều nằm ở đây chứ không nằm ở giao diện:
//
//  1. **Chỉ chủ chuồng đang hoạt động mới MUA được.** Chợ là chỗ người nuôi đổi hàng
//     cho nhau, không phải cửa hàng mở cho người lạ. Mở ra là kéo theo cả luồng đăng
//     ký, địa chỉ giao hàng và rủi ro pháp lý - một đợt riêng.
//  2. **Người bán không đặt giá.** Giá do nông trại niêm yết (`MarketPrice`), tính lại
//     ở server và chốt vào tin đăng lúc đăng (§9.6).
//  3. **Ký quỹ.** Tiền người mua về là lô sang "đã bán"; tiền chỉ tới tay người bán sau
//     khi nông dân GIAO THẬT và có ảnh (xem `worker-actions.completeTask` nhánh DELIVER).
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { newPayCode, cleanLine } from "@/lib/decor";
import {
  MARKET_FEE_PERCENT, MAX_LISTINGS_PER_MONTH, RESERVE_HOLD_MINUTES, lotMoney, priceFor,
} from "@/lib/market";
import { LOT_KEEP_DAYS, lotSummary, type LotType } from "@/lib/harvest";
import { bankTheoTen, donSoTaiKhoan, laBankHopLe } from "@/lib/banks";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

function touchMarket(barnSlug?: string) {
  revalidatePath("/cho");
  revalidatePath("/cho/cua-toi");
  revalidatePath("/admin");
  if (barnSlug) revalidatePath(`/chuong/${barnSlug}/thu-hoach`);
}

/** Ngày sớm nhất một lô còn được nông trại giữ hộ. Cũ hơn mốc này là hết hạn. */
const keptSince = () => new Date(Date.now() - LOT_KEEP_DAYS * 86_400_000);

// ---------------- Tài khoản nhận tiền ----------------

/**
 * Lưu số tài khoản để nông trại chuyển tiền về sau khi lô được giao.
 *
 * BẮT BUỘC có trước khi đăng bán: thiếu nó thì tiền người mua về mà không biết trả cho
 * ai, và người bán chờ trong vô vọng - thứ phá niềm tin nhanh nhất trên một cái chợ.
 */
export async function savePayoutAccount(input: {
  bankName: string; accountNo: string; holderName: string;
}): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const bankName = cleanLine(input?.bankName, 60);
  const holderName = cleanLine(input?.holderName, 60);
  const accountNo = donSoTaiKhoan(input?.accountNo ?? "");

  if (!bankName) return nope("Chọn ngân hàng giúp mình nhé.");
  // Ngân hàng phải nằm trong danh sách (§9.6 - ô chọn ở client chỉ là mỹ quan).
  // Trước bản này đây là ô chữ tự do: "VCB", "Vietcom", "ngoại thương" cùng là một
  // ngân hàng, và người trực nông trại phải đoán lúc ngồi chuyển tiền cho người bán.
  if (!laBankHopLe(bankName)) {
    return nope("Ngân hàng này chưa có trong danh sách - chọn lại trong ô giúp mình nhé.");
  }
  if (accountNo.length < 6) return nope("Số tài khoản chưa đúng - kiểm tra lại giúp mình.");
  if (!holderName) return nope("Ghi tên chủ tài khoản (không dấu) giúp mình nhé.");

  const data = { bankName, accountNo, holderName };
  await prisma.payoutAccount.upsert({
    where: { userId: me.id }, update: data, create: { userId: me.id, ...data },
  });
  revalidatePath("/cho/cua-toi");
  revalidatePath("/tai-khoan");
  return ok("Đã lưu tài khoản nhận tiền.");
}

/**
 * Tra tên chủ tài khoản từ số tài khoản (VietQR Lookup).
 *
 * Vì sao đáng làm: người bán gõ tên mình **có dấu**, viết tắt, hoặc gõ tên người khác
 * vì đang nhìn số tài khoản của người thân. Người trực nông trại chỉ phát hiện lúc
 * chuyển tiền - tức là lúc đã muộn. Tra được tên thật thì sai lệch lộ ra ngay tại ô nhập.
 *
 * ⚠️ **CHƯA ĐƯỢC KIỂM THỬ VỚI KHOÁ THẬT.** Tôi không có tài khoản VietQR Business để
 * gọi thử, nên đoạn này viết theo tài liệu chứ không theo quan sát - đúng loại "biên
 * giới với dịch vụ ngoài" đã một lần chết câm mà mọi phép kiểm vẫn xanh (§10, §11.4).
 * Vì thế nó được dựng để **hỏng thì không ảnh hưởng gì**:
 *
 *  · chưa cấu hình khoá ⟹ trả `chua-cau-hinh`, giao diện KHÔNG hiện nút tra cứu
 *    (một nút bấm vào không ra gì còn tệ hơn không có nút);
 *  · lỗi mạng, hết giờ, bên kia đổi định dạng ⟹ trả `khong-tra-duoc`, người dùng gõ tay
 *    như trước;
 *  · **không bao giờ chặn** việc lưu tài khoản. Đây là chỗ gợi ý, không phải cổng kiểm.
 *
 * Ai có khoá thật: đặt `VIETQR_CLIENT_ID` + `VIETQR_API_KEY` rồi thử ĐÚNG một số tài
 * khoản của chính mình trước khi tin.
 */
export type TraCuuTen =
  | { ok: true; ten: string }
  | { ok: false; ly: "chua-cau-hinh" | "thieu-thong-tin" | "khong-tra-duoc" };

export async function traCuuChuTaiKhoan(bankName: string, accountNoRaw: string): Promise<TraCuuTen> {
  const id = process.env.VIETQR_CLIENT_ID;
  const key = process.env.VIETQR_API_KEY;
  if (!id || !key) return { ok: false, ly: "chua-cau-hinh" };

  const bank = bankTheoTen(bankName);
  const accountNo = donSoTaiKhoan(accountNoRaw);
  if (!bank || accountNo.length < 6) return { ok: false, ly: "thieu-thong-tin" };

  try {
    // Hạn 6 giây: người dùng đang đứng trước ô nhập, chờ lâu hơn thế thì họ tự gõ
    // xong rồi. Thà bỏ cuộc sớm còn hơn treo cái nút.
    const res = await fetch("https://api.vietqr.io/v2/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-client-id": id, "x-api-key": key },
      body: JSON.stringify({ bin: bank.bin, accountNumber: accountNo }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, ly: "khong-tra-duoc" };
    const j = (await res.json()) as { data?: { accountName?: string } };
    const ten = cleanLine(j?.data?.accountName ?? "", 60);
    return ten ? { ok: true, ten } : { ok: false, ly: "khong-tra-duoc" };
  } catch {
    return { ok: false, ly: "khong-tra-duoc" };
  }
}

/** Giao diện hỏi câu này để biết có bày nút "Tra tên" hay không. */
export async function coTraCuuTen(): Promise<boolean> {
  return !!(process.env.VIETQR_CLIENT_ID && process.env.VIETQR_API_KEY);
}

// ---------------- Đăng bán ----------------

/**
 * Đăng một lô lên chợ.
 *
 * Người bán KHÔNG truyền giá - server tra `MarketPrice` rồi tính lại toàn bộ (§9.6).
 * Client chỉ được nói "tôi muốn bán lô này".
 */
export async function listLot(lotId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const lot = await prisma.harvestLot.findUnique({
    where: { id: String(lotId) },
    select: {
      id: true, type: true, qty: true, weightKg: true, collectedAt: true, status: true,
      ownerId: true,
      barn: { select: { slug: true, label: true, flock: { select: { breed: { select: { slug: true } } } } } },
      listing: { select: { id: true, status: true } },
    },
  });
  if (!lot) return nope("Không tìm thấy lô này.");
  if (lot.ownerId !== me.id && me.role !== "ADMIN") return nope("Lô này không thuộc về bạn.");
  if (lot.status !== "AT_FARM") return nope("Lô này không còn ở nông trại nữa.");
  if (lot.listing && lot.listing.status !== "CANCELLED") return nope("Lô này đang được rao rồi.");
  if (lot.collectedAt < keptSince()) {
    return nope(`Lô này đã quá ${LOT_KEEP_DAYS} ngày nông trại giữ hộ - không đăng bán được nữa.`);
  }
  if (lot.type === "MEAT" && !lot.weightKg) {
    return nope("Lô gà thịt chưa có số cân - nhờ nông dân cân và ghi lại giúp mình.");
  }

  // Phải có chỗ nhận tiền trước đã.
  const acc = await prisma.payoutAccount.findUnique({ where: { userId: me.id } });
  if (!acc) return nope("Điền tài khoản nhận tiền trước rồi mới đăng bán được nhé.");

  // Trần số lô/tháng - hàng rào chống biến chợ thành kênh kinh doanh.
  const since = new Date(Date.now() - 30 * 86_400_000);
  const daBan = await prisma.marketListing.count({
    where: { sellerId: me.id, createdAt: { gte: since }, status: { not: "CANCELLED" } },
  });
  if (daBan >= MAX_LISTINGS_PER_MONTH) {
    return nope(
      `Mỗi người đăng tối đa ${MAX_LISTINGS_PER_MONTH} lô trong 30 ngày. Chợ là chỗ để không phí đồ ăn khi bận, không phải kênh bán buôn.`,
    );
  }

  // Giá NIÊM YẾT - tra ở server, không nhận từ client.
  const rows = await prisma.marketPrice.findMany({
    select: { type: true, breedSlug: true, unitVnd: true, effectiveFrom: true },
  });
  const unitVnd = priceFor(rows, lot.type as LotType, lot.barn.flock?.breed?.slug);
  if (!unitVnd) return nope("Nông trại chưa niêm yết giá cho loại này - liên hệ nông trại nhé.");

  const money = lotMoney(unitVnd, { type: lot.type as LotType, qty: lot.qty, weightKg: lot.weightKg }, MARKET_FEE_PERCENT);
  if (money.priceVnd <= 0) return nope("Không tính được giá cho lô này.");

  const tomTat = lotSummary({ type: lot.type as LotType, qty: lot.qty, weightKg: lot.weightKg });

  // Đổi trạng thái lô và tạo tin đăng trong CÙNG transaction: nửa vời thì lô bị khoá
  // mà không có tin nào rao, hoặc ngược lại.
  await prisma.$transaction(async (tx) => {
    await tx.harvestLot.update({ where: { id: lot.id }, data: { status: "LISTED" } });
    await tx.marketListing.create({
      data: {
        lotId: lot.id, sellerId: me.id,
        priceVnd: money.priceVnd, feePercent: money.feePercent,
        feeVnd: money.feeVnd, netVnd: money.netVnd,
      },
    });
  });

  await track("listing_created", {
    userId: me.id, barnSlug: lot.barn.slug,
    props: { lotId: lot.id, type: lot.type, priceVnd: money.priceVnd, netVnd: money.netVnd },
  });

  touchMarket(lot.barn.slug);
  return ok(`Đã đăng ${tomTat} lên chợ - giá ${money.priceVnd.toLocaleString("vi-VN")}đ, bạn nhận ${money.netVnd.toLocaleString("vi-VN")}đ sau phí.`);
}

/** Người bán rút tin. Chỉ khi CHƯA có ai trả tiền. */
export async function cancelListing(listingId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const l = await prisma.marketListing.findUnique({
    where: { id: String(listingId) },
    select: { id: true, sellerId: true, status: true, lotId: true, lot: { select: { barn: { select: { slug: true } } } } },
  });
  if (!l) return nope("Không tìm thấy tin đăng này.");
  if (l.sellerId !== me.id && me.role !== "ADMIN") return nope("Tin này không phải của bạn.");
  if (l.status === "PAID" || l.status === "DELIVERED") {
    return nope("Đơn đã có người trả tiền - liên hệ nông trại nếu cần xử lý.");
  }

  // So-sánh-rồi-đặt: người mua có thể vừa trả tiền đúng lúc này.
  const { count } = await prisma.marketListing.updateMany({
    where: { id: l.id, status: { in: ["LISTED", "RESERVED"] } },
    data: { status: "CANCELLED", buyerId: null, payCode: null, reservedAt: null },
  });
  if (count === 0) return nope("Tin này vừa đổi trạng thái - tải lại trang giúp mình.");
  await prisma.harvestLot.update({ where: { id: l.lotId }, data: { status: "AT_FARM" } });

  touchMarket(l.lot.barn.slug);
  return ok("Đã rút tin - lô về lại sổ thu hoạch của bạn.");
}

// ---------------- Mua ----------------

/**
 * Bấm mua: giữ chỗ và sinh mã chuyển khoản. Tiền về mới thật sự thành của người mua
 * (`lib/payments.confirmMarketPaid`).
 *
 * Giữ chỗ TỰ HẾT HẠN mà không cần job nền: điều kiện "đang rao HOẶC đã giữ quá lâu"
 * nằm ngay trong `WHERE` - người sau bấm mua là đoạt được chỗ của người trước.
 */
export async function reserveListing(listingId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để mua.");
  if (me.role === "WORKER") return nope("Tài khoản nông dân không mua hàng trên chợ.");

  const l = await prisma.marketListing.findUnique({
    where: { id: String(listingId) },
    select: {
      id: true, sellerId: true, status: true, priceVnd: true, payCode: true,
      lot: { select: { id: true, type: true, qty: true, weightKg: true, collectedAt: true, barn: { select: { slug: true } } } },
    },
  });
  if (!l) return nope("Không tìm thấy tin đăng này.");
  if (l.sellerId === me.id) return nope("Đây là lô của chính bạn.");
  if (l.lot.collectedAt < keptSince()) return nope("Lô này đã quá hạn nông trại giữ hộ.");

  // ⭐ CỔNG GIỮ VÒNG LẶP CHÍNH: chỉ người đang nuôi mới mua được. Không có luật này
  // thì mua lại rẻ và dễ hơn nhận nuôi, và người ta bỏ nhận nuôi.
  const co = await prisma.barn.count({ where: { ownerId: me.id } });
  if (co === 0) {
    return nope("Chợ dành cho người đang nhận nuôi chuồng. Nhận một chuồng rồi quay lại nhé!");
  }

  const code = newPayCode("MARKET");
  const cu = new Date(Date.now() - RESERVE_HOLD_MINUTES * 60_000);

  // So-sánh-rồi-đặt (§9.24): hai người bấm mua cùng lúc thì chỉ MỘT bên đặt được chỗ.
  const { count } = await prisma.marketListing.updateMany({
    where: {
      id: l.id,
      OR: [
        { status: "LISTED" },
        // Người trước giữ chỗ mà không trả tiền quá lâu → nhả ra. Lười, không cần cron.
        { status: "RESERVED", reservedAt: { lt: cu } },
      ],
    },
    data: { status: "RESERVED", buyerId: me.id, reservedAt: new Date(), payCode: code },
  });
  if (count === 0) return nope("Có người vừa đặt lô này trước bạn - thử lô khác nhé.");

  await track("listing_reserved", {
    userId: me.id, barnSlug: l.lot.barn.slug,
    props: { listingId: l.id, priceVnd: l.priceVnd },
  });

  const tomTat = lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg });
  await notify({
    userId: l.sellerId,
    kind: "PAYMENT",
    title: `🛒 Có người đặt mua ${tomTat}`,
    body: "Đang chờ họ chuyển khoản. Tiền về là nông trại giao và chuyển tiền cho bạn.",
    href: "/cho/cua-toi",
  });

  touchMarket(l.lot.barn.slug);
  return ok(`Đã giữ chỗ cho bạn. Chuyển khoản với nội dung ${code} trong ${Math.round(RESERVE_HOLD_MINUTES / 60)} giờ nhé.`);
}

// ---------------- Ví: yêu cầu rút tiền ----------------

/**
 * Người bán bấm "Rút tiền về tài khoản".
 *
 * ⚠️ Đây **KHÔNG phải** lệnh chuyển tiền, và cố ý không phải. §9.29: chi trả luôn làm
 * TAY kèm ảnh biên lai - tự động đẩy tiền ra là chỗ sai một lần mất tiền thật, và ở
 * quy mô này không có cách nào kiểm lại ngoài mắt người. Hàm này chỉ đóng dấu
 * `requestedAt` lên các khoản đang chờ, để:
 *
 *  · người bán **nói được** rằng họ đang chờ - trước bản này họ không có cách nào cả,
 *    chỉ ngồi đợi nông trại nhớ ra;
 *  · hàng đợi ở `/admin` xếp người đã yêu cầu **lên trước**, thay vì để người trực
 *    đoán ai đang cần gấp.
 *
 * Tiền đã là của họ từ lúc lô được giao. Cái nút này không làm nó "của họ hơn" - nó
 * chỉ làm việc chờ đợi có tiếng nói.
 */
export async function requestPayout(): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  // Không có chỗ nhận tiền thì đừng nhận yêu cầu: nông trại sẽ không chuyển đi đâu
  // được, và người bán ngồi chờ một thứ không bao giờ tới.
  const acc = await prisma.payoutAccount.findUnique({ where: { userId: me.id } });
  if (!acc) return nope("Điền tài khoản nhận tiền trước đã nhé - nông trại cần biết chuyển về đâu.");

  // So-sánh-rồi-đặt (§9.24): `requestedAt: null` nằm trong WHERE nên bấm hai lần ở hai
  // tab không ghi đè dấu thời gian cũ, và khoản vừa được admin chuyển xong (`PAID`)
  // không bị kéo ngược về hàng đợi.
  const { count } = await prisma.payout.updateMany({
    where: { userId: me.id, status: "PENDING", requestedAt: null },
    data: { requestedAt: new Date() },
  });
  if (count === 0) {
    return nope("Chưa có khoản nào để rút - tiền chỉ về sau khi lô của bạn được giao tận tay.");
  }

  await track("payout_requested", { userId: me.id, props: { soKhoan: count } });

  revalidatePath("/cho/cua-toi");
  revalidatePath("/admin");
  return ok(
    `Đã gửi yêu cầu rút ${count} khoản. Nông trại chuyển khoản tay và gửi kèm ảnh biên lai - ` +
    "thường trong vài ngày làm việc.",
  );
}
