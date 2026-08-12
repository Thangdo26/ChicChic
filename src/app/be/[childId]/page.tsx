export const dynamic = "force-dynamic";
// KHU KHÁM PHÁ CỦA BÉ - màn hình chính (spec §15.1, Epic 5).
//
// ⚠️ **Đây là màn hình một đứa trẻ 5 tuổi nhìn.** Bốn luật của cả thư mục `/be`, và cả bốn
// đều được bộ kiểm quét mã nguồn canh (§9.40):
//
//  1. **Không tiền, không chợ, không hoá đơn.** Không import `decor-actions`, `market-actions`,
//     `billing-actions`, `care-actions`, `refund-actions`, `harvest-actions`, `lib/pricing`.
//  2. **Không đường nào dẫn thẳng sang khu người lớn.** Mọi lối ra đi qua cổng ở `/be/ra`.
//  3. **Không tự phát tiếp**: mỗi màn tối đa ba thẻ, không cuộn vô tận, không tự mở bài kế.
//  4. **Vẽ trang không ghi DB** (§7.14). Trang này chỉ đọc.
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { avatarEmoji } from "@/lib/family-gates";
import { moKhuCuaBe } from "@/lib/bai-hoc";
import ExitGate from "@/components/be/ExitGate";

/** Tối đa 2 bài đã xong hiện ở trang chính (spec §10.3) - phần còn lại nằm trong nhật ký. */
const SO_BAI_GAN_DAY = 2;

export default async function NhaCuaBe({ params }: { params: { childId: string } }) {
  // Đăng nhập TRƯỚC (§9.5), rồi mới tới cổng của khu. `requireUser` đưa về trang đăng nhập
  // kèm đường quay lại; `moKhuCuaBe` trả `null` thì `notFound()` - không nói vì sao, vì "hồ sơ
  // này có tồn tại nhưng không phải của bạn" cũng đã là một câu trả lời.
  const me = await requireUser(`/be/${params.childId}`);
  const be = await moKhuCuaBe(me.id, params.childId);
  if (!be) notFound();

  const [dangCho, ganDay] = await Promise.all([
    prisma.learningMoment.findMany({
      where: { childId: be.id, status: { in: ["AVAILABLE", "STARTED"] } },
      orderBy: { availableAt: "asc" },
      take: 1,
      select: { id: true, unitKey: true, contentSnapshot: true },
    }),
    prisma.learningMoment.findMany({
      where: { childId: be.id, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: SO_BAI_GAN_DAY,
      select: { id: true, contentSnapshot: true, missionDoneAt: true },
    }),
  ]);

  const noiBat = dangCho[0];
  const ten = (c: unknown) => (c as { title?: string } | null)?.title ?? "Một điều mới";
  const phut = (c: unknown) => (c as { durationMinutes?: number } | null)?.durationMinutes ?? 5;

  return (
    <div className="screen">
      <div className="flex items-center gap-2.5">
        <span className="text-[34px]" aria-hidden>{avatarEmoji(be.avatarKey)}</span>
        <div>
          <h1 className="display text-[22px]">Chào {be.nickname}!</h1>
          <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
            Đây là chuồng gà mình đang cùng chăm.
          </p>
        </div>
      </div>

      {noiBat ? (
        <Link href={`/be/${be.id}/khoanh-khac/${noiBat.id}`}
          className="card mt-4 no-underline block"
          style={{ background: "var(--yolk-tint)", border: "1px solid var(--yolk)" }}>
          <div className="text-[12.5px] font-semibold" style={{ color: "var(--yolk-deep)" }}>
            ✨ Có điều mới ở chuồng
          </div>
          <div className="display text-[19px] mt-1">{ten(noiBat.contentSnapshot)}</div>
          <div className="text-[12.5px] mt-1" style={{ color: "var(--ink-soft)" }}>
            Khoảng {phut(noiBat.contentSnapshot)} phút
          </div>
          {/* Nút to, chữ to: ngón tay của trẻ nhỏ và mắt chưa đọc trôi (§18.1). */}
          <div className="btn btn-primary mt-3 text-[16px]" style={{ minHeight: 52 }}>
            Mình xem nào →
          </div>
        </Link>
      ) : (
        <div className="card mt-4">
          <div className="display text-[18px]">Hôm nay chưa có gì mới</div>
          <p className="text-[13.5px] mt-1.5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Khi cô chú ở nông trại làm xong một việc cho đàn gà, mình sẽ có điều mới để xem.
            Mai mình quay lại nhé!
          </p>
        </div>
      )}

      {ganDay.length > 0 && (
        <div className="grid gap-2 mt-4">
          <h2 className="display text-[16px]">Mình đã xem</h2>
          {ganDay.map((b) => (
            <Link key={b.id} href={`/be/${be.id}/khoanh-khac/${b.id}`}
              className="card flex items-center gap-2 no-underline">
              <span className="text-[22px]" aria-hidden>{b.missionDoneAt ? "💚" : "✅"}</span>
              <div className="text-[14px] font-semibold">{ten(b.contentSnapshot)}</div>
            </Link>
          ))}
          <Link href={`/be/${be.id}/nhat-ky`} className="btn btn-ghost no-underline">
            Xem tất cả những điều mình đã học
          </Link>
        </div>
      )}

      {/* Lối ra duy nhất, và nó có cổng. Không có `Link` nào từ đây sang khu người lớn. */}
      <div className="mt-5">
        <ExitGate />
      </div>
    </div>
  );
}
