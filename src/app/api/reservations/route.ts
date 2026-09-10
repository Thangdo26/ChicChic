import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { workerHasCapacity } from "@/lib/workers";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { track } from "@/lib/track";
import { clampQty, priceBreakdown } from "@/lib/pricing";
import { cleanLine, defaultBarnName, newPayCode, MAX_BARN_NAME } from "@/lib/decor";
import { cachedBreed, cachedFeedingPlan, cachedZones } from "@/lib/cache";
import { FLOCK_QTY, HEALTH_PACKAGE } from "@/data/catalog";
import type { ProductLine } from "@/data/catalog";

export const dynamic = "force-dynamic";

class ReservationConflict extends Error {}

const LINES: ProductLine[] = ["LAYER", "BROILER"];
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** slug ngắn, đọc được, dùng cho /chuong/{slug} */
const newSlug = () => "chuong-" + Math.random().toString(36).slice(2, 8);

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Dữ liệu gửi lên không hợp lệ."); }

  // Nhận chuồng BẮT BUỘC có tài khoản - chuồng luôn thuộc về một người dùng cụ thể.
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập để nhận chuồng.", needAuth: true, loginPath: "/dang-nhap?next=%2Fnhan-chuong" },
      { status: 401 },
    );
  }

  // Nông dân không nhận nuôi chuồng. Đây là cổng THẬT của luật đó - /nhan-chuong chỉ
  // đá cô chú đi cho gọn màn hình, còn API này mới là chỗ ghi Barn+Reservation.
  // Để hở thì một tài khoản WORKER có thể tự đặt chuồng rồi tự nhận luôn phần công.
  if (me.role === "WORKER") {
    return bad("Tài khoản nông dân không nhận nuôi chuồng - cổng của cô/chú là hộp việc ở /nong-trai.", 403);
  }

  const workerId = String(body.workerId ?? "");
  const productLine = String(body.productLine ?? "") as ProductLine;
  const breedSlug = String(body.breedSlug ?? "");
  const feedingPlanSlug = String(body.feedingPlanSlug ?? "");
  const healthPlanOptIn = !!body.healthPlanOptIn;
  const idemKey = body.idemKey ? String(body.idemKey).slice(0, 64) : null;

  const henNames = (Array.isArray(body.henNames) ? body.henNames : [])
    .map((n) => String(n).trim().slice(0, 14))
    .filter(Boolean)
    .slice(0, FLOCK_QTY.max);

  if (!LINES.includes(productLine)) return bad("Kiểu nuôi không hợp lệ.");
  if (!workerId) return bad("Chọn giúp mình nông dân sẽ chăm chuồng này nhé.");

  // Số con: ép về khoảng cho phép và không bao giờ ít hơn số tên đã đặt.
  const qty = Math.max(clampQty(body.qty ?? FLOCK_QTY.default), henNames.length || FLOCK_QTY.min);

  // Trả lại đúng đơn cũ nếu client gửi lại cùng idemKey (bấm 2 lần / mạng chập chờn).
  if (idemKey) {
    const prev = await prisma.reservation.findUnique({
      where: { idemKey },
      include: { barn: { include: { flock: { select: { size: true } } } } },
    });
    if (prev) {
      if (prev.userId !== me.id) return bad("Khóa yêu cầu đã được sử dụng. Tải lại trang để nhận chuồng.", 409);
      const prevQty = prev.barn?.flock?.size ?? FLOCK_QTY.default;
      return NextResponse.json({
        ok: true, reservationId: prev.id, barnSlug: prev.barn?.slug ?? null,
        price: priceBreakdown(prev.productLine as ProductLine, prev.feedingPlanSlug, prevQty), reused: true,
      });
    }
  }

  const isLayer = productLine === "LAYER";
  const user = { id: me.id };

  // BỐN truy vấn độc lập nhau → chạy song song. Trước đây chúng nối tiếp: giống → cám
  // → zone → sức chứa → đơn treo, tức ~5 lượt đi–về Mumbai (~6,5s) xếp hàng một hàng
  // dọc ngay ở bước quan trọng nhất của phễu tiền. Giống/cám/zone lấy từ cache danh
  // mục nên phần lớn lượt còn không chạm DB.
  const [breed, plan, zones, capacity, pending] = await Promise.all([
    cachedBreed(breedSlug),
    cachedFeedingPlan(feedingPlanSlug),
    cachedZones(),
    // Sức chứa vẫn đọc DB THẬT (không cache): danh sách client thấy có thể đã cũ, và
    // đây là ràng buộc "một nông dân tối đa maxBarns chuồng" - sai là cô chú vỡ tải.
    workerHasCapacity(workerId),
    // Gate chống dồn đơn: còn một chuồng chưa hoàn tất cọc thì chưa nhận thêm.
    prisma.reservation.findFirst({
      where: { userId: user.id, paymentStatus: { not: "CONFIRMED" }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
      select: { barn: { select: { slug: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!breed) return bad("Không tìm thấy giống gà này.");
  if (!plan) return bad("Không tìm thấy chế độ ăn này.");
  if (productLine === "LAYER" && !breed.layer) return bad("Giống này chưa nuôi lấy trứng được.");
  if (productLine === "BROILER" && !breed.broiler) return bad("Giống này chưa nuôi lấy thịt được.");
  // Không có zone nghĩa là DB chưa seed.
  if (!zones.length) return bad("Nông trại chưa được khởi tạo. Chạy `npm run db:seed` trước.", 503);
  if (!capacity.ok) return bad(capacity.reason ?? "Nông dân này không nhận thêm chuồng được.", 409);
  if (pending) {
    return NextResponse.json({
      error: "Bạn còn một chuồng đang chờ hoàn tất cọc. Xong cọc đó là nhận thêm chuồng mới được ngay.",
      pendingBarnSlug: pending.barn?.slug ?? null,
    }, { status: 409 });
  }

  const zone = zones[isLayer ? 0 : Math.min(1, zones.length - 1)];

  // Tính giá lại phía server theo đúng số con (không tin giá client gửi lên)
  const price = priceBreakdown(productLine, feedingPlanSlug, qty);
  // Gói "An tâm" là khoản trả trước tuỳ chọn, cộng ngoài 3 phần của giá nuôi.
  const healthVnd = healthPlanOptIn ? HEALTH_PACKAGE.priceVnd : 0;

  // Tên chuồng do chủ chuồng tự đặt. Làm sạch ở server (§9.6) - bỏ ký tự vô hình,
  // gộp khoảng trắng, cắt đúng ký tự thật để emoji không bị vỡ đôi. Bỏ trống thì
  // dùng tên mặc định; đổi lại sau bằng `actions.renameBarn`.
  const label = cleanLine(body.barnName, MAX_BARN_NAME) || defaultBarnName(isLayer);
  const size = price.qty;

  try {
    // Transaction này ghi barn + flock + N con gà + nhật ký + việc đầu tiên + đơn giữ
    // chỗ, tức hàng chục câu lệnh NỐI TIẾP nhau tới một DB cách ~1,3s (CODEMAP §10).
    // Mặc định của Prisma là 5s và nó ĐÃ vượt trong thực tế: P2028 "Transaction not
    // found", request trả 500 và người dùng mất chuồng ngay ở bước trả tiền.
    // Nới trần cho đúng khoảng cách thật - đây không phải che lỗi, mà là thừa nhận
    // độ trễ. Rút ngắn thật sự thì phải chuyển DB sang ap-southeast-1.
    const result = await prisma.$transaction(async (tx) => {
      // Cùng khóa sức chứa với bàn giao; khóa người dùng để chặn nhiều đơn cọc treo.
      await tx.$queryRaw`SELECT id FROM "FarmWorker" WHERE id = ${workerId} FOR UPDATE`;
      await tx.user.updateMany({ where: { id: user.id }, data: { id: user.id } });
      if (idemKey && await tx.reservation.findUnique({ where: { idemKey } })) throw new ReservationConflict("REUSED");
      const worker = await tx.farmWorker.findUnique({ where: { id: workerId } });
      if (!worker?.active || await tx.barn.count({ where: { workerId, ownerId: { not: null } } }) >= worker.maxBarns) throw new ReservationConflict("Nông dân vừa kín chỗ hoặc tạm nghỉ. Chọn lại người chăm nhé.");
      if (await tx.reservation.count({ where: { userId: user.id, paymentStatus: { not: "CONFIRMED" }, status: { notIn: ["CANCELLED", "COMPLETED"] } } })) throw new ReservationConflict("Bạn còn chuồng đang chờ cọc. Hoàn tất chuồng đó trước nhé.");
      const barn = await tx.barn.create({
        data: {
          slug: newSlug(), label, zoneId: zone.id, workerId, ownerId: user.id,
          flock: {
            create: {
              productLine, breedId: breed.id, feedingPlanId: plan.id,
              stage: "BROODING", size, cycleDays: isLayer ? 300 : 75,
            },
          },
        },
        select: { id: true, slug: true, label: true, flock: { select: { id: true } } },
      });
      const flockId = barn.flock!.id;

      // `createMany` cho đàn gà: MỘT câu lệnh cho cả 5–20 con, thay vì `create` lồng
      // nhau (Prisma phát một INSERT cho mỗi con). Với DB cách ~1,3s thì đó là chênh
      // lệch hàng chục giây ngay tại bước người dùng vừa bấm "nhận chuồng".
      await tx.bird.createMany({
        data: Array.from({ length: size }, (_, i) => ({
          flockId,
          tagCode: `${isLayer ? "L" : "B"}-${String(i + 1).padStart(2, "0")}`,
          name: isLayer ? (henNames[i] ?? null) : null,
        })),
      });

      // Ba bản ghi còn lại độc lập nhau và đều chỉ cần `barn.id`.
      // ⚠️ `Promise.all` ở ĐÂY KHÔNG song song hoá được: một transaction tương tác của
      // Prisma chạy trên MỘT kết nối, nên các câu lệnh vẫn nối tiếp. Giữ hình thức này
      // chỉ để đọc gọn - muốn nhanh thật thì phải bớt số câu lệnh (đó là lý do đàn gà
      // dùng `createMany`), hoặc dời DB về gần hơn (CODEMAP §10).
      const [, , , reservation] = await Promise.all([
        isLayer
          ? tx.product.create({ data: { flockId, type: "EGG", qty: 0 } })
          : Promise.resolve(null),
        tx.farmUpdate.create({
          data: {
            barnId: barn.id, workerId, kind: "MILESTONE",
            text: `Đã nhận chuồng cho bạn. Mình sẽ úm đàn ${breed.name} và gửi ảnh cập nhật mỗi ngày nhé 🐣`,
          },
        }),
        // Việc đầu tiên trong hộp việc của nông dân: ra chuồng chụp hiện trạng ban đầu.
        tx.barnTask.create({
          data: {
            barnId: barn.id, workerId, requestedById: user.id, kind: "CHECK",
            title: "Chụp hiện trạng chuồng lúc nhận",
            note: `Chủ chuồng vừa nhận nuôi ${size} ${isLayer ? "mái" : "con"} ${breed.name}. Gửi giúp tấm ảnh đầu tiên nhé.`,
          },
        }),
        tx.reservation.create({
          data: {
            userId: user.id, barnId: barn.id, productLine, breedSlug, feedingPlanSlug,
            henNames, healthPlanOptIn, priceEstimateVnd: price.total + healthVnd, depositVnd: 50000,
            // Mã ngẫu nhiên, cột unique. Trùng thì DB ném P2002 và người dùng bấm lại -
            // xác suất ~1/887 triệu nên không đáng thêm một lượt truy vấn để kiểm trước.
            status: "HELD", idemKey, payCode: newPayCode("COC"),
          },
        }),
      ]);

      return { reservation, barn };
    }, { timeout: 30_000, maxWait: 15_000 });

    // Mẫu số của "conversion xem → trả tiền thật" (playbook §7.3 chỉ số 1).
    await track("barn_reserved", {
      userId: user.id, barnSlug: result.barn.slug,
      props: {
        productLine, breedSlug, feedingPlanSlug, qty: size,
        priceEstimateVnd: price.total + healthVnd,
        healthPlanOptIn,
        namedHens: henNames.length,
      },
    });

    // Nông dân biết ngay mình vừa được giao thêm một chuồng + việc đầu tiên.
    await notify({
      userId: await workerUserIdOfBarn(result.barn.id),
      kind: "BARN_ASSIGNED",
      title: `🏡 Bạn được giao chuồng "${result.barn.label}"`,
      body: `${size} ${isLayer ? "mái" : "con"} ${breed.name} · việc đầu tiên: chụp hiện trạng chuồng lúc nhận.`,
      href: `/nong-trai/chuong/${result.barn.slug}`,
    });

    return NextResponse.json({
      ok: true, reservationId: result.reservation.id, barnSlug: result.barn.slug, price,
    });
  } catch (e) {
    // Hai request cùng idemKey chạy song song → request thua cuộc đọc lại đơn đã tạo.
    if (((e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") || (e instanceof ReservationConflict && e.message === "REUSED")) && idemKey) {
      const prev = await prisma.reservation.findUnique({
      where: { idemKey },
      include: { barn: { include: { flock: { select: { size: true } } } } },
    });
      if (prev) {
      if (prev.userId !== me.id) return bad("Khóa yêu cầu đã được sử dụng. Tải lại trang để nhận chuồng.", 409);
        return NextResponse.json({
          ok: true, reservationId: prev.id, barnSlug: prev.barn?.slug ?? null, price, reused: true,
        });
      }
    }
    if (e instanceof ReservationConflict) return bad(e.message, 409);
    console.error("[reservations] tạo đơn thất bại", e);
    return bad("Không tạo được đơn giữ chỗ. Thử lại giúp mình nhé.", 500);
  }
}
