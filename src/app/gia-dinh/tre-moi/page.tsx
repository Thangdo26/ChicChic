export const dynamic = "force-dynamic";
// Tạo hồ sơ cho một bé (spec §15.1: `parent + recent-auth`).
//
// Ba cửa, đúng thứ tự: đăng nhập → cờ tổng → **đã gõ lại mật khẩu gần đây**. Cửa thứ ba ở
// đây chỉ để người dùng không đi vào một cái form rồi mới bị từ chối; cửa **thật** nằm trong
// `family-actions.taoHoSoTre` (§1.2 luật 4).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { batFamily, daXacMinhGanDay } from "@/lib/family";
import ChildProfileForm from "@/components/ChildProfileForm";

export default async function TreMoi() {
  await requireUser("/gia-dinh/tre-moi");
  if (!batFamily()) notFound();
  if (!(await daXacMinhGanDay())) {
    redirect("/gia-dinh/xac-minh?next=%2Fgia-dinh%2Ftre-moi");
  }

  return (
    <div className="screen">
      <Link href="/gia-dinh" className="text-[13px] no-underline" style={{ color: "var(--ink-soft)" }}>
        ← ChicChic Gia đình
      </Link>
      <h1 className="display text-[21px] mt-2">Thêm hồ sơ cho bé</h1>
      <ChildProfileForm />
    </div>
  );
}
