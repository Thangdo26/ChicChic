import { Khung, KhungDau, KhungDanhSach, KhungThe } from "@/components/Skeletons";

// Nhà của bé - lời chào, thẻ "có điều mới" to, rồi hai bài đã xem.
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="48%" />
      <div className="mt-4 grid gap-2.5">
        <KhungThe h={184} />
        <KhungDanhSach so={2} h={60} />
        <KhungThe h={48} />
      </div>
    </Khung>
  );
}
