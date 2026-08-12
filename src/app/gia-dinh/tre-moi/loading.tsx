import { Khung, KhungDau, KhungQuayLai, KhungThe } from "@/components/Skeletons";

// Thêm hồ sơ bé - thẻ "ChicChic giữ gì" rồi thẻ biểu mẫu.
export default function Loading() {
  return (
    <Khung>
      <KhungQuayLai />
      <KhungDau rong="46%" />
      <div className="mt-3 grid gap-3">
        <KhungThe h={210} />
        <KhungThe h={330} />
      </div>
    </Khung>
  );
}
