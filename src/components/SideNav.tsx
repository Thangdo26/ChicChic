"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };

/**
 * Thanh điều hướng dọc - CHỈ hiện trên laptop (`lg`), ẩn hoàn toàn trên điện thoại.
 *
 * Trên điện thoại app đã có lối đi riêng cho từng màn (nút "‹ Quay lại", lưới lối tắt,
 * dock ở đáy) và màn hình hẹp thì thêm một thanh nữa là ăn mất chỗ đọc. Trên laptop thì
 * ngược lại: khoảng trống hai bên vốn bỏ không, mà không có thanh này người dùng phải
 * quay về trang chủ mỗi lần muốn đổi khu vực.
 *
 * Là client component vì cần `usePathname` để tô đậm mục đang mở - không có dấu hiệu
 * "mình đang ở đâu" thì thanh điều hướng chỉ là một cột link.
 */
export default function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();

  return (
    <nav className="side-nav" aria-label="Điều hướng chính">
      {items.map((it) => {
        // Trang chủ khớp tuyệt đối; còn lại khớp tiền tố để trang con vẫn sáng đúng mục
        // (vd /chuong/demo/thu-hoach vẫn thuộc "Chuồng của tôi").
        const on = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={`side-link${on ? " on" : ""}`}
            aria-current={on ? "page" : undefined}>
            <span className="text-[15px] leading-none" aria-hidden>{it.icon}</span>
            <span className="truncate">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
