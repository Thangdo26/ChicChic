import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Be_Vietnam_Pro, Lora } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import NotificationBell from "@/components/NotificationBell";
import SideNav from "@/components/SideNav";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { unreadCount } from "@/lib/notify";
import { loiVaoGiaDinh } from "@/lib/family";
import { HEADER_KHU_BE } from "@/lib/gates";
import "./globals.css";

/** Giá trị "không có gì ở cổng Gia đình" - dùng cho cả nhánh chưa đăng nhập lẫn nông dân. */
const KHONG_VAO_GIA_DINH = { hien: false, loiMoi: 0 } as const;

const sans = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const display = Lora({ subsets: ["vietnamese", "latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "ChicChic - nhận nuôi chuồng gà thật",
  description: "Nhận nuôi một chuồng gà thật ở quê, chăm qua app. Đặt mua trước nông sản + dịch vụ nuôi hộ - không phải đầu tư.",
  openGraph: {
    title: "ChicChic - nhận nuôi chuồng gà thật",
    description: "Chọn chuồng, đặt tên, trang trí. Nông dân chăm giúp và gửi ảnh/video thật mỗi ngày.",
    locale: "vi_VN",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF7EF",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ⭐ KHU CỦA BÉ dùng một lớp bọc TRẦN: không thanh trên, không điều hướng, không chân trang
  // (§9.40). Thanh điều hướng người lớn nằm ngay ở lớp bọc này, nên để nguyên nghĩa là một đứa
  // trẻ 5 tuổi đang ngồi trước bốn cánh cửa mở sẵn sang chuồng, chợ, giỏ hàng và tài khoản -
  // đúng thứ §15.3 của spec cấm. Lối ra duy nhất là cổng hỏi mật khẩu ở trong trang.
  //
  // Dấu tới từ middleware (`HEADER_KHU_BE`): Server Component không có `usePathname`.
  //
  // Nhánh này còn **không chạy một truy vấn nào** - bốn con số dưới kia đều là chuyện của
  // người lớn, và một trang cho trẻ không có lý do gì phải chờ chúng.
  if (headers().get(HEADER_KHU_BE) === "1") {
    return (
      <html lang="vi" className={`${sans.variable} ${display.variable}`}>
        <body>
          <ToastProvider>
            <div className="app-shell">
              <main className="app-main">{children}</main>
            </div>
          </ToastProvider>
        </body>
      </html>
    );
  }

  const me = await getSessionUser();
  // Layout chạy trước MỌI trang, nên ở đây chỉ lấy đúng thứ cần vẽ ngay: con số trên
  // huy hiệu chuông. Trước đây nó tải sẵn 15 thông báo đầy đủ (kèm title/body/href)
  // cho mọi lần tải trang, trong khi 99% lượt người dùng không bấm vào chuông - và
  // chuông tự gọi /api/notifications khi mở ra. Một `count()` rẻ hơn hẳn một `findMany`.
  // `soChuong` chỉ dùng để quyết định có bày mục "Nhận chuồng" hay không: người đang
  // nuôi rồi thì lời mời đó là quảng cáo nằm thường trực cạnh chuồng của chính họ.
  // `soGio` là con số trên mục 🧺 - giỏ hàng là thứ người ta bỏ dở rồi quay lại, nên nó
  // phải nhìn thấy được từ MỌI trang, không chỉ khi đang đứng trong chợ (§11.46).
  // Cả ba đi CHUNG một `Promise.all` - chạy song song nên không thêm lượt chờ nào
  // (§11.31: cái đắt ở đây là số lượt chờ NỐI TIẾP, không phải số truy vấn).
  const laKhach = !!me && me.role !== "WORKER";
  const [unread, soChuong, soGio, giaDinh] = me
    ? await Promise.all([
        unreadCount(me.id),
        prisma.barn.count({ where: { ownerId: me.id } }),
        // Nông dân không mua trên chợ (§9.14) - đừng tốn một truy vấn cho một mục
        // không bao giờ được vẽ cho họ.
        laKhach
          ? prisma.marketListing.count({
              where: { buyerId: me.id, status: "RESERVED", order: { status: "OPEN" } },
            })
          : Promise.resolve(0),
        // Lối vào cổng Gia đình. Nông dân không có phần ở đây - chương trình gắn với
        // CHỦ chuồng. Cờ tắt thì `loiVaoGiaDinh` tự trả rỗng mà không chạm DB.
        laKhach ? loiVaoGiaDinh(me.id) : Promise.resolve(KHONG_VAO_GIA_DINH),
      ])
    : [0, 0, 0, KHONG_VAO_GIA_DINH];
  return (
    <html lang="vi" className={`${sans.variable} ${display.variable}`}>
      <body>
        <ToastProvider>
          <div className="app-shell">
            <div className="topbar">
              {/* Logo đưa mỗi vai về ĐÚNG nhà của mình. Nông dân không phải khách hàng:
                  trang chủ mời "nhận nuôi chuồng", còn cổng của cô chú là hộp việc.
                  (Trang `/` cũng tự đá nông dân sang /nong-trai - đây chỉ là lớp đỡ để
                  không phải nhảy thêm một nhịp chuyển trang.) */}
              <Link href={me?.role === "WORKER" ? "/nong-trai" : "/"} className="flex items-center gap-2 font-bold text-[18px] tracking-tight no-underline">
                <span style={{ color: "var(--paddy)" }}>Chic</span><span style={{ color: "var(--yolk-deep)" }}>Chic</span>
              </Link>
              {me && <NotificationBell initialUnread={unread} />}
              {/* Nhãn "bản demo" chỉ đúng khi chạy cục bộ. Bản đã bán thì không được
                  tự nhận là demo - người trả tiền thật cần thấy một sản phẩm thật. */}
              {process.env.NODE_ENV !== "production" && (
                <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ color: "var(--ink-soft)", border: "1px solid var(--line)", background: "#fff" }}>Bản demo</span>
              )}
              <div className="ml-auto">
                {me ? (
                  <Link href={me.role === "WORKER" ? "/nong-trai" : "/tai-khoan"} aria-label="Tài khoản của tôi"
                    className="flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 no-underline"
                    style={{ border: "1px solid var(--line)", background: "#fff" }}>
                    <span className="grid place-items-center rounded-full font-bold text-[11.5px] flex-none"
                      style={{ width: 22, height: 22, background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                      {(me.name ?? me.email).trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="font-semibold text-[12.2px] max-w-[86px] truncate" style={{ color: "var(--ink)" }}>
                      {me.name ?? me.email.split("@")[0]}
                    </span>
                  </Link>
                ) : (
                  <Link href="/dang-nhap" className="font-semibold text-[12.6px] rounded-full px-3 py-1.5 no-underline"
                    style={{ background: "var(--paddy)", color: "#F7FBF4" }}>Đăng nhập</Link>
                )}
              </div>

              {/* Điều hướng dọc - chỉ hiện ở laptop. Nông dân có bộ mục riêng: cô chú
                  không "nhận nuôi chuồng" và không mua bán trên chợ. */}
              <SideNav
                items={
                  me?.role === "WORKER"
                    ? [
                        { href: "/nong-trai", label: "Hộp việc", icon: "📋" },
                        { href: "/nong-trai/ho-so", label: "Hồ sơ của tôi", icon: "🪪" },
                      ]
                    : [
                        { href: "/", label: "Trang chủ", icon: "🏡" },
                        { href: "/chuong", label: "Chuồng của tôi", icon: "🐔" },
                        { href: "/cho", label: "Chợ nông trại", icon: "🏪" },
                        // "Nhận chuồng" chỉ dành cho người CHƯA có chuồng nào. Với người
                        // đang nuôi, mục này nằm thường trực trong thanh điều hướng như
                        // một lời chào mời không tắt được - nhận thêm chuồng vẫn làm được
                        // (lối vào ở /tai-khoan), chỉ là thôi mời mọc.
                        ...(soChuong === 0 ? [{ href: "/nhan-chuong", label: "Nhận chuồng", icon: "💚" }] : []),
                        // ChicChic Gia đình - CHỈ hiện với người đã có gì đó ở đó (lời
                        // mời đang chờ · suất đang chạy · hồ sơ bé). Cờ tắt hoặc chưa
                        // được mời thì mục này không tồn tại: `/gia-dinh` không có đường
                        // tự đăng ký, nên bày nó ra cho mọi người là quảng cáo một chỗ
                        // họ không vào được. Huy hiệu đếm lời mời CHƯA trả lời.
                        ...(giaDinh.hien
                          ? [{ href: "/gia-dinh", label: "ChicChic Gia đình", icon: "👨‍👩‍👧", badge: giaDinh.loiMoi }]
                          : []),
                        // Giỏ hàng nằm THƯỜNG TRỰC, kể cả khi rỗng: đây cũng là nơi
                        // duy nhất người không nuôi chuồng nào điền được địa chỉ nhận
                        // hàng, mà thiếu địa chỉ thì không mua được gì (§11.46).
                        { href: "/cho/gio", label: "Giỏ hàng", icon: "🧺", badge: soGio },
                        { href: "/tai-khoan", label: "Tài khoản", icon: "👤" },
                      ]
                }
              />
            </div>

            {/* Bọc `children` lại: có trang trả về NHIỀU phần tử gốc (vd trang chủ trả
                `.screen` + `.dock`). Không bọc thì lưới ở laptop không biết xếp cái nào
                vào cột nào - và đó là kiểu vỡ chỉ lộ ra ở đúng một bậc màn hình. */}
            <main className="app-main">{children}</main>

            <footer className="app-footer px-4 pb-6 pt-2 text-center">
              <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                <b style={{ color: "var(--ink)" }}>ChicChic</b> - đặt mua trước nông sản + dịch vụ nuôi hộ.
                <br />Không phải kênh đầu tư · không cam kết lợi nhuận · tin xấu cũng báo thật.
              </div>
              <div className="text-[11px] mt-1.5" style={{ color: "var(--ink-soft)", opacity: .75 }}>
                Nông trại Ba Vì, Hà Nội{process.env.NODE_ENV !== "production" ? " · Bản demo PoC" : ""}
              </div>
            </footer>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
