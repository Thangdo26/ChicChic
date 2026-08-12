import { Khung, KhungDau, KhungThe } from "@/components/Skeletons";

// Một khoảnh khắc - tiêu đề, thẻ nội dung lớn, rồi nút "tiếp theo".
export default function Loading() {
  return (
    <Khung>
      <KhungDau rong="60%" />
      <div className="mt-3 grid gap-3">
        <KhungThe h={320} />
        <KhungThe h={54} />
      </div>
    </Khung>
  );
}
