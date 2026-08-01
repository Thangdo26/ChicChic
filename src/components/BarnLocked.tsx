import Link from "next/link";

/** Chuồng đã có chủ — người khác vào thì thấy màn này thay vì nội dung riêng tư. */
export default function BarnLocked({ slug }: { slug: string }) {
  return (
    <div className="screen text-center">
      <div className="text-[38px] mt-6">🔐</div>
      <h1 className="display text-[21px] mt-2">Chuồng này của một bạn khác</h1>
      <p className="lede mt-2 px-2">
        Ảnh, video và nhật ký của mỗi chuồng chỉ người nhận nuôi chuồng đó xem được.
        Đăng nhập bằng tài khoản sở hữu chuồng, hoặc nhận một chuồng cho riêng bạn.
      </p>
      <div className="grid gap-2 mt-5">
        <Link href={`/dang-nhap?next=${encodeURIComponent(`/chuong/${slug}`)}`} className="btn btn-primary no-underline">Đăng nhập</Link>
        <Link href="/nhan-chuong" className="btn btn-ghost no-underline">Nhận chuồng cho riêng tôi</Link>
        <Link href="/chuong/demo" className="btn btn-ghost no-underline">Xem chuồng demo công khai</Link>
      </div>
    </div>
  );
}
