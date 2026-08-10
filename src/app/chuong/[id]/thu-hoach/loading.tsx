import { KhungTrangCon, KhungDanhSach } from "@/components/Skeletons";

// Sổ thu hoạch = các thẻ lô xếp dọc, mỗi thẻ có ảnh nên khá cao.
export default function Loading() {
  return <KhungTrangCon><KhungDanhSach so={3} h={104} /></KhungTrangCon>;
}
