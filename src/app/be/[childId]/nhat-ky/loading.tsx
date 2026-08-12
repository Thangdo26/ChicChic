import { Khung, KhungDau, KhungDanhSach } from "@/components/Skeletons";

// Nhật ký - tiêu đề rồi danh sách những điều đã học.
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="56%" />
      <div className="mt-3.5">
        <KhungDanhSach so={5} h={68} />
      </div>
    </Khung>
  );
}
