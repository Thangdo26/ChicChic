import { Khung, KhungQuayLai, KhungDau, O, KhungDanhSach } from "@/components/Skeletons";

// Đơn của tôi — hai khối: mua vào và bán ra.
export default function Loading() {
  return (
    <Khung>
      <KhungQuayLai />
      <KhungDau rong="44%" />
      <div className="mt-3.5 grid gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-2">
            <O h={14} w={104} r={5} />
            <KhungDanhSach so={2} h={80} />
          </div>
        ))}
      </div>
    </Khung>
  );
}
