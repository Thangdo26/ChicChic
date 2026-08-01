import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Be_Vietnam_Pro, Lora } from "next/font/google";
import { ToastProvider } from "@/components/Toast";
import NotificationBell from "@/components/NotificationBell";
import { getSessionUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notify";
import "./globals.css";

const sans = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const display = Lora({ subsets: ["vietnamese", "latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "ChicChic — nhận nuôi chuồng gà thật",
  description: "Nhận nuôi một chuồng gà thật ở quê, chăm qua app. Đặt mua trước nông sản + dịch vụ nuôi hộ — không phải đầu tư.",
  openGraph: {
    title: "ChicChic — nhận nuôi chuồng gà thật",
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
  const me = await getSessionUser();
  // Danh sách ban đầu cho chuông — chưa đăng nhập thì khỏi hỏi DB.
  const notifications = me ? await listNotifications(me.id) : [];
  return (
    <html lang="vi" className={`${sans.variable} ${display.variable}`}>
      <body>
        <ToastProvider>
          <div className="app-shell">
            <div className="topbar">
              <Link href="/" className="flex items-center gap-2 font-bold text-[18px] tracking-tight no-underline">
                <span style={{ color: "var(--paddy)" }}>Chic</span><span style={{ color: "var(--yolk-deep)" }}>Chic</span>
              </Link>
              {me && <NotificationBell initialList={notifications} />}
              <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ color: "var(--ink-soft)", border: "1px solid var(--line)", background: "#fff" }}>Bản demo</span>
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
            </div>
            {children}
            <footer className="px-4 pb-6 pt-2 text-center">
              <div className="text-[11.5px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                <b style={{ color: "var(--ink)" }}>ChicChic</b> — đặt mua trước nông sản + dịch vụ nuôi hộ.
                <br />Không phải kênh đầu tư · không cam kết lợi nhuận · tin xấu cũng báo thật.
              </div>
              <div className="text-[11px] mt-1.5" style={{ color: "var(--ink-soft)", opacity: .75 }}>
                Nông trại Ba Vì, Hà Nội · Bản demo PoC
              </div>
            </footer>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
