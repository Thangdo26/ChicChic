export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Coop, FarmerAvatar } from "@/components/Illustrations";
import { getSessionUser } from "@/lib/auth";
import { farmProof, featuredWorkers } from "@/lib/workers";
import { loiVaoChuong } from "@/lib/showcase";

/**
 * Bốn lời hứa của trang chủ - và **mỗi lời hứa mở ra được một trang có dữ liệu thật**.
 *
 * Trước bản này cả bốn là chữ chết. Đó là lỗi nặng hơn "thiếu tiện lợi": sản phẩm này
 * được dựng để không giống một cái app đa cấp, mà thứ phân biệt hai bên **không phải
 * lời khẳng định** - bên nào cũng khẳng định được - mà là *khẳng định có mở ra xem
 * được hay không*. Bốn dòng không bấm được ở ngay màn đầu tiên là bốn dòng đúng giọng
 * của bên kia.
 *
 * `di` nhận slug chuồng để bấm vào (`lib/showcase.loiVaoChuong`): chuồng của chính
 * người đang xem nếu họ có, không thì chuồng trưng bày - nay khách vãng lai cũng mở
 * được (§9.5 đã nới).
 */
const TRUST = (slug: string | null) => [
  {
    ic: "📷", t: "Ảnh & video thật mỗi ngày",
    p: "Mở app là thấy hiện trạng chuồng hôm nay - do chính người chăm chụp, có đóng dấu tên.",
    di: slug && `/chuong/${slug}/nhat-ky`, cta: "Xem ảnh đã gửi về",
  },
  {
    ic: "🎨", t: "Bạn tự xếp, nông dân lắp thật",
    p: "Kéo biển tên, chậu cây, ổ đẻ… tới đúng chỗ bạn muốn. Lắp xong nhận ảnh chứng minh.",
    di: slug && `/chuong/${slug}`, cta: "Xem một chuồng đã trang trí",
  },
  {
    ic: "🏡", t: "Farm có thật, địa chỉ thật",
    p: "Xem được lô nuôi, nhật ký chăm sóc và mã QR truy xuất của chính chuồng bạn.",
    di: slug && `/chuong/${slug}/truy-xuat`, cta: "Mở hồ sơ truy xuất",
  },
  {
    ic: "🧾", t: "Giá minh bạch từng đồng",
    p: "Đây là đặt mua trước nông sản + nuôi hộ. Không phải đầu tư, không hứa lợi nhuận.",
    // Bảng giá nằm trong màn nhận chuồng - chỗ DUY NHẤT in đủ từng khoản.
    di: "/nhan-chuong", cta: "Xem bảng giá từng khoản",
  },
];

export default async function Home() {
  // Trang này là lời mời NHẬN NUÔI - dành cho khách và chủ chuồng. Nông dân không mua
  // dịch vụ của chính mình, nên đá thẳng sang hộp việc, cùng luật với /chuong và /tai-khoan.
  // Tài khoản đang tạm dừng vẫn an toàn: /nong-trai đá tiếp sang /tai-khoan, không thành vòng lặp.
  const me = await getSessionUser();
  if (me?.role === "WORKER") redirect("/nong-trai");

  const [faces, proof, vao] = await Promise.all([
    featuredWorkers(3), farmProof(), loiVaoChuong(me?.id ?? null),
  ]);

  // Trước bản này nút này luôn trỏ về `/chuong`, mà `/chuong` bắt đăng nhập ⟹ với
  // khách vãng lai "👀 Xem thử một chuồng đang nuôi" mở ra… màn đăng nhập. Nay nó đi
  // thẳng vào một chuồng thật xem được (§9.5 đã nới).
  const peekHref = vao.cuaToi ? "/chuong" : vao.slug ? `/chuong/${vao.slug}` : "/chuong";
  const peekLabel = vao.cuaToi ? "🐔 Xem chuồng của tôi" : "👀 Xem thử một chuồng";
  const rows = TRUST(vao.slug);

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
          Nhận nuôi một <span style={{ color: "var(--paddy)" }}>chuồng gà thật</span> ở quê - chăm qua app.
        </h1>
        <p className="lede">
          Bạn chọn chuồng, đặt tên, trang trí, chọn cách cho ăn. Các cô chú nông dân chăm giúp và gửi ảnh/video thật.
          Đến kỳ, bạn nhận trứng hoặc gà thật.
        </p>

        <div className="grid gap-2 mt-3.5">
          {rows.map((r) => {
            const noiDung = (
              <>
                <div className="trust-ic">{r.ic}</div>
                <div className="min-w-0 flex-1">
                  <b className="text-[14px]">{r.t}</b>
                  <p className="mt-0.5 text-[12.8px]" style={{ color: "var(--ink-soft)" }}>{r.p}</p>
                  {r.di && (
                    <span className="inline-block mt-1 text-[12.2px] font-semibold" style={{ color: "var(--paddy)" }}>
                      {r.cta} ›
                    </span>
                  )}
                </div>
              </>
            );
            // Không có chuồng trưng bày nào trong DB thì để nguyên dạng chữ, đừng dựng
            // một cái link chết trỏ vào `/chuong/null`.
            return r.di ? (
              <Link key={r.t} href={r.di} className="trust-row no-underline" style={{ color: "inherit" }}>
                {noiDung}
              </Link>
            ) : (
              <div key={r.t} className="trust-row">{noiDung}</div>
            );
          })}
        </div>

        {/* MẶT THẬT - đọc từ hồ sơ nông dân trong DB, không phải nhân vật viết cứng.
            Chỉ hiện cô chú đã đồng ý lên hình (consentMedia).
            Bấm được vào từng người: "người thật" mà không mở ra xem được thì vẫn chỉ là
            một dòng chữ - /nong-dan/[id] mở phần giới thiệu cho cả khách chưa đăng nhập. */}
        {faces.length > 0 && (
          <div className="mt-3.5 rounded-[14px] p-2.5" style={{ background: "#fff", border: "1px dashed var(--clay)" }}>
            <div className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Những người thật đang chăm chuồng
            </div>
            {faces.map((f) => (
              <Link
                key={f.id}
                href={`/nong-dan/${f.id}`}
                className="flex items-center gap-2.5 py-1.5 no-underline"
              >
                <div className="avatar w-[38px] h-[38px] flex-none overflow-hidden">
                  {f.photoUrl
                    ? <img src={f.photoUrl} alt={f.name} className="w-full h-full object-cover" />
                    : <FarmerAvatar />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[13.5px] truncate" style={{ color: "var(--ink)" }}>
                    {f.name} · {f.age ? `${f.age} tuổi · ` : ""}{f.yearsExp} năm nuôi gà
                  </div>
                  <small style={{ color: "var(--ink-soft)" }}>
                    {f.area}{f.barns > 0 ? ` · đang chăm ${f.barns} chuồng` : ""}
                  </small>
                </div>
                <span className="flex-none font-semibold text-[14px]" style={{ color: "var(--paddy)" }}>›</span>
              </Link>
            ))}
            <div className="text-[11.4px] mt-1 pt-1.5 text-center" style={{ color: "var(--ink-soft)", borderTop: "1px solid var(--line-soft)" }}>
              Bấm vào một cô/chú để xem hồ sơ và ảnh tự giới thiệu
            </div>
          </div>
        )}

        {/* Số liệu sống - kẻ lừa đảo không có nông dân thật và không có ảnh chụp hằng ngày. */}
        {proof.barns > 0 && (
          <p className="text-[12.2px] mt-2 text-center" style={{ color: "var(--ink-soft)" }}>
            <b style={{ color: "var(--ink)" }}>{proof.workers}</b> cô chú đang chăm{" "}
            <b style={{ color: "var(--ink)" }}>{proof.barns}</b> chuồng ·{" "}
            <b style={{ color: "var(--ink)" }}>{proof.media}</b> ảnh/video đã gửi về cho các chủ chuồng
          </p>
        )}

        <Link href={peekHref} className="btn btn-ghost mt-3 no-underline">
          {peekLabel}
        </Link>

        {/* ---------- Chợ nông trại ----------
            Chỉ hiện cho người đã đăng nhập: `/cho` bắt đầu bằng `requireUser`, nên với
            khách thì nút này chỉ dẫn tới màn đăng nhập - mời một người chưa có tài khoản
            đi xem chợ là hứa một thứ họ chưa dùng được.

            Đặt DƯỚI nút "xem chuồng của tôi" là có chủ ý: trang chủ vẫn là lời mời nhận
            nuôi, chợ là chỗ đi sau khi đã có chuồng. Đảo lên trên là nói với người mới
            rằng đây là chỗ mua bán, trong khi cả sản phẩm được dựng quanh việc nuôi. */}
        {me && (
          <Link href="/cho" className="card flex items-center gap-3 mt-2.5 no-underline">
            <span className="flex-none text-[18px]">🏪</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[13.8px]" style={{ color: "var(--ink)" }}>Chợ nông trại</div>
              <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                Bận không nhận được trứng? Chuyển lại cho người khác - hoặc mua thêm từ chuồng bạn bè.
              </div>
            </div>
            <span className="flex-none font-semibold text-[14px]" style={{ color: "var(--paddy)" }}>›</span>
          </Link>
        )}

        {!me && (
          <p className="text-[11.8px] mt-2 text-center" style={{ color: "var(--ink-soft)" }}>
            Chuồng ở trên là chuồng <b>xem thử</b> - mở tự do. Chuồng của từng người thì riêng tư,
            cần đăng nhập.
          </p>
        )}
      </div>

      <div className="dock">
        {/* Người ĐANG nuôi thì nút chính đưa họ vào chuồng, không mời mua thêm: trang
            chủ vẫn là lời mời nhận nuôi, nhưng chỉ với người chưa nhận. */}
        {vao.cuaToi ? (
          <Link href="/chuong" className="btn btn-primary no-underline">🐔 Vào chuồng của tôi →</Link>
        ) : me ? (
          <Link href="/nhan-chuong" className="btn btn-primary no-underline">Bắt đầu nhận một chuồng →</Link>
        ) : (
          <Link href="/dang-ky?next=%2Fnhan-chuong" className="btn btn-primary no-underline">Tạo tài khoản & nhận chuồng →</Link>
        )}
      </div>
    </>
  );
}
