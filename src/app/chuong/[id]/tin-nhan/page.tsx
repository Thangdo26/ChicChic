export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listMessages, markRead, threadAccess } from "@/lib/messages";
import BarnThread from "@/components/BarnThread";

/**
 * Hộp thư của chủ chuồng.
 *
 * Cổng quyền KHÔNG dùng `canViewBarn` như các trang chuồng khác: xem được một chuồng
 * (chuồng trưng bày, tài khoản admin…) không có nghĩa là được nhắn vào hộp thư riêng
 * của hai người. `threadAccess()` là cửa duy nhất cho việc đó.
 */
export default async function BarnMessages({ params }: { params: { id: string } }) {
  await requireUser(`/chuong/${params.id}/tin-nhan`);
  const gate = await threadAccess(params.id);
  if (!gate) return notFound();

  // Mở trang ra là đã đọc. Làm trước khi liệt kê để badge về 0 ngay trong lần render này.
  if (gate.meId && gate.role !== "ADMIN") await markRead(gate.barn.id, gate.meId);
  const list = await listMessages(gate.barn.id, gate.meId);

  return (
    <div className="screen">
      <Link href={`/chuong/${params.id}`} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Chuồng của tôi</Link>
      <span className="eyebrow block mt-2">{gate.barn.label}</span>
      <h2 className="display text-[21px] mt-1 mb-1.5">Nhắn với {gate.workerName}</h2>
      <p className="lede">
        Hỏi han về đàn gà của bạn. {gate.workerName} thường trả lời trong ngày — cô/chú
        còn đang ở ngoài chuồng, nên đừng lo nếu chưa thấy hồi âm ngay.
      </p>

      <div className="mt-3.5">
        <BarnThread
          barnSlug={gate.barn.slug}
          role={gate.role}
          ownerName={gate.ownerName}
          workerName={gate.workerName}
          initial={list}
        />
      </div>

      <p className="text-[11.6px] mt-5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Nhắn tin <b>không</b> thay đổi được gì ngoài đời. Muốn cô/chú làm một việc cụ thể thì bấm
        <b> “Chuyển thành việc”</b> ngay dưới tin của bạn — việc đó chỉ được tính là xong khi có
        ảnh hoặc video chụp sau khi làm.
      </p>
    </div>
  );
}
