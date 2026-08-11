// HOÁ ĐƠN TIỀN NUÔI - phần chạm DB.
//
// Không có `"use server"` (giống `payments.ts`, `task-store.ts`): file này **không tự
// kiểm quyền**, chỗ gọi phải kiểm. Nó được gọi từ ba nơi - server action của chủ chuồng,
// việc nền hằng ngày, và trang chuồng (chỉ đọc).
import { prisma } from "@/lib/db";
import { newPayCode } from "@/lib/decor";
import {
  hanChot, hoaDonLabel, kyConThieu, kyHoaDon, phatHanhLuc, tienPhaiTra,
} from "@/lib/billing";

/** Đàn ở những giai đoạn này thì NGỪNG phát hoá đơn mới - không còn gì để nuôi nữa. */
const KHONG_PHAT_NUA = new Set(["END_OF_LAY", "HARVESTED", "RETIRED"]);

export type BarnBilling = {
  barnId: string;
  slug: string;
  ownerId: string | null;
  /**
   * Chuồng trưng bày - KHÔNG bao giờ phát hoá đơn.
   *
   * Phát hiện lúc chạy thử đợt 9: cron đã dựng **4 kỳ tiền nuôi cho `demo`** và một kỳ
   * cho `demo-thit`, kỳ sớm nhất quá hạn từ tháng 5 ⟹ chuồng mẫu của chính nông trại
   * bị khoá vì "nợ tiền nuôi". Không ai đi trả tiền cho chuồng mẫu cả, nên khoản nợ đó
   * chỉ có thể lớn dần và chuồng đó không bao giờ mở lại được.
   *
   * Đáng chú ý hơn từ đợt 9: chuồng trưng bày nay là thứ **khách vãng lai nhìn thấy
   * đầu tiên** (§9.5 đã nới). Một cửa hàng mẫu treo biển "đang nợ tiền" là ấn tượng
   * đầu tiên tệ nhất có thể có.
   */
  isPublic: boolean;
  productLine: string;
  cycleDays: number;
  /**
   * Mốc tính tiền của **lứa đang nuôi**: `Barn.billingFrom` nếu chuồng đã qua ít nhất một
   * lứa mới, không thì là lúc cọc được xác nhận. Chưa cọc thì `null`.
   */
  moc: Date | null;
  /**
   * Đã phát bao nhiêu hoá đơn TRƯỚC lứa này (`Barn.billingSeqBase`).
   *
   * Tách `seq` (số thứ tự toàn cuộc đời chuồng, giữ khoá `@@unique([barnId, seq])`) khỏi
   * **thứ tự kỳ trong lứa** (thứ dùng để tính ngày). Lứa đầu thì hai số bằng nhau.
   */
  seqBase: number;
  stage: string;
  grossVnd: number;
  depositVnd: number;
};

/** Gom mọi thứ cần để tính hoá đơn của một chuồng, trong MỘT truy vấn. */
export async function billingCuaChuong(slug: string): Promise<BarnBilling | null> {
  const b = await prisma.barn.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, ownerId: true, isPublic: true,
      billingFrom: true, billingSeqBase: true,
      flock: { select: { productLine: true, cycleDays: true, stage: true } },
      reservation: {
        select: { paymentStatus: true, paidAt: true, priceEstimateVnd: true, depositVnd: true },
      },
    },
  });
  if (!b?.flock) return null;
  const r = b.reservation;
  // CHỈ tính từ lúc cọc đã được XÁC NHẬN. Chuồng chưa kích hoạt thì chưa nợ tiền nuôi.
  const daKichHoat = r?.paymentStatus === "CONFIRMED";
  return {
    barnId: b.id, slug: b.slug, ownerId: b.ownerId, isPublic: b.isPublic,
    productLine: b.flock.productLine, cycleDays: b.flock.cycleDays, stage: b.flock.stage,
    // Lứa mới đặt lại mốc; chuồng chưa qua lứa nào thì `billingFrom` là `null` và mọi
    // thứ chạy y như trước khi có cột này.
    moc: daKichHoat ? (b.billingFrom ?? r!.paidAt) : null,
    seqBase: b.billingSeqBase,
    grossVnd: r?.priceEstimateVnd ?? 0,
    depositVnd: r?.depositVnd ?? 0,
  };
}

/**
 * Sinh những hoá đơn còn thiếu cho một chuồng. **Idempotent** - gọi bao nhiêu lần cũng thế.
 *
 * Chống trùng dựa vào `@@unique([barnId, seq])` chứ **không** dựa vào "đếm rồi tạo": hàm
 * này chạy lúc người dùng mở trang, mà người dùng thì mở hai tab cùng lúc, và việc nền
 * cũng gọi nó. Đếm-rồi-tạo là để hở đúng khe giữa hai câu lệnh, và hậu quả là hai hoá đơn
 * cho cùng một tháng - tức đòi tiền hai lần.
 *
 * `skipDuplicates` biến cuộc đua thành vô hại: kẻ thua chỉ đơn giản không ghi được gì.
 */
export async function ensureInvoices(b: BarnBilling, bayGio = new Date()): Promise<number> {
  if (!b.moc || !b.ownerId) return 0;
  // Chuồng trưng bày không nợ ai đồng nào - xem chú thích của `isPublic` ở trên.
  if (b.isPublic) return 0;
  if (KHONG_PHAT_NUA.has(b.stage)) return 0;
  if (b.grossVnd <= 0) return 0;

  const daCo = await prisma.barnInvoice.findMany({
    where: { barnId: b.barnId },
    select: { seq: true },
  });
  // Phép tính nằm trọn ở `lib/billing.kyConThieu` (thuần, có bộ kiểm phủ). Ở đây chỉ đọc
  // DB rồi ghi DB.
  const thieu = kyConThieu(b.productLine, b.moc, b.seqBase, daCo.map((r) => r.seq), bayGio);
  if (thieu.length === 0) return 0;

  const rows = thieu.map(({ kySo, seq }) => {
    const ky = kyHoaDon(b.productLine, kySo, b.moc!, b.cycleDays);
    // Cọc CHỈ trừ vào hoá đơn ĐẦU TIÊN của cả chuồng - không phải kỳ đầu của mỗi lứa.
    // Trừ lại mỗi lứa nghĩa là tặng 50.000đ cho mỗi lần bấm "nuôi lứa mới".
    const creditVnd = seq === 1 ? b.depositVnd : 0;
    return {
      barnId: b.barnId, userId: b.ownerId!, seq,
      periodFrom: ky.from, periodTo: ky.to,
      grossVnd: b.grossVnd, creditVnd,
      totalVnd: tienPhaiTra(b.grossVnd, creditVnd),
      payCode: newPayCode("INVOICE"),
      // Hạn tính từ lúc ĐÁNG LẼ phát hành, không phải từ bây giờ: chuồng bỏ quên ba
      // tháng thì ba hoá đơn cũ phải quá hạn ngay, chứ không được reset hạn về hôm nay.
      dueAt: hanChot(phatHanhLuc(b.productLine, kySo, b.moc!)),
    };
  });

  const { count } = await prisma.barnInvoice.createMany({ data: rows, skipDuplicates: true });
  return count;
}

/**
 * Hoá đơn **quá hạn** cũ nhất của chuồng - thứ quyết định chuồng có bị khoá hay không.
 *
 * Trả `null` nghĩa là không khoá. Đọc trực tiếp từ DB thay vì tin một cột `locked` nào đó:
 * trạng thái khoá phải luôn suy được từ hoá đơn, nếu không sẽ có ngày tiền đã về mà chuồng
 * vẫn khoá vì quên cập nhật cột.
 */
export async function hoaDonQuaHan(barnId: string, bayGio = new Date()) {
  return prisma.barnInvoice.findFirst({
    where: { barnId, paymentStatus: { not: "CONFIRMED" }, dueAt: { lt: bayGio } },
    orderBy: { seq: "asc" },
    select: {
      id: true, seq: true, totalVnd: true, payCode: true, dueAt: true,
      paymentStatus: true, periodFrom: true, periodTo: true,
    },
  });
}

/**
 * Chuồng có đang bị khoá vì tiền không.
 *
 * ⚠️ §9.33 - "khoá" ở đây **chỉ là khoá trong app**. Đàn gà vẫn được nông dân cho ăn,
 * vẫn được chăm bình thường. Đừng bao giờ nối hàm này vào bất cứ thứ gì đụng tới
 * `Flock`/`Bird`, và đừng dùng nó để chặn việc của nông dân.
 */
export const chuongBiKhoa = async (barnId: string) => !!(await hoaDonQuaHan(barnId));

/** Câu ngắn cho nhật ký / thông báo. */
export const invoiceTen = (productLine: string, seq: number) => hoaDonLabel(productLine, seq);
