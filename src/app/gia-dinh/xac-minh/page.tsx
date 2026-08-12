export const dynamic = "force-dynamic";
// Cửa gõ lại mật khẩu (spec §17.1).
//
// Trang này **không** tự nó bảo vệ gì cả - nó chỉ là chỗ để gõ. Cửa thật nằm ở
// `daXacMinhGanDay()` trong từng trang nhạy cảm và trong từng action (§1.2 luật 4).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { batFamily } from "@/lib/family";
import FamilyReauthForm from "@/components/FamilyReauthForm";

/** Chỉ nhận đường dẫn nội bộ của chính cổng Gia đình. */
const DICH: Record<string, string> = {
  "/gia-dinh/tre-moi": "tạo hồ sơ cho một bé",
  "/gia-dinh/quyen-rieng-tu": "mở phần quyền riêng tư của bé",
};

export default async function XacMinh({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  await requireUser("/gia-dinh/xac-minh");
  if (!batFamily()) notFound();

  // ⚠️ **Danh sách trắng, không phải phép lọc.** `?next=` là chữ do người gọi đưa vào; nhận
  // bừa rồi `router.push` là một cái máy chuyển hướng mở - dán link ChicChic vào chỗ nào đó,
  // người ta gõ mật khẩu xong bị đẩy sang trang lạ. Không có trong bảng thì về trang chính.
  const raw = String(searchParams?.next ?? "");
  const next = DICH[raw] ? raw : "/gia-dinh";
  const viec = DICH[raw] ?? "làm một việc trong ChicChic Gia đình";

  return (
    <div className="screen">
      <Link href="/gia-dinh" className="text-[13px] no-underline" style={{ color: "var(--ink-soft)" }}>
        ← ChicChic Gia đình
      </Link>
      <FamilyReauthForm next={next} viec={viec} />
    </div>
  );
}
