export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminThread, listMessages } from "@/lib/messages";
import BarnThread from "@/components/BarnThread";

/**
 * Nông trại đọc một hộp thư bị báo cáo.
 *
 * Route này nằm DƯỚI `/admin` là bắt buộc, không phải cho gọn:
 * - `middleware.ts` chỉ khoá `/admin/:path*` bằng Basic Auth, nên đặt ở đây là được
 *   bảo vệ sẵn;
 * - trình duyệt chỉ tự gửi kèm header Basic Auth cho đường dẫn trong cùng realm, nên
 *   `isAdmin()` chỉ nhận ra quản trị khi URL bắt đầu bằng `/admin`.
 *
 * Đặt ở `/chuong/<slug>/tin-nhan` như trước thì admin bị `requireUser` đá ra
 * `/dang-nhap` - đúng lỗi đã gặp.
 */
export default async function AdminThread({
  params, searchParams,
}: {
  params: { slug: string };
  searchParams?: { tin?: string };
}) {
  const gate = await adminThread(params.slug);
  // Không phải admin, chuồng không tồn tại, hoặc hộp thư SẠCH (không cờ, không báo cáo).
  if (!gate) return notFound();

  const list = await listMessages(gate.barn.id, null);
  const focus = searchParams?.tin;

  return (
    <div className="screen">
      <Link href="/admin" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Bảng điều khiển</Link>
      <span className="eyebrow block mt-2">Hộp thư bị báo cáo</span>
      <h2 className="display text-[21px] mt-1 mb-1.5">{gate.barn.label}</h2>
      <p className="lede">
        {gate.ownerName} ↔ {gate.workerName}. Nông trại chỉ đọc - không nhắn thay được,
        và cả hai bên đều đã được nói trước rằng hộp thư có cờ thì nông trại sẽ đọc lại.
      </p>

      <div className="mt-3.5">
        <BarnThread
          barnSlug={gate.barn.slug}
          role="ADMIN"
          ownerName={gate.ownerName}
          workerName={gate.workerName}
          initial={list}
          focusId={focus}
        />
      </div>

      <p className="text-[11.6px] mt-5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Xử lý xong nhớ liên hệ lại với người đã báo cáo. Hộp thư này được giữ nguyên vẹn
        làm lưu vết - không xoá tin nào cả.
      </p>
    </div>
  );
}
