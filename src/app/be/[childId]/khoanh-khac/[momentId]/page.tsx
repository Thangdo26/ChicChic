export const dynamic = "force-dynamic";
// KHU CỦA BÉ - một khoảnh khắc học (spec §15.1, Epic 5).
//
// ⚠️ Trang này **chỉ đọc**. Bài chuyển sang `STARTED` khi bé bấm sang thẻ thứ hai, không phải
// lúc vẽ trang (§7.14): một phép ghi DB nấp trong một lượt xem trang là thứ không ai tìm ra
// khi nó hỏng, và ở đây nó còn đếm nhầm cả "bé đã bắt đầu học chưa".
//
// ⚠️ **Nội dung lấy từ BẢN CHỤP trong DB, không từ catalog hiện tại** (§13.3). Sửa nội dung
// hôm nay không được làm đổi bài một đứa trẻ đang làm dở.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { anhCuaBai, moBaiCuaBe } from "@/lib/bai-hoc";
import MomentPlayer, { type NoiDungBai } from "@/components/be/MomentPlayer";

export default async function KhoanhKhac({
  params,
}: {
  params: { childId: string; momentId: string };
}) {
  const me = await requireUser(`/be/${params.childId}/khoanh-khac/${params.momentId}`);
  const b = await moBaiCuaBe(me.id, params.momentId);
  // Cổng đã kiểm "bài này của bé này". Phép so dưới đây chốt thêm rằng đường dẫn cũng khớp -
  // không có nó thì `/be/<con-nhà-khác>/khoanh-khac/<bài-của-mình>` vẫn vẽ ra được, và tuy
  // không lộ dữ liệu của ai, nó vẫn là một câu trả lời sai về việc ai đang ở đây.
  if (!b || b.be.id !== params.childId) notFound();

  const noiDung = b.bai.contentSnapshot as unknown as NoiDungBai;
  const duKien = (b.bai.factSnapshot ?? {}) as { qty?: number; proofMediaId?: string };
  const anhUrl = await anhCuaBai(b.be.barnId, duKien.proofMediaId);

  return (
    <div className="screen">
      {/* Lối lùi DUY NHẤT là về nhà của bé. Không có đường nào sang khu người lớn từ đây. */}
      <Link href={`/be/${b.be.id}`} className="text-[13px] no-underline"
        style={{ color: "var(--ink-soft)" }}>
        ‹ Về trang của {b.be.nickname}
      </Link>
      <h1 className="display text-[19px] mt-1.5 mb-3">{noiDung?.title ?? "Một điều mới"}</h1>

      <MomentPlayer
        momentId={b.bai.id}
        noiDung={noiDung}
        soLuong={typeof duKien.qty === "number" ? duKien.qty : null}
        anhUrl={anhUrl}
        daXong={b.bai.status === "COMPLETED"}
        nhiemVuDaXong={!!b.bai.missionDoneAt}
      />
    </div>
  );
}
