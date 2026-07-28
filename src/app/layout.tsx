import type { Metadata } from "next";
import { Be_Vietnam_Pro, Lora } from "next/font/google";
import "./globals.css";

const sans = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const display = Lora({ subsets: ["vietnamese", "latin"], weight: ["500", "600", "700"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "ChicChic — nhận nuôi chuồng gà thật",
  description: "Nhận nuôi một chuồng gà thật ở quê, chăm qua app. Đặt mua trước nông sản + dịch vụ nuôi hộ — không phải đầu tư.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${display.variable}`}>
      <body>
        <div className="app-shell">
          <div className="topbar">
            <a href="/" className="flex items-center gap-2 font-bold text-[18px] tracking-tight no-underline">
              <span style={{ color: "var(--paddy)" }}>Chic</span><span style={{ color: "var(--yolk-deep)" }}>Chic</span>
            </a>
            <span className="text-[11px] font-semibold rounded-full px-2 py-0.5" style={{ color: "var(--ink-soft)", border: "1px solid var(--line)", background: "#fff" }}>Bản demo</span>
          </div>
          {children}
        </div>
      </body>
    </html>
  );
}
