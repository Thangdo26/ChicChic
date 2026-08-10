import { Khung, KhungQuayLai, KhungDau, O, KhungDanhSach } from "@/components/Skeletons";

// Trang làm việc một chuồng của nông dân: hình chuồng, việc đang chờ, ô gửi ảnh.
export default function Loading() {
  return (
    <Khung>
      <KhungQuayLai />
      <KhungDau rong="50%" />
      <div className="mt-3.5 grid gap-2.5">
        <O h={128} r={18} />
        <KhungDanhSach so={2} h={86} />
      </div>
    </Khung>
  );
}
