export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import EndOfLayChoices from "@/components/EndOfLayChoices";
import { RETIRE_CARE_VND } from "@/data/catalog";
import BarnLocked from "@/components/BarnLocked";
import { canViewBarn, requireUser } from "@/lib/auth";

export default async function EndOfLay({ params }: { params: { id: string } }) {
  await requireUser(`/chuong/${params.id}/ket-chu-ky`);
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    include: { flock: { include: { birds: true } } },
  });
  if (!barn || !barn.flock) return notFound();
  if (!(await canViewBarn(barn, `/chuong/${params.id}/ket-chu-ky`))) return <BarnLocked slug={barn.slug} />;

  // Cuối chu kỳ áp dụng cho CẢ HAI dòng — chỉ khác cách gọi (xem `lib/flock.stageLabel`).
  // Gà thịt trước đây bị đá về trang chuồng ở đây, tức là hết lứa rồi mà chủ chuồng
  // không bao giờ được hỏi gì (CODEMAP §11.10).
  if (barn.flock.stage !== "END_OF_LAY") redirect(`/chuong/${params.id}`);

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
        {barn.label} đã {broiler ? "tới ngày xuất chuồng" : "hoàn thành chu kỳ đẻ của mình"}. Đây là lúc bạn chọn hướng đi tiếp — tùy điều bạn thấy phù hợp.
      </p>
      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {names.map((n: string) => (
            <span key={n} className="font-semibold text-[12.5px] rounded-full px-2.5 py-1" style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>🐔 {n}</span>
          ))}
        </div>
      )}

      <EndOfLayChoices barnSlug={params.id} retireFeeVnd={RETIRE_CARE_VND} broiler={broiler} />
    </div>
  );
}
