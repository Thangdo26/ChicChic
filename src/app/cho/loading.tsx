import { Khung, KhungDau, O, KhungDanhSach } from "@/components/Skeletons";

// Chợ — dòng "N lô đang rao" rồi các thẻ lô xếp dọc.
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="52%" />
      <div className="mt-3.5 mb-2"><O h={15} w={128} r={5} /></div>
      <KhungDanhSach so={4} h={92} />
    </Khung>
  );
}
