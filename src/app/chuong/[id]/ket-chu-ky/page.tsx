export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import EndOfLayChoices from "@/components/EndOfLayChoices";
import { RETIRE_CARE_VND } from "@/data/catalog";
import BarnLocked from "@/components/BarnLocked";
import { canViewBarn, requireUser } from "@/lib/auth";
import { allowedLifecycleChoices } from "@/lib/family-gates";

export default async function EndOfLay({ params }: { params: { id: string } }) {
  await requireUser(`/chuong/${params.id}/ket-chu-ky`);
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: {
      flock: { include: { birds: true } },
      // Giá lứa mới = giá đã chốt lúc nhận chuồng. Tính ở SERVER (§9.6) - màn này chỉ đọc.
      lifecycleRequests: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!barn || !barn.flock) return notFound();
  if (!(await canViewBarn(barn, `/chuong/${params.id}/ket-chu-ky`))) return <BarnLocked slug={barn.slug} />;

  // Cuối chu kỳ áp dụng cho CẢ HAI dòng - chỉ khác cách gọi (xem `lib/flock.stageLabel`).
  // Gà thịt trước đây bị đá về trang chuồng ở đây, tức là hết lứa rồi mà chủ chuồng
  // không bao giờ được hỏi gì (CODEMAP §11.10).
  if (barn.flock.stage !== "END_OF_LAY" && barn.lifecycleRequests.length === 0) redirect(`/chuong/${params.id}`);
  const request = barn.lifecycleRequests[0] ?? null;

  const broiler = barn.flock.productLine === "BROILER";
  const names = barn.flock.birds
    .map((b: { name: string | null }) => b.name)
    .filter((n: string | null): n is string => !!n);

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>
      <span className="eyebrow block mt-2">{broiler ? "Kết lứa" : "Kết chu kỳ đẻ"}</span>
      <h1 className="display text-[24px] mt-1 leading-tight">
        {broiler ? "Cảm ơn một mùa vụ trọn vẹn" : "Cảm ơn một mùa đẻ trọn vẹn"}
      </h1>
      <p className="lede mt-2">
        {barn.label} đã tới mốc xem lại chu kỳ. Bạn gửi yêu cầu; cô chú xác nhận kết quả sau khi thực hiện và gửi minh chứng.
      </p>
      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {names.map((n: string) => (
            <span key={n} className="font-semibold text-[12.5px] rounded-full px-2.5 py-1" style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>🐔 {n}</span>
          ))}
        </div>
      )}

      <EndOfLayChoices
        barnSlug={params.id} retireFeeVnd={RETIRE_CARE_VND} broiler={broiler}
        flockId={barn.flock.id} version={barn.flock.version}
        request={request ? {
          id: request.id, choice: request.choice, status: request.status,
          expectedCount: request.expectedCount, reason: request.reason, createdAt: request.createdAt.toISOString(),
        } : null}
        // Cùng một hàm mà `decideEndOfLay` gọi (§9.36) - một luật, một chỗ. Trang chỉ đọc
        // và kiểm quyền, không ghi (§1.1).
        duocChon={allowedLifecycleChoices({
          productLine: barn.flock.productLine,
          lifecyclePolicy: barn.flock.lifecyclePolicy,
          stage: barn.flock.stage,
        })}
      />
    </div>
  );
}
