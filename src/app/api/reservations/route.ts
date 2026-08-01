import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { workerHasCapacity } from "@/lib/workers";
import { notify, workerUserIdOfBarn } from "@/lib/notify";
import { clampQty, priceBreakdown } from "@/lib/pricing";
import { FLOCK_QTY } from "@/data/catalog";
import type { ProductLine } from "@/data/catalog";

export const dynamic = "force-dynamic";

const LINES: ProductLine[] = ["LAYER", "BROILER"];
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** slug ngắn, đọc được, dùng cho /chuong/{slug} */
const newSlug = () => "chuong-" + Math.random().toString(36).slice(2, 8);

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Dữ liệu gửi lên không hợp lệ."); }

  // Nhận chuồng BẮT BUỘC có tài khoản — chuồng luôn thuộc về một người dùng cụ thể.
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json(
      { error: "Bạn cần đăng nhập để nhận chuồng.", needAuth: true, loginPath: "/dang-nhap?next=%2Fnhan-chuong" },
      { status: 401 },
    );
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
      const prevQty = prev.barn?.flock?.size ?? FLOCK_QTY.default;
      return NextResponse.json({
        ok: true, reservationId: prev.id, barnSlug: prev.barn?.slug ?? null,
        price: priceBreakdown(prev.productLine as ProductLine, prev.feedingPlanSlug, prevQty), reused: true,
      });
    }
  }

  const [breed, plan] = await Promise.all([
    prisma.breed.findUnique({ where: { slug: breedSlug } }),
    prisma.feedingPlan.findUnique({ where: { slug: feedingPlanSlug } }),
  ]);
  if (!breed) return bad("Không tìm thấy giống gà này.");
  if (!plan) return bad("Không tìm thấy chế độ ăn này.");
  if (productLine === "LAYER" && !breed.layer) return bad("Giống này chưa nuôi lấy trứng được.");
  if (productLine === "BROILER" && !breed.broiler) return bad("Giống này chưa nuôi lấy thịt được.");

  // Khu nuôi. Không có zone nghĩa là DB chưa seed.
  const zones = await prisma.zone.findMany({ orderBy: { name: "asc" } });
  if (!zones.length) return bad("Nông trại chưa được khởi tạo. Chạy `npm run db:seed` trước.", 503);

  const isLayer = productLine === "LAYER";
  const zone = zones[isLayer ? 0 : Math.min(1, zones.length - 1)];

  // Sức chứa nông dân kiểm lại NGAY TRƯỚC khi tạo — danh sách client thấy có thể đã cũ.
  const capacity = await workerHasCapacity(workerId);
  if (!capacity.ok) return bad(capacity.reason ?? "Nông dân này không nhận thêm chuồng được.", 409);

  // Tính giá lại phía server theo đúng số con (không tin giá client gửi lên)
  const price = priceBreakdown(productLine, feedingPlanSlug, qty);
  const user = { id: me.id };

  // Gate chống dồn đơn: còn một chuồng chưa hoàn tất cọc thì chưa nhận thêm chuồng mới.
  const pending = await prisma.reservation.findFirst({
    where: { userId: user.id, paymentStatus: { not: "CONFIRMED" }, status: { notIn: ["CANCELLED", "COMPLETED"] } },
    include: { barn: { select: { slug: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    return NextResponse.json({
      error: "Bạn còn một chuồng đang chờ hoàn tất cọc. Xong cọc đó là nhận thêm chuồng mới được ngay.",
      pendingBarnSlug: pending.barn?.slug ?? null,
    }, { status: 409 });
  }

  const label = isLayer ? 'Chuồng "Nhà mình"' : 'Chuồng "Mùa vụ"';
  const size = price.qty;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const barn = await tx.barn.create({
        data: {
          slug: newSlug(), label, zoneId: zone.id, workerId, ownerId: user.id,
          flock: {
            create: {
              productLine, breedId: breed.id, feedingPlanId: plan.id,
              stage: "BROODING", size, cycleDays: isLayer ? 300 : 75,
              birds: {
                create: Array.from({ length: size }, (_, i) => ({
                  tagCode: `${isLayer ? "L" : "B"}-${String(i + 1).padStart(2, "0")}`,
                  name: isLayer ? (henNames[i] ?? null) : null,
                })),
              },
              ...(isLayer ? { products: { create: [{ type: "EGG" as const, qty: 0 }] } } : {}),
            },
          },
        },
      });

      await tx.farmUpdate.create({
        data: {
          barnId: barn.id, workerId, kind: "MILESTONE",
          text: `Đã nhận chuồng cho bạn. Mình sẽ úm đàn ${breed.name} và gửi ảnh cập nhật mỗi ngày nhé 🐣`,
        },
      });

      // Việc đầu tiên trong hộp việc của nông dân: ra chuồng chụp hiện trạng ban đầu.
      await tx.barnTask.create({
        data: {
          barnId: barn.id, workerId, requestedById: user.id, kind: "CHECK",
          title: "Chụp hiện trạng chuồng lúc nhận",
          note: `Chủ chuồng vừa nhận nuôi ${size} ${isLayer ? "mái" : "con"} ${breed.name}. Gửi giúp tấm ảnh đầu tiên nhé.`,
        },
      });

      const reservation = await tx.reservation.create({
        data: {
          userId: user.id, barnId: barn.id, productLine, breedSlug, feedingPlanSlug,
          henNames, healthPlanOptIn, priceEstimateVnd: price.total, depositVnd: 50000,
          status: "HELD", idemKey,
        },
      });

      return { reservation, barn };
    });

    // Nông dân biết ngay mình vừa được giao thêm một chuồng + việc đầu tiên.
    await notify({
      userId: await workerUserIdOfBarn(result.barn.id),
      kind: "BARN_ASSIGNED",
      title: `🏡 Bạn được giao ${result.barn.label}`,
      body: `${size} ${isLayer ? "mái" : "con"} ${breed.name} · việc đầu tiên: chụp hiện trạng chuồng lúc nhận.`,
      href: `/nong-trai/chuong/${result.barn.slug}`,
    });

    return NextResponse.json({
      ok: true, reservationId: result.reservation.id, barnSlug: result.barn.slug, price,
    });
  } catch (e) {
    // Hai request cùng idemKey chạy song song → request thua cuộc đọc lại đơn đã tạo.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && idemKey) {
      const prev = await prisma.reservation.findUnique({
      where: { idemKey },
      include: { barn: { include: { flock: { select: { size: true } } } } },
    });
      if (prev) {
        return NextResponse.json({
          ok: true, reservationId: prev.id, barnSlug: prev.barn?.slug ?? null, price, reused: true,
        });
      }
    }
    console.error("[reservations] tạo đơn thất bại", e);
    return bad("Không tạo được đơn giữ chỗ. Thử lại giúp mình nhé.", 500);
  }
}
