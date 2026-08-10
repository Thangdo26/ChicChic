import { Khung, KhungDau, KhungDanhSach } from "@/components/Skeletons";

// Danh sách chuồng của tôi — các thẻ chuồng đều nhau, mỗi thẻ có hình chuồng bên trái.
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="46%" />
      <div className="mt-3.5"><KhungDanhSach so={3} h={96} /></div>
    </Khung>
  );
}
