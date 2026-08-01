export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { listWorkers } from "@/lib/workers";
import ChooseBarnForm from "@/components/ChooseBarnForm";

export default async function ChooseBarn() {
  // Nhận chuồng là hành động gắn với một tài khoản — bắt buộc đăng nhập trước.
  const me = await requireUser("/nhan-chuong");
  const workers = await listWorkers();
  return <ChooseBarnForm me={{ email: me.email, name: me.name }} workers={workers} />;
}
