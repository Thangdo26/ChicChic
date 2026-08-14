import { Khung, O, KhungDanhSach } from "@/components/Skeletons";

/**
 * Bảng vận hành pilot - một tiêu đề rồi ba chùm thẻ số liệu. Khung chỉ gợi ra nhịp đó.
 *
 * ⚠️ Mọi route trong repo này bắt buộc có `loading.tsx` (§8) - và nhớ luôn hệ quả ở §10:
 * có tệp này nghĩa là Next **stream**, nên `notFound()` ở trang bên cạnh trả HTTP **200**.
 * Kiểm cổng quyền của trang này bằng **nội dung**, đừng đọc mã trạng thái.
 */
export default function Loading() {
  return (
    <Khung>
      <O h={22} w="58%" r={7} />
      <div className="mt-3.5 grid gap-3">
        <O h={14} w="34%" r={5} />
        <KhungDanhSach so={3} h={78} />
        <O h={14} w="28%" r={5} />
        <KhungDanhSach so={2} h={96} />
      </div>
    </Khung>
  );
}
