"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  // Lỗi hay gặp nhất ở PoC là không nối được Postgres — nói thẳng cách sửa.
  const dbIssue = /P1001|ECONNREFUSED|ENOTFOUND|Can't reach database|prepared statement/i.test(error.message);

  return (
    <div className="screen">
      <div className="text-[36px] mt-6">🌾</div>
      <h1 className="display text-[22px] mt-2">Có gì đó trục trặc</h1>
      <p className="lede mt-2">
        {dbIssue
          ? "Ứng dụng chưa nối được tới cơ sở dữ liệu."
          : "Tụi mình đã ghi nhận lỗi này. Bạn thử tải lại xem sao."}
      </p>

      {dbIssue && (
        <div className="soft mt-3 text-[12.7px]" style={{ color: "var(--ink-soft)" }}>
          <b style={{ color: "var(--ink)" }}>Cách kiểm tra nhanh:</b>
          <ul className="mt-1.5 pl-[18px] grid gap-1">
            <li><code>DATABASE_URL</code> phải là chuỗi <b>Connection pooling</b> (cổng 6543, có <code>?pgbouncer=true</code>).</li>
            <li><code>DIRECT_URL</code> phải là chuỗi <b>Session pooler</b> (cổng 5432, host <code>…pooler.supabase.com</code>).</li>
            <li>Đã chạy <code>npm run db:push</code> và <code>npm run db:seed</code> chưa?</li>
          </ul>
        </div>
      )}

      <div className="grid gap-2 mt-5">
        <button className="btn btn-primary" onClick={reset}>Thử lại</button>
        <Link href="/" className="btn btn-ghost no-underline">Về trang chủ</Link>
      </div>
      {error.digest && <p className="text-[11px] mt-3" style={{ color: "var(--ink-soft)" }}>Mã lỗi: {error.digest}</p>}
    </div>
  );
}
