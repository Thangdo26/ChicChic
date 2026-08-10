import { Khung, KhungThe, KhungDanhSach } from "@/components/Skeletons";

/**
 * Trang truy xuất công khai — người vừa **quét mã QR trên hộp trứng được tặng**
 * đang đứng đây. Họ chưa có tài khoản, chưa biết ChicChic là gì, và một trang
 * trắng vài giây là đủ để họ đóng lại (§7.14). Khung phải lên ngay.
 */
export default function Loading() {
  return (
    <Khung>
      <KhungThe h={150} />
      <div className="mt-3"><KhungDanhSach so={3} h={62} /></div>
    </Khung>
  );
}
