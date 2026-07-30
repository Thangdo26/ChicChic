import Link from "next/link";

export default function NotFound() {
  return (
    <div className="screen text-center">
      <div className="text-[40px] mt-8">🐔</div>
      <h1 className="display text-[22px] mt-2">Không tìm thấy chuồng này</h1>
      <p className="lede mt-2">
        Đường dẫn có thể sai, hoặc chuồng chưa được tạo. Thử xem một chuồng demo đang nuôi nhé.
      </p>
      <div className="grid gap-2 mt-5">
        <Link href="/chuong/demo" className="btn btn-primary no-underline">Xem chuồng demo →</Link>
        <Link href="/" className="btn btn-ghost no-underline">Về trang chủ</Link>
      </div>
    </div>
  );
}
