export const dynamic = "force-dynamic";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/AuthForms";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/tai-khoan");
  return (
    <div className="screen">
      <Link href="/" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Trang chủ</Link>
      <span className="eyebrow block mt-2">Tài khoản</span>
      <h1 className="display text-[23px] mt-1 mb-1.5">Đăng nhập</h1>
      <p className="lede mb-3.5">Vào để xem chuồng của bạn, ảnh/video mới và nhật ký từ nông trại.</p>
      <Suspense><LoginForm /></Suspense>
    </div>
  );
}
