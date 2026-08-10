import { Khung, KhungThe, O, KhungDaiAnh } from "@/components/Skeletons";

// Hồ sơ nông dân - thẻ giới thiệu lớn ở trên, rồi các dải ảnh cô chú gửi.
export default function Loading() {
  return (
    <Khung>
      <KhungThe h={196} />
      <div className="mt-4 mb-2"><O h={13} w={168} r={5} /></div>
      <KhungDaiAnh />
    </Khung>
  );
}
