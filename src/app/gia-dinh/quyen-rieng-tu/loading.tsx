import { Khung, KhungDau, KhungDanhSach, KhungQuayLai, KhungThe } from "@/components/Skeletons";

// Quyền riêng tư - hai thẻ chữ, rồi danh sách hồ sơ bé.
export default function Loading() {
  return (
    <Khung>
      <KhungQuayLai />
      <KhungDau rong="58%" />
      <div className="mt-3 grid gap-2.5">
        <KhungThe h={200} />
        <KhungThe h={190} />
        <KhungDanhSach so={1} h={132} />
      </div>
    </Khung>
  );
}
