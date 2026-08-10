export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireWorker } from "@/lib/auth";
import { workerLoad } from "@/lib/workers";
import WorkerProfileForm from "@/components/WorkerProfileForm";

/** Hồ sơ cá nhân của chính cô/chú đang đăng nhập - sửa được, khách xem được. */
export default async function WorkerProfilePage() {
  const w = await requireWorker("/nong-trai/ho-so");

  const [me, load] = await Promise.all([
    prisma.farmWorker.findUnique({
      where: { id: w.workerId },
      select: {
        id: true, name: true, area: true, bio: true, birthYear: true, yearsExp: true,
        consentMedia: true, maxBarns: true, active: true,
        introMedia: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, type: true, url: true, posterUrl: true, caption: true, createdAt: true },
        },
      },
    }),
    workerLoad(w.workerId),
  ]);
  if (!me) return notFound();

  return (
    <div className="screen">
      <Link href="/nong-trai" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Hộp việc</Link>
      <span className="eyebrow block mt-2">Cổng nông dân</span>
      <h1 className="display text-[21px] mt-1 mb-1.5">Hồ sơ của tôi</h1>
      <p className="lede mb-3.5">
        Khách sắp nhận nuôi chuồng sẽ bấm xem hồ sơ này để chọn người chăm. Điền thật, viết mộc -
        đó là thứ làm người ta tin.
      </p>

      <WorkerProfileForm
        profile={{
          id: me.id, name: me.name, area: me.area, bio: me.bio, birthYear: me.birthYear,
          yearsExp: me.yearsExp, consentMedia: me.consentMedia, maxBarns: me.maxBarns,
          active: me.active, load,
          intro: me.introMedia.map((m) => ({
            id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
            durationSec: null, capturedAt: m.createdAt.toISOString(), workerName: me.name,
          })),
        }}
      />
    </div>
  );
}
