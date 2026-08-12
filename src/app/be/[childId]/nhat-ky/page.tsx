export const dynamic = "force-dynamic";
// KHU CỦA BÉ - nhật ký những điều đã học (spec §15.1, Epic 5).
//
// ⚠️ **Không cuộn vô tận** (§8.3): trần cứng `SO_TRANG`, hết là hết. Một danh sách không đáy
// trên màn hình của trẻ là đúng cơ chế spec cấm - và ở đây nó cũng không cần thiết, vì bài
// sinh theo mốc chứ không theo nhịp.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { moKhuCuaBe } from "@/lib/bai-hoc";

const SO_TRANG = 30;

export default async function NhatKy({ params }: { params: { childId: string } }) {
  const me = await requireUser(`/be/${params.childId}/nhat-ky`);
  const be = await moKhuCuaBe(me.id, params.childId);
  if (!be) notFound();

  const ds = await prisma.learningMoment.findMany({
    where: { childId: be.id, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take: SO_TRANG,
    select: { id: true, contentSnapshot: true, completedAt: true, missionDoneAt: true },
  });

  const ten = (c: unknown) => (c as { title?: string } | null)?.title ?? "Một điều mới";

  return (
    <div className="screen">
      <Link href={`/be/${be.id}`} className="text-[13px] no-underline"
        style={{ color: "var(--ink-soft)" }}>
        ‹ Về trang của {be.nickname}
      </Link>
      <h1 className="display text-[21px] mt-1.5">📔 Những điều mình đã học</h1>

      {ds.length === 0 ? (
        <p className="text-[14px] mt-3 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Mình chưa xem xong điều nào. Khi làm xong một điều, nó sẽ nằm ở đây để mình xem lại
          bất cứ lúc nào.
        </p>
      ) : (
        <div className="grid gap-2 mt-3.5">
          {ds.map((b) => (
            <Link key={b.id} href={`/be/${be.id}/khoanh-khac/${b.id}`}
              className="card flex items-center gap-2.5 no-underline">
              <span className="text-[24px]" aria-hidden>{b.missionDoneAt ? "💚" : "✅"}</span>
              <div className="min-w-0">
                <div className="text-[14.5px] font-semibold">{ten(b.contentSnapshot)}</div>
                <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                  {b.completedAt?.toLocaleDateString("vi-VN") ?? ""}
                  {b.missionDoneAt && " · cả nhà đã cùng làm"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
