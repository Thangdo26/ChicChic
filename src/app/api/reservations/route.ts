import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { priceBreakdown } from "@/lib/pricing";
import type { ProductLine } from "@/data/catalog";

export async function POST(req: Request) {
  const body = await req.json();
  const { email, name, productLine, breedSlug, feedingPlanSlug, henNames, healthPlanOptIn } = body ?? {};

  if (!email || !productLine || !breedSlug || !feedingPlanSlug) {
    return NextResponse.json({ error: "Thiếu thông tin bắt buộc." }, { status: 400 });
  }

  // Tính giá lại phía server (không tin client)
  const price = priceBreakdown(productLine as ProductLine, feedingPlanSlug);

  const user = await prisma.user.upsert({
    where: { email }, update: { name: name ?? undefined },
    create: { email, name: name ?? null },
  });

  const reservation = await prisma.reservation.create({
    data: {
      userId: user.id,
      productLine,
      breedSlug,
      feedingPlanSlug,
      henNames: Array.isArray(henNames) ? henNames : [],
      healthPlanOptIn: !!healthPlanOptIn,
      priceEstimateVnd: price.total,
      depositVnd: 50000,
      status: "HELD",
    },
  });

  return NextResponse.json({ ok: true, reservationId: reservation.id, price });
}
