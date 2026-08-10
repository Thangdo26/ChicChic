import { KhungTrangCon, KhungThe, KhungDanhSach } from "@/components/Skeletons";

// Truy xuất = một thẻ hồ sơ đàn ở trên, rồi dòng thời gian sự kiện sức khoẻ.
export default function Loading() {
  return (
    <KhungTrangCon>
      <KhungThe h={148} />
      <div className="mt-3"><KhungDanhSach so={3} h={54} /></div>
    </KhungTrangCon>
  );
}
