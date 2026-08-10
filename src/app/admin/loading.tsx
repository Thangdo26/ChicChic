import { Khung, O, KhungDanhSach } from "@/components/Skeletons";

/**
 * Bảng quản trị — trang dài nhất repo (nhiều khối đối soát xếp dọc). Khung chỉ gợi
 * ra "một chuỗi khối", không cố vẽ lại từng khối một: người trực đối soát mở trang
 * này nhiều lần mỗi ngày và họ cuộn theo trí nhớ, không theo hình.
 */
export default function Loading() {
  return (
    <Khung>
      <O h={22} w="42%" r={7} />
      <div className="mt-3.5 grid gap-3.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid gap-2">
            <O h={14} w="38%" r={5} />
            <KhungDanhSach so={2} h={64} />
          </div>
        ))}
      </div>
    </Khung>
  );
}
