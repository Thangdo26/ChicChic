import { Khung, KhungDau, KhungThe, KhungDanhSach } from "@/components/Skeletons";

/**
 * Khung chờ **mặc định** — chỉ còn dùng cho những trang không có khung riêng
 * (trang chủ, đăng nhập/đăng ký, nhận chuồng, quên mật khẩu).
 *
 * Trước bản này đây là khung chờ DUY NHẤT của cả app, và nó mang hình dạng của
 * **trang chuồng**: ảnh lớn, dải trạng thái, lưới lối tắt. Mở `/cho` hay `/admin`
 * cũng thấy hình một cái chuồng trong vài giây rồi trang nhảy sang bố cục khác hẳn.
 * Nay nó cố ý **trung tính** — vài khối chung chung, không hứa hẹn bố cục nào.
 */
export default function Loading() {
  return (
    <Khung>
      <KhungDau />
      <div className="mt-3.5 grid gap-2.5">
        <KhungThe h={128} />
        <KhungDanhSach so={2} h={72} />
      </div>
    </Khung>
  );
}
