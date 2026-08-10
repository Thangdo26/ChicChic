export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listWorkers } from "@/lib/workers";
import ChooseBarnForm from "@/components/ChooseBarnForm";

export default async function ChooseBarn() {
  // Nhận chuồng là hành động gắn với một tài khoản - bắt buộc đăng nhập trước.
  const me = await requireUser("/nhan-chuong");
  // Nông dân không đi đường này: cô chú NHẬN chuồng từ nông trại, không tự đặt mua
  // dịch vụ nuôi hộ của chính mình. Cổng chặn thật nằm ở POST /api/reservations.
  if (me.role === "WORKER") redirect("/nong-trai");
  const workers = await listWorkers();
  return <ChooseBarnForm me={{ email: me.email, name: me.name }} workers={workers} />;
}
