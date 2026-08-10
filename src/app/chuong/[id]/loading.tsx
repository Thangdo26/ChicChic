import { Khung, O, KhungLuoi, KhungDaiAnh } from "@/components/Skeletons";

/**
 * Trang chuồng — trang **nặng nhất và được mở nhiều nhất** của cả sản phẩm
 * (~15 quan hệ xếp 3 tầng, CODEMAP §11.23). Khung chờ ở đây được nhìn nhiều hơn
 * mọi khung khác cộng lại, nên nó bám sát bố cục thật: ảnh chuồng lớn → dải trạng
 * thái sẫm → dải ảnh hôm nay → lưới lối tắt → hộp việc.
 */
export default function Loading() {
  return (
    <Khung>
      <O h={168} r={22} />
      <div className="mt-4 grid gap-2">
        <O h={22} w="62%" r={7} />
        <O h={13} w="44%" r={5} />
      </div>
      {/* Dải trạng thái thật là nền sẫm — để khối xám nhạt ở đây thì lúc trang hiện
          ra mắt thấy một mảng tối bật lên đúng chỗ vừa nhìn. */}
      <div className="mt-3.5 rounded-[18px]" style={{ height: 62, background: "var(--paddy-deep)", opacity: .12 }} />
      <div className="mt-4"><KhungDaiAnh /></div>
      <div className="mt-3.5"><KhungLuoi so={6} /></div>
      <div className="mt-3.5"><O h={140} r={18} /></div>
    </Khung>
  );
}
