import { KhungTrangCon, KhungDanhSach } from "@/components/Skeletons";

// Đàn gà & yếm = một dòng cho mỗi con, thấp và đều.
export default function Loading() {
  return <KhungTrangCon><KhungDanhSach so={5} h={62} /></KhungTrangCon>;
}
