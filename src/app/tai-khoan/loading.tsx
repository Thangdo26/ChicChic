import { Khung, KhungDau, KhungThe, KhungDanhSach } from "@/components/Skeletons";

// Tài khoản - thẻ hồ sơ ở trên, rồi các thẻ chuồng đang nuôi.
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="40%" />
      <div className="mt-3.5 grid gap-2.5">
        <KhungThe h={110} />
        <KhungDanhSach so={2} h={96} />
      </div>
    </Khung>
  );
}
