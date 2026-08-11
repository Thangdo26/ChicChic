"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = {
  href: string; label: string; icon: string;
  /** Con số nhỏ bên phải (vd số lô trong giỏ). `0`/bỏ trống ⟹ không vẽ gì. */
  badge?: number;
};

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

  /**
   * Mục nào đang mở - khớp theo RANH GIỚI ĐƯỜNG DẪN, không phải tiền tố chuỗi trần.
   *
   * `path.startsWith(href)` sai hai kiểu, cả hai đều có thật trong app này:
   *  · `"/chuong/demo".startsWith("/cho")` là **true** - mở chuồng của mình thì "Chợ
   *    nông trại" cũng sáng theo, tức thanh điều hướng chỉ sai đúng chỗ nó tồn tại để
   *    trả lời ("mình đang ở đâu");
   *  · trang con của một mục làm sáng luôn mục cha (`/cho/gio` sáng cả "Chợ" lẫn "Giỏ").
   *
   * Nên: khớp phải cắt ở dấu `/`, và trong các mục cùng khớp thì lấy mục **cụ thể nhất**.
   */
  const khop = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  const dangMo = items
    .filter((it) => khop(it.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

  return (
    <nav className="side-nav" aria-label="Điều hướng chính">
      {items.map((it) => {
        const on = it.href === dangMo;
        return (
          <Link key={it.href} href={it.href} className={`side-link${on ? " on" : ""}`}
            aria-current={on ? "page" : undefined}>
            <span className="text-[15px] leading-none" aria-hidden>{it.icon}</span>
            <span className="truncate">{it.label}</span>
            {!!it.badge && it.badge > 0 && (
              <span className="ml-auto flex-none font-bold text-[11px] rounded-full px-1.5 py-0.5 tabular-nums"
                style={{ background: "var(--paddy)", color: "#F7FBF4", minWidth: 20, textAlign: "center" }}>
                {it.badge > 99 ? "99+" : it.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
