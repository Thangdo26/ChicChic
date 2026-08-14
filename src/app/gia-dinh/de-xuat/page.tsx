export const dynamic = "force-dynamic";
// Hàng chờ mong muốn của bé - phía cha mẹ (spec §15.1 `/gia-dinh/de-xuat`, Epic 6).
//
// ⚠️ Hai cửa, đúng thứ tự như `/gia-dinh`: **đăng nhập trước** (§9.5), rồi **cờ tổng**. Cờ
// tắt ⟹ `notFound()`, không phải một trang "tính năng đang tắt" (§11.51).
//
// ⚠️ Trang **chỉ đọc**. Mọi phép đổi trạng thái nằm ở ba server action, và cả ba đi qua cổng
// `moMongMuon` (sở hữu hồ sơ **và** sở hữu chuồng).
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { batFamily } from "@/lib/family";
import { avatarEmoji } from "@/lib/family-gates";
import { dsMongMuon } from "@/lib/de-xuat";
import DeXuatCard, { type DeXuatVM } from "@/components/DeXuatCard";

const NHAN_TRA_LOI: Record<string, string> = {
  REVIEWED: "đã ghi nhớ",
  DECLINED: "để lần sau",
};

export default async function DeXuatCuaBe() {
  const me = await requireUser("/gia-dinh/de-xuat");
  if (!batFamily()) notFound();

  const { dangCho, daTraLoi } = await dsMongMuon(me.id);

  // Mỗi loại một lối đi tiếp, và lối đó phải **có thật**: `DECOR_WISH` mở trang trang trí của
  // đúng chuồng đang đồng hành, `CURATED_FARM_QUESTION` mở hộp thư để cha mẹ tự hỏi cô chú.
  // App **không** tự gửi tin nào - review không kéo theo hành động người lớn (spec §16.2).
  const vm = (d: (typeof dangCho)[number]): DeXuatVM => ({
    id: d.id,
    kind: d.kind,
    emoji: d.m.emoji,
    choChaMe: d.m.choChaMe,
    nickname: d.be.nickname,
    beEmoji: avatarEmoji(d.be.avatarKey),
    ngay: d.createdAt.toLocaleDateString("vi-VN"),
    href: !d.barn
      ? null
      : d.kind === "DECOR_WISH"
        ? `/chuong/${d.barn.slug}/trang-tri`
        : d.kind === "CURATED_FARM_QUESTION"
          ? `/chuong/${d.barn.slug}/tin-nhan`
          : null,
    hrefNhan:
      d.kind === "DECOR_WISH"
        ? "Xem món này ở chuồng →"
        : d.kind === "CURATED_FARM_QUESTION"
          ? "Mở hộp thư hỏi cô chú →"
          : null,
  });

  return (
    <div className="screen">
      <Link href="/gia-dinh" className="text-[13px] no-underline" style={{ color: "var(--ink-soft)" }}>
        ‹ ChicChic Gia đình
      </Link>
      <h1 className="display text-[21px] mt-1.5">💌 Bé nhắn gì cho bạn</h1>
      <p className="lede mt-1.5">
        Bé chọn từ một danh sách có sẵn - không gõ chữ, và không thấy giá của bất cứ thứ gì.
        Bấm hay không bấm đều là quyết định của bạn.
      </p>

      {dangCho.length === 0 ? (
        <div className="card mt-3.5">
          <div className="text-[14px] font-semibold">Chưa có điều nào đang chờ</div>
          <p className="text-[13px] mt-1 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Khi bé nhắn một điều từ khu của mình, nó sẽ nằm ở đây.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5 mt-3.5">
          {dangCho.map((d) => <DeXuatCard key={d.id} d={vm(d)} />)}
        </div>
      )}

      {/*
        Những điều đã trả lời. Không có khối này thì bấm xong là mục biến mất không dấu vết,
        và cha mẹ không có cách nào biết mình đã trả lời cái gì - một hàng chờ chỉ có đường ra
        mà không có sổ.
      */}
      {daTraLoi.length > 0 && (
        <div className="mt-4">
          <h2 className="display text-[16px]">Bạn đã trả lời</h2>
          <div className="grid gap-2 mt-2">
            {daTraLoi.map((d) => (
              <div key={d.id} className="card text-[13px]" style={{ color: "var(--ink-soft)" }}>
                <span aria-hidden>{d.m.emoji}</span> {d.m.choChaMe}
                <b style={{ color: "var(--ink)" }}> · {NHAN_TRA_LOI[d.status] ?? "đã xem"}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[12.5px] mt-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Bé không biết bạn đã bấm gì ở đây - và điều đó là cố ý. Chuyện đáng kể cho bé nghe là
        chuyện xảy ra ngoài đời: một tấm ảnh cô chú gửi về, một món mới trước cửa chuồng, hay
        một buổi tối cả nhà cùng làm bếp.
      </p>
    </div>
  );
}
