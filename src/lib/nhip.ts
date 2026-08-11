// HÀNG RÀO TẦN SUẤT - phần chạm DB (§11.50). Phần thuần nằm ở `lib/nhip-meta.ts`.
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import {
  NHIP, cauChoDoi, conLaiNhip, ipTuHeader, vuotNguong, type TenNhip,
} from "@/lib/nhip-meta";

type DongDem = { count: number; windowAt: Date };

/**
 * Tăng bộ đếm của một ngăn rồi trả về trạng thái sau khi tăng.
 *
 * ⚠️ **Một câu lệnh duy nhất, không phải đọc-rồi-ghi.** Kẻ dò mật khẩu không bắn tuần tự
 * - họ bắn 200 lượt song song. Viết kiểu "đọc bộ đếm, thấy còn dưới ngưỡng, rồi ghi tăng"
 * thì cả 200 lượt cùng đọc được số cũ và cùng đi lọt: hàng rào có mặt trong mã nguồn, có
 * trong bộ kiểm, và **không chặn được gì** trong đúng tình huống nó sinh ra để chặn. Nên
 * phép cộng và phép so nằm chung một câu `INSERT … ON CONFLICT DO UPDATE`, để Postgres
 * khoá dòng đó và xếp hàng giúp.
 *
 * Cửa sổ **cố định**: hết giờ thì bộ đếm về 1 (chính lượt đang xét), không phải cửa sổ
 * trượt. Đơn giản hơn, và ở quy mô này chênh lệch không đáng kể.
 */
async function dem(ten: TenNhip, khoa: string): Promise<DongDem | null> {
  const now = new Date();
  const moc = new Date(now.getTime() - NHIP[ten].phut * 60_000);
  try {
    const rows = await prisma.$queryRaw<DongDem[]>`
      INSERT INTO "RateLimit" ("id", "bucket", "key", "count", "windowAt")
      VALUES (${randomUUID()}, ${ten}, ${khoa}, 1, ${now})
      ON CONFLICT ("bucket", "key") DO UPDATE SET
        "count"    = CASE WHEN "RateLimit"."windowAt" <= ${moc} THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowAt" = CASE WHEN "RateLimit"."windowAt" <= ${moc} THEN ${now} ELSE "RateLimit"."windowAt" END
      RETURNING "count", "windowAt"`;
    return rows[0] ?? null;
  } catch (e) {
    // ⚠️ **HỎNG THÌ MỞ CỬA, không đóng.** Bàn cân: đóng nghĩa là một bảng đếm trục trặc
    // (chưa `db push`, chưa có chỉ mục) làm **cả đường đăng ký và đăng nhập chết đứng** -
    // hàng rào phụ giết mất cửa chính. Mở nghĩa là mất hàng rào trong lúc trục trặc, mà
    // trục trặc đó thì đằng nào cũng phải sửa.
    //
    // Đổi lại phải KÊU TO: một hàng rào hỏng mà im lặng là đúng thứ §11.47 đã dạy - chết
    // câm hai đợt, mọi phép kiểm vẫn xanh.
    console.error("[nhip] KHÔNG đếm được - hàng rào tần suất đang MỞ cho ngăn", ten, e);
    return null;
  }
}

/** Địa chỉ mạng của người đang gọi. `null` = không xác định được (xem `chanNhip`). */
export function ipHienTai(): string | null {
  try {
    const h = headers();
    return ipTuHeader({
      vercel: h.get("x-vercel-forwarded-for"),
      real: h.get("x-real-ip"),
      forwarded: h.get("x-forwarded-for"),
    });
  } catch {
    return null;
  }
}

/**
 * Đếm một lượt gọi vào **nhiều ngăn cùng lúc**; trả về câu chặn đầu tiên, hoặc `null` nếu
 * cho đi. Cùng hình dạng với `messages.sendingBlocked` để đọc quen mắt.
 *
 * ⚠️ **Khoá `null` thì BỎ QUA ngăn đó, không gộp thành một khoá chung.** Cám dỗ là viết
 * `khoa ?? "khong-ro"` cho gọn. Làm thế thì mọi người mà hệ thống không đọc được địa chỉ
 * mạng sẽ **dùng chung một bộ đếm**, và chỉ cần đủ người là tất cả cùng bị chặn - một lỗi
 * chặn nhầm người thật, tệ hơn nhiều so với việc bỏ lọt vài lượt. Ngăn theo email / theo
 * tên đăng nhập vẫn còn đó và vẫn đếm.
 *
 * Mọi ngăn đều được đếm (chạy song song) chứ không dừng ở ngăn chặn đầu tiên: một lượt gọi
 * đã xảy ra thì phải hiện ra ở mọi bộ đếm đang theo dõi nó.
 */
export async function chanNhip(cac: Array<[TenNhip, string | null]>): Promise<string | null> {
  const dung = cac.filter((c): c is [TenNhip, string] => !!c[1]);
  if (dung.length === 0) return null;

  const kq = await Promise.all(
    dung.map(async ([ten, khoa]) => ({ ten, dong: await dem(ten, khoa) })),
  );
  for (const { ten, dong } of kq) {
    if (dong && vuotNguong(ten, dong.count)) return cauChoDoi(conLaiNhip(ten, dong.windowAt));
  }
  return null;
}

/**
 * Xoá bộ đếm của những ngăn này - gọi khi việc đã **thành công**.
 *
 * Chỉ dùng cho đăng nhập, và đó là lý do `chanNhip` được phép đếm mọi lượt mà không cần
 * biết đúng hay sai mật khẩu: người gõ đúng thì bộ đếm bị xoá ngay, nên **không ai tự khoá
 * mình bằng những lần đăng nhập thành công của chính mình**. Kẻ dò mật khẩu thì không có
 * lần thành công nào để mà xoá.
 *
 * KHÔNG dùng cho gửi mã / tra tên: ở hai chỗ đó "thành công" chính là lúc tiền đã tiêu.
 */
export async function xoaNhip(cac: Array<[TenNhip, string | null]>): Promise<void> {
  const dung = cac.filter((c): c is [TenNhip, string] => !!c[1]);
  if (dung.length === 0) return;
  try {
    await prisma.rateLimit.deleteMany({
      where: { OR: dung.map(([bucket, key]) => ({ bucket, key })) },
    });
  } catch (e) {
    console.error("[nhip] không xoá được bộ đếm", e);
  }
}
