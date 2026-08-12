import { Khung, KhungDau, KhungDanhSach, KhungThe } from "@/components/Skeletons";

// Cổng Gia đình - tiêu đề, rồi thẻ lời mời / hồ sơ bé, rồi lối vào quyền riêng tư.
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="52%" />
      <div className="mt-3.5 grid gap-2.5">
        <KhungThe h={168} />
        <KhungDanhSach so={2} h={72} />
        <KhungThe h={64} />
      </div>
    </Khung>
  );
}
