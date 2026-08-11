"use server";
// CHỢ NÔNG TRẠI - đăng bán, mua, và tài khoản nhận tiền.
//
// Ba luật sống còn của tính năng này, cả ba đều nằm ở đây chứ không nằm ở giao diện:
//
//  1. **Bán thì phải có chuồng; MUA thì chỉ cần một tài khoản.** Hai vế không đối xứng,
//     và đó là chủ ý (§11.40). Bán vốn đã tự khoá theo chuồng - không nuôi thì không có
//     `HarvestLot` nào để đăng. Còn phía mua từng bị chặn thêm một cổng "phải đang nhận
//     nuôi ≥1 chuồng", nay đã gỡ: cổng đó **không** giữ được vòng lặp nhận nuôi (không
//     ai đi nhận nuôi một chuồng 75 ngày để mua một lô trứng), mà chỉ chặn đúng người
//     đang muốn trả tiền cho hàng của người nuôi thật.
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
  MARKET_FEE_PERCENT, MAX_LISTINGS_PER_MONTH, RESERVE_HOLD_MINUTES,
  conLaiVi, hanGiuCho, lotMoney, priceFor,
} from "@/lib/market";
import { LOT_KEEP_DAYS, lotSummary, type DeliverTo, type LotType } from "@/lib/harvest";
import { bankTheoTen, donSoTaiKhoan, laBankHopLe } from "@/lib/banks";
import { VUONG_MAC_VI, tienDon, vuongMacGiaoHang } from "@/lib/delivery";
import { diaChiVaVung } from "@/lib/zones";
import { fmtVnd } from "@/lib/pricing";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

function touchMarket(barnSlug?: string) {
  revalidatePath("/cho");
  revalidatePath("/cho/gio");
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
  // ⚠️ BẮT ĐĂNG NHẬP, dù hàm này không đọc dữ liệu của ai. Mỗi `"use server"` là một
  // endpoint công khai (§1.2 luật 4), và cái này **tiêu khoá VietQR của nông trại**:
  // để trần thì bất kỳ ai cũng bắn được không giới hạn, vừa đốt hạn mức của một dịch vụ
  // có tính phí, vừa biến khoá của nông trại thành một máy tra **tên chủ tài khoản theo
  // số tài khoản** cho người lạ dùng miễn phí - đó là dữ liệu của người khác, và hoá đơn
  // thì nông trại trả. Phát hiện bằng `tests/cong-quyen.test.ts` (§11.18), không phải
  // bằng mắt.
  if (!(await getSessionUser())) return { ok: false, ly: "thieu-thong-tin" };

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
 * Bỏ một lô vào giỏ - giữ chỗ ngay, chưa sinh mã chuyển khoản.
 *
 * Đây là `reserveListing` cũ, tách làm hai nhịp (§11.45). Trước Đợt 13 bấm mua là chốt
 * luôn một đơn một mã, nên mua 3 lô là **ba lần chuyển khoản** với ba nội dung khác nhau
 * và người mua phải làm đúng cả ba. Nay lô vào giỏ trước, chốt một lần sau.
 *
 * ⚠️ **Vào giỏ là GIỮ CHỖ THẬT** (`status = RESERVED`), không phải đánh dấu suông. Nếu
 * chỉ ghi nhớ ý định thì người ta gom giỏ xong tới lúc chốt mới biết mất hàng - và mốc
 * `reservedAt` là thứ giữ nguyên luật cũ: quá `RESERVE_HOLD_MINUTES` thì người sau đoạt
 * được. Nhờ vậy không đẻ ra khái niệm "giữ chỗ" thứ hai phải đồng bộ với cái thứ nhất.
 *
 * ⚠️ **ĐỊA CHỈ PHẢI CÓ TRƯỚC KHI BỎ VÀO GIỎ** (§11.46), không phải trước khi chốt. Chính
 * vì vào giỏ là giữ chỗ thật: người chưa có địa chỉ mà vẫn bỏ vào giỏ được thì họ **rút
 * lô khỏi chợ** trong 24 giờ - người khác không mua được, người bán mất một lượt - rồi
 * tới bước chốt mới đọc được rằng mình không đặt nổi. Chặn ở đây thì cái lô đó ở lại chợ.
 */
export async function themVaoGio(listingId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để mua.");
  if (me.role === "WORKER") return nope("Tài khoản nông dân không mua hàng trên chợ.");

  // Hai truy vấn độc lập - `Promise.all` để cổng địa chỉ không tốn thêm một lượt chờ.
  const [l, { address, zone }] = await Promise.all([
    prisma.marketListing.findUnique({
      where: { id: String(listingId) },
      select: {
        id: true, sellerId: true, status: true, priceVnd: true,
        lot: { select: { id: true, type: true, qty: true, weightKg: true, collectedAt: true, barn: { select: { slug: true } } } },
      },
    }),
    diaChiVaVung(me.id),
  ]);
  if (!l) return nope("Không tìm thấy tin đăng này.");
  if (l.sellerId === me.id) return nope("Đây là lô của chính bạn.");
  if (l.lot.collectedAt < keptSince()) return nope("Lô này đã quá hạn nông trại giữ hộ.");

  // Cổng giao hàng - kiểm ở ĐÂY, không chỉ ở `chotGio`. Cùng bộ lý do với `claimLot`,
  // nên ba đường đặt hàng nói đúng một câu (`VUONG_MAC_VI`).
  const vuong = vuongMacGiaoHang(address, zone);
  if (vuong) return nope(VUONG_MAC_VI[vuong]);

  // ⚠️ Ở ĐÂY TỪNG CÓ MỘT CỔNG NỮA: `barn.count({ ownerId: me.id }) === 0` thì từ chối,
  // với lý do "không có luật này thì mua lại dễ hơn nhận nuôi". Đã gỡ (§11.40), vì lập
  // luận đó không đứng được khi soi vào hai bên cán cân:
  //
  //  · Nhận nuôi là 75 ngày và vài trăm nghìn, mua một lô là một lần chuyển khoản. Không
  //    ai bỏ cái thứ nhất vì có cái thứ hai - chúng không thay thế nhau.
  //  · Người bị cổng đó chặn không phải "kẻ ăn sẵn": đó là người vừa lập tài khoản và
  //    đang muốn TRẢ TIỀN cho lô hàng của một cô chú nuôi thật. Chặn họ là chặn đúng
  //    dòng tiền mà cả cái chợ này tồn tại để phục vụ, và bỏ phí lô hàng của người bán.
  //  · Người bán thì vẫn phải có chuồng - `listLot` đòi một `HarvestLot` của chính họ,
  //    mà lô chỉ sinh ra từ một chuồng đang nuôi. Vế đó không cần cổng nào cả.
  //
  // Hai cổng CÒN LẠI ở phía mua, đừng gỡ: tài khoản nông dân không mua (§9.14) và không
  // ai mua lô của chính mình.
  const gio = await gioDangMo(me.id);
  const cu = new Date(Date.now() - RESERVE_HOLD_MINUTES * 60_000);

  // So-sánh-rồi-đặt (§9.24): hai người bấm mua cùng lúc thì chỉ MỘT bên đặt được chỗ.
  const { count } = await prisma.marketListing.updateMany({
    where: {
      id: l.id,
      OR: [
        { status: "LISTED" },
        // Người trước giữ chỗ mà không trả tiền quá lâu → nhả ra. Lười, không cần cron.
        //
        // ⚠️ **`orderStatus` phải nằm trong điều kiện này** (§9.34). Không có nó thì đây
        // là một cửa ĐOẠT LÔ CỦA NGƯỜI ĐANG CHUYỂN KHOẢN: người ta chốt đơn ở phút thứ
        // 170, cầm mã ra ngân hàng, và ở phút 181 người khác bấm mua là lô sang tay -
        // rồi tiền của người thứ nhất về một đơn không còn hàng. Với hạn 24 giờ cũ thì
        // hiếm; với hạn 3 giờ thì đó là cửa sổ bình thường của một lần chuyển khoản.
        //
        // Chỉ đoạt được lô còn nằm trong một cái GIỎ (`OPEN`) - tức chưa ai chốt gì cả.
        // Đơn đã chốt thì để `releaseStaleHolds` huỷ **cả đơn** một lượt kèm chuông báo,
        // đừng rút lẻ từng lô ra khỏi một đơn đang có mã chuyển khoản sống.
        { status: "RESERVED", reservedAt: { lt: cu }, OR: [{ orderId: null }, { order: { status: "OPEN" } }] },
      ],
    },
    data: { status: "RESERVED", buyerId: me.id, reservedAt: new Date(), orderId: gio.id },
  });
  if (count === 0) return nope("Có người vừa đặt lô này trước bạn - thử lô khác nhé.");

  await track("listing_reserved", {
    userId: me.id, barnSlug: l.lot.barn.slug,
    props: { listingId: l.id, priceVnd: l.priceVnd, orderId: gio.id },
  });

  const tomTat = lotSummary({ type: l.lot.type as LotType, qty: l.lot.qty, weightKg: l.lot.weightKg });
  // ⚠️ **KHÔNG báo cho người bán ở bước này** (§9.8). Vào giỏ chưa phải là mua: người ta
  // bỏ vào rồi bỏ ra là chuyện thường, và mỗi lần như thế dội một cái chuông "có người
  // đặt mua" là cách nhanh nhất để người bán tắt chuông. Người bán được báo lúc **tiền
  // về** (`confirmMarketPaid`), tức lúc có thật một việc để họ biết.
  touchMarket(l.lot.barn.slug);
  const soLo = await prisma.marketListing.count({ where: { orderId: gio.id } });
  return ok(`Đã giữ ${tomTat} trong giỏ (${soLo} lô). Nông trại giữ chỗ ${Math.round(RESERVE_HOLD_MINUTES / 60)} giờ.`);
}

/** Bỏ một lô khỏi giỏ - lô về lại chợ ngay cho người khác mua. */
export async function boKhoiGio(listingId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const l = await prisma.marketListing.findUnique({
    where: { id: String(listingId) },
    select: { id: true, buyerId: true, status: true, order: { select: { status: true } }, lot: { select: { barn: { select: { slug: true } } } } },
  });
  if (!l) return nope("Không tìm thấy lô này.");
  if (l.buyerId !== me.id) return nope("Lô này không nằm trong giỏ của bạn.");
  // Đã chốt giỏ rồi thì không rút lẻ được nữa: mã chuyển khoản đã sinh và mang số tiền
  // của cả đơn, rút một lô ra là làm sai đúng con số người ta sắp chuyển.
  if (l.order && l.order.status !== "OPEN") {
    return nope("Đơn này đã chốt - liên hệ nông trại nếu cần đổi.");
  }

  const { count } = await prisma.marketListing.updateMany({
    where: { id: l.id, status: "RESERVED", buyerId: me.id },
    data: { status: "LISTED", buyerId: null, reservedAt: null, orderId: null },
  });
  if (count === 0) return nope("Lô này vừa đổi trạng thái - tải lại trang giúp mình.");

  touchMarket(l.lot.barn.slug);
  return ok("Đã bỏ khỏi giỏ - lô về lại chợ.");
}

/**
 * Chốt giỏ: tính tiền, chụp địa chỉ, sinh MỘT mã chuyển khoản cho cả đơn.
 *
 * Đây là chỗ **duy nhất** sinh `MarketOrder.payCode`. Ba con số (`goodsVnd`, `shipVnd`,
 * `totalVnd`) chụp lại tại đây và không đổi nữa - nông trại sửa phí giao ngày mai thì mã
 * QR người ta đang cầm vẫn mang đúng số cũ, cùng luật với giá của tin đăng (§9.6).
 */
export async function chotGio(): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");
  if (me.role === "WORKER") return nope("Tài khoản nông dân không mua hàng trên chợ.");

  const gio = await prisma.marketOrder.findFirst({
    where: { buyerId: me.id, status: "OPEN" },
    // ⚠️ **PHẢI CÙNG THỨ TỰ VỚI `gioDangMo`** - và trước Đợt 16 chỗ này không có
    // `orderBy` nào cả. `gioDangMo` (chỗ `themVaoGio` bỏ hàng vào) lấy giỏ **cũ nhất**,
    // còn chỗ này để Postgres chọn tuỳ ý; hai người đọc hai cái giỏ khác nhau. Khi tài
    // khoản có hơn một giỏ `OPEN` - chuyện `gioDangMo` cố ý chấp nhận, xem chú thích ở
    // đó - thì hậu quả là **bỏ hàng vào giỏ xong bấm "Chốt đơn" nhận được "Giỏ của bạn
    // đang trống"**. Đo được đúng như thế lúc thử tay Đợt 16.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      listings: {
        select: {
          id: true, priceVnd: true, status: true, reservedAt: true,
          lot: { select: { collectedAt: true, barn: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!gio || gio.listings.length === 0) return nope("Giỏ của bạn đang trống.");

  // Lô rơi khỏi `RESERVED` (bị người khác đoạt, hoặc người bán rút tin) thì phải lộ ra
  // TRƯỚC khi sinh mã - sinh mã rồi mới phát hiện là để người ta chuyển tiền cho một
  // đơn không còn đủ hàng.
  const hong = gio.listings.filter((l) => l.status !== "RESERVED" || l.lot.collectedAt < keptSince());
  if (hong.length > 0) {
    return nope(`${hong.length} lô trong giỏ không còn giữ được nữa - mở giỏ bỏ chúng ra rồi chốt lại giúp mình.`);
  }

  // ⚠️ Hạn đếm từ lúc VÀO GIỎ, và `chotGio` KHÔNG đặt lại nó (§9.34). Lô nào đã quá hạn
  // thì từ chối ngay: sinh mã cho một lô sắp bị người khác đoạt là đẩy người ta đi
  // chuyển khoản cho thứ họ có thể không nhận được.
  const conLai = gio.listings
    .map((l) => hanGiuCho(l.reservedAt))
    .reduce<number | null>((min, h) => {
      if (!h) return min;
      const t = h.getTime() - Date.now();
      return min === null ? t : Math.min(min, t);
    }, null);
  if (conLai !== null && conLai <= 0) {
    return nope("Chỗ giữ trong giỏ đã hết hạn - mở giỏ bỏ lô cũ ra rồi bỏ lại vào giúp mình nhé.");
  }

  // Địa chỉ + vùng: bắt buộc, và tính phí từ VÙNG chứ không nhận số từ client (§9.6).
  const { address, zone } = await diaChiVaVung(me.id);
  const vuong = vuongMacGiaoHang(address, zone);
  if (vuong) return nope(VUONG_MAC_VI[vuong]);
  if (!address || !zone) return nope(VUONG_MAC_VI["chua-co-dia-chi"]);

  const tien = tienDon(gio.listings.map((l) => l.priceVnd), zone);
  const deliverTo: DeliverTo = {
    fullName: address.fullName, phone: address.phone, line: address.line,
    note: address.note, zone: zone.name,
  };
  const code = newPayCode("MARKET");

  // So-sánh-rồi-đặt: `status: "OPEN"` nằm trong WHERE nên hai tab cùng bấm chốt thì chỉ
  // một bên sinh mã, bên kia đọc lại thấy đơn đã chốt.
  const { count } = await prisma.marketOrder.updateMany({
    where: { id: gio.id, status: "OPEN" },
    data: {
      status: "RESERVED", payCode: code, reservedAt: new Date(),
      goodsVnd: tien.goodsVnd, shipVnd: tien.shipVnd, totalVnd: tien.totalVnd,
      deliverTo: deliverTo as object, zoneName: zone.name,
    },
  });
  if (count === 0) return nope("Giỏ này vừa được chốt ở một tab khác - tải lại trang giúp mình.");

  await track("order_placed", {
    userId: me.id,
    props: { orderId: gio.id, soLo: gio.listings.length, goodsVnd: tien.goodsVnd, shipVnd: tien.shipVnd },
  });

  for (const slug of new Set(gio.listings.map((l) => l.lot.barn.slug))) touchMarket(slug);
  // Nói ĐÚNG thời gian còn lại, không nói lại "3 giờ" từ đầu: hạn đếm từ lúc bỏ vào giỏ,
  // nên người gom giỏ hai tiếng rưỡi rồi mới chốt chỉ còn nửa tiếng. Hứa 3 giờ ở đây là
  // hứa một thứ hệ thống sẽ không giữ.
  return ok(
    `Đã chốt ${gio.listings.length} lô · ${fmtVnd(tien.totalVnd)}` +
    (tien.shipVnd > 0 ? ` (gồm ${fmtVnd(tien.shipVnd)} phí giao)` : " · miễn phí giao") +
    `. Chuyển khoản nội dung ${code}` +
    (conLai !== null ? ` (${conLaiVi(conLai)})` : "") +
    ` rồi bấm "Tôi đã chuyển khoản" nhé.`,
  );
}

/**
 * Người mua bấm "Tôi đã chuyển khoản" - cùng khuôn với cọc chuồng (`actions.reportTransfer`).
 *
 * ⚠️ Nút này **không** xác nhận tiền. Nó chuyển đơn sang `REPORTED` để:
 *  · người trực nhìn thấy khoản đang chờ ở `/admin` (trước Đợt 15 đơn chợ **không có
 *    bàn đối soát nào cả** - không có webhook thì tiền không bao giờ được xác nhận);
 *  · và, quan trọng hơn, **đóng băng chỗ giữ**: từ đây không việc nền nào huỷ đơn nữa
 *    (§9.34). Người đã chuyển tiền thật không được mất hàng vì ngân hàng chậm.
 *
 * Tiền vẫn chỉ được xác nhận bởi webhook hoặc người trực bấm tay - `confirmMarketPaid`.
 */
export async function baoDaChuyenKhoan(orderId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const don = await prisma.marketOrder.findUnique({
    where: { id: String(orderId) },
    select: { id: true, buyerId: true, status: true, payCode: true, totalVnd: true },
  });
  if (!don) return nope("Không tìm thấy đơn này.");
  if (don.buyerId !== me.id) return nope("Đơn này không phải của bạn.");
  if (don.status === "REPORTED") return nope("Bạn đã báo chuyển khoản rồi - nông trại đang đối soát.");
  if (don.status === "PAID" || don.status === "DELIVERED") return nope("Đơn này đã được xác nhận rồi.");
  if (don.status !== "RESERVED") return nope("Đơn này chưa chốt - bấm \"Chốt đơn\" trước nhé.");

  // So-sánh-rồi-đặt (§9.24): webhook có thể vừa xác nhận xong ngay lúc này, và kéo một
  // đơn đã `PAID` ngược về `REPORTED` là làm nông dân mất việc giao vừa nhận.
  const { count } = await prisma.marketOrder.updateMany({
    where: { id: don.id, status: "RESERVED" },
    data: { status: "REPORTED", reportedAt: new Date() },
  });
  if (count === 0) return nope("Đơn này vừa đổi trạng thái - tải lại trang giúp mình nhé.");

  await track("market_reported", {
    userId: me.id,
    props: { orderId: don.id, totalVnd: don.totalVnd, payCode: don.payCode },
  });

  touchMarket();
  return ok(
    "Đã ghi nhận! Nông trại đối soát rồi báo lại - thường trong vài giờ làm việc. " +
    "Các lô của bạn được giữ nguyên trong lúc chờ, không ai đoạt được nữa.",
  );
}

/**
 * Người mua tự huỷ đơn mình đã chốt nhưng CHƯA trả tiền.
 *
 * ⚠️ Trước Đợt 16 đường này không tồn tại (§11.45): chốt nhầm, đổi ý, hay chỉ là bấm thử
 * thì lối ra duy nhất là **ngồi đợi hết hạn giữ chỗ** rồi việc nền huỷ hộ - trong lúc đó
 * lô nằm ngoài chợ, người bán mất lượt bán, và người mua thì nhìn một khoản mình không
 * định trả nằm trên màn hình mà không làm gì được. Bắt người ta chờ một cái đồng hồ để
 * rút lại quyết định của chính mình là thiết kế lười, không phải thiết kế an toàn.
 *
 * ⚠️ **CHỈ đơn `RESERVED`.** Đơn `REPORTED` là đơn người mua đã nói "tôi chuyển rồi" -
 * huỷ nó ở đây là mở đúng cửa mà §9.34 vừa đóng: tiền có thể đang trên đường, mà lô thì
 * đã nhả cho người khác. Muốn huỷ đơn đó thì phải qua người trực, vì phải có người NHÌN
 * vào sao kê. Đơn `PAID` thì đã là hàng của họ - đường lùi là xin hoàn tiền (§11.38).
 */
export async function huyDon(orderId: string): Promise<ActionResult> {
  const me = await getSessionUser();
  if (!me) return nope("Bạn cần đăng nhập để làm việc này.");

  const don = await prisma.marketOrder.findUnique({
    where: { id: String(orderId) },
    select: {
      id: true, buyerId: true, status: true, payCode: true, totalVnd: true,
      listings: { select: { id: true, lot: { select: { barn: { select: { slug: true } } } } } },
    },
  });
  if (!don) return nope("Không tìm thấy đơn này.");
  if (don.buyerId !== me.id) return nope("Đơn này không phải của bạn.");
  if (don.status === "REPORTED") {
    return nope("Bạn đã báo chuyển khoản cho đơn này - nhắn nông trại để huỷ giúp mình nhé.");
  }
  if (don.status === "PAID" || don.status === "DELIVERED") {
    return nope("Đơn này đã thanh toán rồi - nếu hàng có vấn đề thì bấm \"Hàng không đúng?\" ở Đơn của tôi.");
  }
  if (don.status !== "RESERVED") return nope("Đơn này không ở trạng thái huỷ được.");

  // Nhả lô TRƯỚC rồi mới huỷ đơn, trong cùng một transaction: nửa vời theo chiều ngược
  // lại là đơn đã huỷ mà lô vẫn bị giữ - không ai mua được và không ai đi tìm nữa.
  //
  // So-sánh-rồi-đặt ở cả hai vế (§9.24): webhook có thể vừa xác nhận tiền ngay lúc này,
  // và huỷ một đơn vừa `PAID` là nhả hàng của người đã trả tiền.
  let thua = false;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.marketOrder.updateMany({
      where: { id: don.id, status: "RESERVED" },
      // Xoá `payCode` là bắt buộc, cùng lý do với `releaseStaleHolds`: giữ lại thì một
      // khoản chuyển khoản muộn vẫn khớp vào đơn đã chết (§9.22).
      data: { status: "CANCELLED", payCode: null },
    });
    if (count === 0) { thua = true; return; }
    await tx.marketListing.updateMany({
      where: { orderId: don.id, status: "RESERVED" },
      data: { status: "LISTED", buyerId: null, reservedAt: null, orderId: null },
    });
  });
  if (thua) return nope("Đơn này vừa đổi trạng thái - tải lại trang giúp mình nhé.");

  await track("order_cancelled", {
    userId: me.id,
    props: { orderId: don.id, soLo: don.listings.length, totalVnd: don.totalVnd },
  });

  // KHÔNG báo người bán (§9.8) - cùng lý do với lúc vào giỏ: lô quay lại chợ là chuyện
  // bình thường, và một cái chuông "có người vừa đổi ý" không cho họ việc gì để làm.
  for (const slug of new Set(don.listings.map((l) => l.lot.barn.slug))) touchMarket(slug);
  return ok(`Đã huỷ đơn - ${don.listings.length} lô quay lại chợ. Mã cũ không dùng được nữa nhé.`);
}

/**
 * Giỏ đang mở của một người, tạo mới nếu chưa có.
 *
 * Cố ý KHÔNG đặt `@@unique([buyerId, status])`: khoá đó chặn cả những đơn đã `CANCELLED`
 * hay `PAID` trùng cặp, tức chặn nhầm. Rủi ro còn lại là hai tab cùng tạo hai giỏ rỗng -
 * hậu quả duy nhất là một hàng thừa không mang tiền của ai, và lần bấm sau dùng lại giỏ
 * cũ nhất. Đổi lại được sự đơn giản; nếu sau này thấy giỏ mồ côi tích lại thì dọn bằng cron.
 */
async function gioDangMo(userId: string): Promise<{ id: string }> {
  const co = await prisma.marketOrder.findFirst({
    where: { buyerId: userId, status: "OPEN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (co) return co;
  return prisma.marketOrder.create({ data: { buyerId: userId }, select: { id: true } });
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
