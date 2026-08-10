import { KhungTrangCon, O, KhungLuoi } from "@/components/Skeletons";

// Xưởng trang trí = khung vẽ chuồng chiếm nửa trên, cửa hàng ở dưới.
export default function Loading() {
  return (
    <KhungTrangCon>
      <O h={218} r={20} />
      <div className="mt-3"><KhungLuoi so={6} h={96} cot="grid-cols-3" /></div>
    </KhungTrangCon>
  );
}
