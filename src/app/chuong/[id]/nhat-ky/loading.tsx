import { KhungTrangCon, KhungLuoi } from "@/components/Skeletons";

// Nhật ký = một lưới ảnh dày. Vẽ đủ 6 ô cho lưới bám được chiều cao trang thật.
export default function Loading() {
  return <KhungTrangCon><KhungLuoi so={6} h={112} cot="grid-cols-2 lg:grid-cols-3" /></KhungTrangCon>;
}
