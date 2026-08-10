import { KhungTrangCon, KhungThe, KhungDanhSach } from "@/components/Skeletons";

// Nuôi dưỡng đàn nghỉ hưu = thẻ tình trạng kỳ hiện tại, rồi ba khối 3/6/12 tháng.
export default function Loading() {
  return (
    <KhungTrangCon>
      <KhungThe h={116} />
      <div className="mt-3"><KhungDanhSach so={3} h={70} /></div>
    </KhungTrangCon>
  );
}
