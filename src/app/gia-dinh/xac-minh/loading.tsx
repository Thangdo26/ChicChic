import { Khung, KhungQuayLai, KhungThe } from "@/components/Skeletons";

// Cửa gõ lại mật khẩu - đúng một thẻ.
export default function Loading() {
  return (
    <Khung>
      <KhungQuayLai />
      <div className="mt-3">
        <KhungThe h={230} />
      </div>
    </Khung>
  );
}
