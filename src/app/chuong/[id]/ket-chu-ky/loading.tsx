import { KhungTrangCon, KhungDanhSach } from "@/components/Skeletons";

// Kết chu kỳ = ba lựa chọn lớn, mỗi cái một thẻ cao.
export default function Loading() {
  return <KhungTrangCon><KhungDanhSach so={3} h={126} /></KhungTrangCon>;
}
