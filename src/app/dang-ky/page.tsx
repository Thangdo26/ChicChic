export const dynamic = "force-dynamic";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { RegisterForm } from "@/components/AuthForms";

export default async function Register() {
  if (await getSessionUser()) redirect("/tai-khoan");
  return (
    <div className="screen">
      <Link href="/" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Trang chủ</Link>
      <span className="eyebrow block mt-2">Tài khoản</span>
      <h1 className="display text-[23px] mt-1 mb-1.5">Tạo tài khoản ChicChic</h1>
      <p className="lede mb-3.5">
        Xác minh email bằng mã 6 số, đặt mật khẩu - rồi mọi chuồng bạn nhận nuôi sẽ nằm gọn trong một chỗ.
      </p>
      <Suspense><RegisterForm /></Suspense>
      <p className="text-[11.6px] mt-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Tài khoản chỉ dùng để quản lý chuồng của bạn. ChicChic là đặt mua trước nông sản + nuôi hộ - không phải kênh đầu tư.
      </p>
    </div>
  );
}
