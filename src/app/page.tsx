import Link from "next/link";
import { Coop, FarmerAvatar } from "@/components/Illustrations";

const TRUST = [
  { ic: "🏡", t: "Farm có thật, địa chỉ thật", p: "Xem được lô nuôi, nhật ký chăm sóc và mã QR truy xuất của chính chuồng bạn." },
  { ic: "👩‍🌾", t: "Người thật chăm, có tên tuổi", p: "Mỗi update do một cô/chú nông dân cụ thể thực hiện — không phải con số ảo." },
  { ic: "🧾", t: "Giá minh bạch từng đồng", p: "Đây là đặt mua trước nông sản + nuôi hộ. Không phải đầu tư, không hứa lợi nhuận." },
];

export default function Home() {
  return (
    <>
      <div className="screen">
        <div className="coopwrap">
          <span className="pill">🐔 Nông trại thật · nông sản thật · người thật</span>
          <div className="mt-1.5"><Coop /></div>
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
          <div className="avatar w-[38px] h-[38px]"><FarmerAvatar /></div>
          <div><div className="font-semibold text-[13.5px]">Cô Lan · 8 năm nuôi gà thả vườn</div><small style={{ color: "var(--ink-soft)" }}>Đang chăm 3 chuồng cho các bạn trên ChicChic</small></div>
        </div>
      </div>

      <div className="dock">
        <Link href="/nhan-chuong" className="btn btn-primary no-underline">Bắt đầu nhận một chuồng →</Link>
      </div>
    </>
  );
}
