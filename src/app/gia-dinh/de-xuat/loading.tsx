import { Khung, KhungDau, KhungDanhSach } from "@/components/Skeletons";

// Hàng chờ mong muốn - tiêu đề, câu dẫn, rồi vài thẻ.
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="52%" />
      <div className="mt-3.5">
        <KhungDanhSach so={3} h={112} />
      </div>
    </Khung>
  );
}
