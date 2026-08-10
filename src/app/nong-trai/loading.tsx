import { Khung, O, KhungDanhSach } from "@/components/Skeletons";

/**
 * Hộp việc của nông dân. Cô chú mở trang này **giữa vườn, bằng 3G** - đây là chỗ
 * thời gian chờ được cảm thấy rõ nhất trong cả app, nên khung phải lên ngay và
 * đúng hình: dải tóm tắt việc ở trên, rồi danh sách chuồng phụ trách.
 */
export default function Loading() {
  return (
    <Khung>
      <div className="grid gap-2">
        <O h={22} w="56%" r={7} />
        <O h={13} w="70%" r={5} />
      </div>
      <div className="mt-3.5"><O h={72} r={18} /></div>
      <div className="mt-4 mb-2"><O h={15} w="48%" r={5} /></div>
      <KhungDanhSach so={3} h={98} />
    </Khung>
  );
}
