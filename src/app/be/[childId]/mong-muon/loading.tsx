import { Khung, KhungDau, KhungDanhSach } from "@/components/Skeletons";

// Nhắn bố mẹ - tiêu đề rồi bốn nhóm để bé chọn.
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="60%" />
      <div className="mt-4">
        <KhungDanhSach so={4} h={58} />
      </div>
    </Khung>
  );
}
