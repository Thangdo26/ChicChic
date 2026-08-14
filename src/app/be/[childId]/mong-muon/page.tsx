export const dynamic = "force-dynamic";
// KHU CỦA BÉ - nhắn một điều cho bố mẹ (spec §10.4, Epic 6).
//
// ⚠️⚠️ **Cái bé bấm ở đây KHÔNG làm gì cả ngoài việc ghi lại một câu nói.** Không đơn hàng,
// không việc cho nông dân, không đồng tiền nào đổi chỗ (FL-D06/D07). Bố mẹ mới là người
// quyết định, ở một màn hình khác, sau một cổng quyền khác. Đó là toàn bộ lý do màn hình này
// được phép nằm trong tay một đứa trẻ.
//
// ⚠️ Trang **chỉ đọc** (§7.14). Dòng `PENDING` chỉ sinh ra khi bé bấm một nút.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { moKhuCuaBe } from "@/lib/bai-hoc";
import { khoaDangCho } from "@/lib/de-xuat";
import WishPicker from "@/components/be/WishPicker";

export default async function MongMuon({ params }: { params: { childId: string } }) {
  const me = await requireUser(`/be/${params.childId}/mong-muon`);
  const be = await moKhuCuaBe(me.id, params.childId);
  if (!be) notFound();

  const daGui = await khoaDangCho(be.id);

  return (
    <div className="screen">
      <Link href={`/be/${be.id}`} className="text-[13px] no-underline"
        style={{ color: "var(--ink-soft)" }}>
        ‹ Về trang của {be.nickname}
      </Link>
      <h1 className="display text-[21px] mt-1.5">💌 Nhắn bố mẹ một điều</h1>
      <p className="text-[13.5px] mt-1.5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Chọn một điều mình mong. Bố mẹ sẽ đọc và trả lời bé nhé - có điều làm được ngay, có
        điều phải chờ, và cũng có điều bố mẹ nói &ldquo;để lần sau&rdquo;.
      </p>

      <WishPicker childId={be.id} daGui={Array.from(daGui)} />
    </div>
  );
}
