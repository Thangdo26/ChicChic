export const dynamic = "force-dynamic";
import Link from "next/link";
import { Coop, FarmerAvatar } from "@/components/Illustrations";
import { getSessionUser } from "@/lib/auth";

const TRUST = [
  { ic: "📷", t: "Ảnh & video thật mỗi ngày", p: "Mở app là thấy hiện trạng chuồng hôm nay — do chính người chăm chụp, có đóng dấu tên." },
  { ic: "🎨", t: "Bạn tự xếp, nông dân lắp thật", p: "Kéo biển tên, chậu cây, ổ đẻ… tới đúng chỗ bạn muốn. Lắp xong nhận ảnh chứng minh." },
  { ic: "🏡", t: "Farm có thật, địa chỉ thật", p: "Xem được lô nuôi, nhật ký chăm sóc và mã QR truy xuất của chính chuồng bạn." },
  { ic: "🧾", t: "Giá minh bạch từng đồng", p: "Đây là đặt mua trước nông sản + nuôi hộ. Không phải đầu tư, không hứa lợi nhuận." },
];

export default async function Home() {
  const me = await getSessionUser();
  const isWorker = me?.role === "WORKER";

  // Người nhận nuôi đi qua /chuong: có chuồng thì chọn chuồng, chưa có thì được mời nhận chuồng đầu tiên.
  // Khách chưa đăng nhập cũng qua đó — requireUser sẽ đưa về /dang-nhap rồi quay lại đúng chỗ.
  const peekHref = isWorker ? "/chuong/demo" : "/chuong";
  const peekLabel = me && !isWorker ? "🐔 Xem chuồng của tôi" : "👀 Xem thử một chuồng đang nuôi";

  return (
    <>
      <div className="screen">
        <div className="coopwrap">
          <span className="pill">🐔 Nông trại thật · nông sản thật · người thật</span>
          <div className="mt-1.5">
            <Coop
              label="Nhà mình"
              decor={[
                { svgKey: "bien", x: 120, y: 56 },
                { svgKey: "den", x: 168, y: 44 },
                { svgKey: "cay", x: 34, y: 132, scale: 1.05 },
                { svgKey: "orom", x: 76, y: 142, scale: 0.9 },
                { svgKey: "chong", x: 206, y: 56, scale: 0.9 },
              ]}
            />
          </div>
        </div>

        <h1 className="display text-[29px] leading-[1.12] tracking-tight font-bold mt-4 mb-2">
          Nhận nuôi một <span style={{ color: "var(--paddy)" }}>chuồng gà thật</span> ở quê — chăm qua app.
        </h1>
        <p className="lede">
          Bạn chọn chuồng, đặt tên, trang trí, chọn cách cho ăn. Các cô chú nông dân chăm giúp và gửi ảnh/video thật.
          Đến kỳ, bạn nhận trứng hoặc gà thật.
        </p>

        <div className="grid gap-2 mt-3.5">
          {TRUST.map((r) => (
            <div key={r.t} className="trust-row">
              <div className="trust-ic">{r.ic}</div>
              <div><b className="text-[14px]">{r.t}</b><p className="mt-0.5 text-[12.8px]" style={{ color: "var(--ink-soft)" }}>{r.p}</p></div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5 mt-3.5 rounded-[14px] p-2.5" style={{ background: "#fff", border: "1px dashed var(--clay)" }}>
          <div className="avatar w-[38px] h-[38px] flex-none"><FarmerAvatar /></div>
          <div><div className="font-semibold text-[13.5px]">Cô Lan · 8 năm nuôi gà thả vườn</div><small style={{ color: "var(--ink-soft)" }}>Đang chăm nhiều chuồng cho các bạn trên ChicChic</small></div>
        </div>

        <Link href={peekHref} className="btn btn-ghost mt-3 no-underline">
          {peekLabel}
        </Link>
        {!me && (
          <p className="text-[11.8px] mt-2 text-center" style={{ color: "var(--ink-soft)" }}>
            Chuồng là không gian riêng của từng người — cần đăng nhập để xem và để nhận nuôi.
          </p>
        )}
      </div>

      <div className="dock">
        {isWorker ? (
          <Link href="/nong-trai" className="btn btn-primary no-underline">👩‍🌾 Vào hộp việc của tôi →</Link>
        ) : me ? (
          <Link href="/nhan-chuong" className="btn btn-primary no-underline">Bắt đầu nhận một chuồng →</Link>
        ) : (
          <Link href="/dang-ky?next=%2Fnhan-chuong" className="btn btn-primary no-underline">Tạo tài khoản & nhận chuồng →</Link>
        )}
      </div>
    </>
  );
}
