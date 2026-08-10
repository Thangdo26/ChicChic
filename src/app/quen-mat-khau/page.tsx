export const dynamic = "force-dynamic";
import { Suspense } from "react";
import Link from "next/link";
import { ForgotForm } from "@/components/AuthForms";

export default function ForgotPage() {
  return (
    <div className="screen">
      <Link href="/dang-nhap" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Đăng nhập</Link>
      <span className="eyebrow block mt-2">Tài khoản</span>
      <h1 className="display text-[23px] mt-1 mb-1.5">Quên mật khẩu</h1>
      <p className="lede mb-3.5">
        Nhập email tài khoản - tụi mình gửi mã 6 số để bạn đặt mật khẩu mới. Mã có hiệu lực 10 phút.
      </p>
      <Suspense><ForgotForm /></Suspense>
      <p className="text-[11.6px] mt-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Đặt lại mật khẩu xong, mọi phiên đăng nhập cũ sẽ bị đăng xuất để giữ an toàn cho tài khoản bạn.
      </p>
    </div>
  );
}
