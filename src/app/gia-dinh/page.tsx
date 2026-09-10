export const dynamic = "force-dynamic";
// Cổng của cha mẹ - ChicChic Gia đình (spec §15.1, Epic 2).
//
// ⚠️ Hai cửa, theo đúng thứ tự: **đăng nhập trước** (§9.5), rồi **cờ tổng**. Cờ tắt ⟹
// `notFound()` chứ không phải một trang "tính năng đang tắt": trang thứ hai vẫn là lời khoe
// rằng có gì đó sắp tới, mà kill switch tồn tại để **không lộ gì cả** (§11.51).
import Link from "next/link";
import EnterChildSpace from "@/components/be/EnterChildSpace";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { batFamily } from "@/lib/family";
import { avatarEmoji, canAssent } from "@/lib/family-gates";
import ChildAssentCard from "@/components/ChildAssentCard";
import FamilyInviteCard from "@/components/FamilyInviteCard";
import LearningSyncButton from "@/components/LearningSyncButton";
import { baoCaoTuan, demBaiDangCho } from "@/lib/bai-hoc";
import { cauTuanNay } from "@/lib/bai-hoc-meta";
import { demMongMuonCho } from "@/lib/de-xuat";
import { cauTamDung } from "@/lib/van-hanh-meta";

const TRANG_THAI_TRE: Record<string, string> = {
  DRAFT: "Còn chờ bé trả lời",
  ACTIVE: "Đang tham gia",
  CONSENT_WITHDRAWN: "Đã rút lời đồng ý",
  DELETION_PENDING: "Đang xoá",
  DELETED: "Đã xoá",
};

export default async function GiaDinh() {
  const me = await requireUser("/gia-dinh");
  if (me.role === "WORKER") redirect("/nong-trai");
  if (!batFamily()) notFound();

  // ⚠️ `demBaiDangCho` chỉ ĐẾM. Vẽ một trang không được sinh bài (§7.14): hai người mở cùng
  // lúc là hai lượt ghi DB đua nhau, nấp trong một lượt xem trang. Sinh bài là việc của nút
  // bấm bên dưới và của việc nền ban đêm.
  const [suats, treEm, baiDangCho, tuanNay, soMongMuon, chuongSanSang] = await Promise.all([
    prisma.familyEnrollment.findMany({
      where: { parentId: me.id, barn: { ownerId: me.id }, status: { in: ["INVITED", "ACTIVE", "PAUSED"] } },
      orderBy: { invitedAt: "desc" },
      select: {
        id: true, status: true, cohortKey: true, pauseReason: true,
        barn: { select: { slug: true, label: true } },
        children: {
          where: { unlinkedAt: null },
          select: { child: { select: { id: true, nickname: true, avatarKey: true } } },
        },
      },
    }),
    prisma.childProfile.findMany({
      where: { parentId: me.id, status: { not: "DELETED" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, nickname: true, ageBand: true, avatarKey: true, status: true },
    }),
    demBaiDangCho(me.id),
    baoCaoTuan(me.id),
    demMongMuonCho(me.id),
    prisma.barn.findMany({
      where: { ownerId: me.id, flock: { productLine: "LAYER", stage: { notIn: ["HARVESTED", "RETIRED"] },
        lifecycleRequests: { none: { choice: "MEAT", activeFlockId: { not: null } } } },
        familyEnrollments: { none: { barnLiveKey: { not: null } } },
        OR: [{ reservation: null }, { reservation: { paymentStatus: "CONFIRMED" } }] },
      select: { slug: true, label: true }, orderBy: { createdAt: "asc" }, take: 30,
    }),
  ]);

  const loiMoi = suats.filter((s) => s.status === "INVITED");
  const dangThamGia = suats.filter((s) => s.status !== "INVITED");
  const dangTamDung = suats.filter((s) => s.status === "PAUSED");
  // Bé nào ĐANG THẬT SỰ gắn với một chuồng đang chạy. Không có mối nối thì khu của bé đóng
  // (cùng năm điều kiện với `moKhuCuaBe`), nên bày nút vào đó là bày một cánh cửa dẫn tới
  // trang "không tìm thấy" - đúng loại nút chết §9.2 cấm.
  const beCoChuong = new Set(
    suats.filter((s) => s.status === "ACTIVE").flatMap((s) => s.children.map((c) => c.child.id)),
  );
  // Bé 7–8 tuổi đã có hồ sơ nhưng chưa được hỏi. Đây là bước duy nhất chặn giữa "tạo xong"
  // và "dùng được", nên nó phải nằm trên cùng, không nằm cuối trang.
  const canHoi = treEm.filter((t) => t.status === "DRAFT" && canAssent(t.ageBand));

  const hoSoChon = treEm.map((t) => ({
    id: t.id,
    nickname: t.nickname,
    emoji: avatarEmoji(t.avatarKey),
    sanSang: t.status === "ACTIVE",
  }));

  return (
    <div className="screen">
      <h1 className="display text-[21px]">👨‍👩‍👧 ChicChic Gia đình</h1>
      <p className="lede mt-1.5">
        Nơi bé theo dõi một đàn gà thật, và bạn giữ toàn quyền quyết định.
      </p>
      <div className="family-welcome mt-4">
        <span className="eyebrow">Một hành trình của cả nhà</span>
        <h2 className="display text-[23px] mt-2">Lớn lên cùng những điều nhỏ xíu 🌱</h2>
        <p className="text-sm mt-2 leading-relaxed">Gọi tên một bạn gà, xem khoảnh khắc cô chú gửi về, rồi cùng con kể lại điều đã khám phá.</p>
        <ol className="grid gap-2 mt-4 text-sm sm:grid-cols-3">
          <li><b>01 · Hồ sơ của bé</b><br />Biệt danh, nhóm tuổi và lời đồng ý.</li>
          <li><b>02 · Chọn chuồng</b><br />Bạn xác nhận, hành trình mở ngay.</li>
          <li><b>03 · Cùng khám phá</b><br />Chạm vào gà, xem bài và nhắn bố mẹ.</li>
        </ol>
        {treEm.length === 0 && <Link href="/gia-dinh/tre-moi" className="btn btn-primary mt-4 no-underline">Tôi là phụ huynh · Bắt đầu cho bé →</Link>}
      </div>
      {chuongSanSang.length > 0 && (
        <section className="grid gap-3 mt-5">
          <h2 className="display text-lg">Mở hành trình cho bé</h2>
          {chuongSanSang.map((b) => <FamilyInviteCard key={b.slug} barnSlug={b.slug} barnLabel={b.label} hoSo={hoSoChon} />)}
        </section>
      )}
      {chuongSanSang.length === 0 && suats.length === 0 && (
        <div className="soft mt-4 text-sm leading-relaxed">Hành trình dành cho chuồng gà đẻ đã hoàn tất cọc. Bạn có thể tạo hồ sơ trước, rồi chọn chuồng khi sẵn sàng.<br /><Link href="/nhan-chuong" className="font-semibold">Tìm chuồng gà đẻ cho gia đình →</Link></div>
      )}

      {canHoi.length > 0 && (
        <div className="grid gap-2.5 mt-3.5">
          {canHoi.map((t) => (
            <ChildAssentCard key={t.id} childId={t.id} nickname={t.nickname}
              emoji={avatarEmoji(t.avatarKey)} />
          ))}
        </div>
      )}

      {loiMoi.length > 0 && (
        <div className="grid gap-2.5 mt-3.5">
          {loiMoi.map((s) => (
            <FamilyInviteCard key={s.id} enrollmentId={s.id} barnLabel={s.barn.label}
              cohortKey={s.cohortKey} hoSo={hoSoChon} />
          ))}
        </div>
      )}

      {/*
        Suất đang tạm dừng (Epic 7 · spec §22.3).

        ⚠️ **Nói TO, không nói nhỏ.** Lúc suất dừng thì nút "Vào khu của bé" biến mất, và một
        cánh cửa biến mất không kèm lời giải thích là cách chắc chắn nhất để một gia đình
        nghĩ app hỏng - hoặc tệ hơn, nghĩ đàn gà có chuyện. Câu ở đây là **đúng câu người
        trực đã chọn** ở `/admin`, không phải một bản viết lại: hai bên phải nhìn thấy cùng
        một chữ, nếu không thì lúc gia đình gọi điện hỏi, người trực lại đi đoán.
      */}
      {dangTamDung.map((s) => (
        <div key={s.id} className="card mt-3.5"
          style={{ background: "#FCF3E8", border: "1px solid #F0D9B4" }}>
          <div className="text-[14px] font-semibold" style={{ color: "#7a4d1a" }}>
            ⏸️ {s.barn.label} · phần học cùng con đang tạm nghỉ
          </div>
          <p className="text-[12.8px] mt-1 leading-relaxed" style={{ color: "#7a4d1a" }}>
            {cauTamDung(s.pauseReason)}
          </p>
          <p className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: "#7a4d1a" }}>
            Trong lúc này bé chưa vào khu của mình được. Những gì bé đã xem <b>vẫn còn nguyên</b>,
            và <b>lời hứa nghỉ hưu của đàn không đổi</b>.
          </p>
        </div>
      ))}

      {dangThamGia.length > 0 && (
        <div className="grid gap-2 mt-3.5">
          <h2 className="display text-[16px]">Chuồng đang đồng hành</h2>
          {dangThamGia.map((s) => (
            <Link key={s.id} href={`/chuong/${s.barn.slug}`}
              className="card flex items-center gap-2 no-underline">
              <span className="text-[22px]">🌾</span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{s.barn.label}</div>
                <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                  {s.children.length > 0
                    ? `Cùng ${s.children.map((c) => c.child.nickname).filter(Boolean).join(", ")}`
                    : "Chưa gắn bé nào"}
                  {s.status === "PAUSED" && " · đang tạm dừng"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {dangThamGia.filter((s) => s.status === "ACTIVE").map((s) => {
        const remaining = hoSoChon.filter((h) => !s.children.some((c) => c.child.id === h.id));
        return remaining.some((h) => h.sanSang) ? <div key={s.id} className="mt-3"><FamilyInviteCard enrollmentId={s.id} barnLabel={s.barn.label} hoSo={remaining} /></div> : null;
      })}

      {/*
        Mong muốn bé gửi (Epic 6). Hiện **cả khi rỗng** miễn là có bé đang tham gia: đây cũng
        là nơi duy nhất tra lại mình đã trả lời gì, và một lối vào chỉ xuất hiện khi có việc
        thì người ta không bao giờ học được là nó ở đâu.
      */}
      {treEm.some((t) => t.status === "ACTIVE") && (
        <Link href="/gia-dinh/de-xuat" className="card mt-3.5 flex items-center gap-2 no-underline">
          <span className="text-[22px]">💌</span>
          <div>
            <div className="text-[14px] font-semibold">Bé nhắn gì cho bạn</div>
            <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
              {soMongMuon > 0
                ? `${soMongMuon} điều đang chờ bạn trả lời`
                : "Chưa có điều nào đang chờ"}
            </div>
          </div>
          {soMongMuon > 0 && (
            <span className="ml-auto text-[12px] font-bold rounded-full px-2 py-0.5"
              style={{ background: "var(--yolk-tint)", color: "var(--yolk-deep)" }}>
              {soMongMuon}
            </span>
          )}
        </Link>
      )}

      {/*
        "Tuần này con đã khám phá" (spec §18.2).

        ⚠️⚠️ **Đây KHÔNG phải bảng điểm của một đứa trẻ.** Không phần trăm, không mục tiêu,
        không so tuần này với tuần trước, và tuyệt đối không so bé này với bé kia - hai anh em
        đọc chung màn hình này. Con số duy nhất ở đây trả lời "con đang tìm hiểu gì", để bạn
        có chuyện mà hỏi con lúc ăn cơm. Danh sách chữ cấm ở `TU_CAM_BAO_CAO`.
      */}
      {tuanNay.length > 0 && (
        <div className="mt-3.5">
          <h2 className="display text-[16px]">Tuần này ở nhà mình</h2>
          <div className="grid gap-2 mt-2">
            {tuanNay.map((t) => (
              <div key={t.childId} className="card">
                <div className="flex items-center gap-2">
                  <span className="text-[22px]" aria-hidden>{avatarEmoji(t.avatarKey)}</span>
                  <div className="text-[14px] font-semibold">{t.nickname}</div>
                </div>
                <p className="text-[13px] mt-1.5 leading-relaxed">{cauTuanNay(t)}</p>
                {t.tenBai.length > 0 && (
                  <ul className="text-[12.5px] mt-1.5 leading-relaxed pl-4"
                    style={{ color: "var(--ink-soft)", listStyle: "disc" }}>
                    {t.tenBai.map((ten, i) => <li key={i}>{ten}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2 mt-3.5">
        <h2 className="display text-[16px]">Hồ sơ của bé</h2>
        {treEm.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--ink-soft)" }}>
            Chưa có hồ sơ nào. Tạo một hồ sơ để bắt đầu - chỉ cần tên gọi ở nhà và nhóm tuổi.
          </p>
        ) : (
          treEm.map((t) => (
            <div key={t.id} className="card flex items-center gap-2">
              <span className="text-[24px]">{avatarEmoji(t.avatarKey)}</span>
              <div>
                <div className="text-[14px] font-semibold">{t.nickname}</div>
                <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                  {t.ageBand === "AGE_5_6" ? "5 – 6 tuổi" : "7 – 8 tuổi"} ·{" "}
                  {TRANG_THAI_TRE[t.status] ?? t.status}
                </div>
                {/* Số bài đang chờ - để cha mẹ biết có gì trong đó trước khi đưa máy cho bé. */}
                {(baiDangCho.get(t.id) ?? 0) > 0 && (
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--paddy-deep)" }}>
                    ✨ {baiDangCho.get(t.id)} khoảnh khắc đang chờ bé
                  </div>
                )}
              </div>
              {/*
                Lối vào khu của bé - **chỉ** cho hồ sơ còn hiệu lực. Rút lời đồng ý là nút này
                biến mất ngay, và trang bên kia cũng tự đóng: cùng một cổng, hai lớp (§9.40).
                Nút nằm ở đây chứ không ở đâu khác vì đường vào khu của bé bắt đầu từ tay cha
                mẹ (spec §10.3 bước 1).
              */}
              {t.status === "ACTIVE" && beCoChuong.has(t.id) && (
                <EnterChildSpace childId={t.id} />
              )}
            </div>
          ))
        )}
        <Link href="/gia-dinh/tre-moi" className="btn btn-primary no-underline">
          + Thêm hồ sơ cho bé
        </Link>
      </div>

      {/*
        Lối vào quyền riêng tư nằm ở trang chính, không giấu trong menu con. Rút lại và xoá
        phải dễ tìm đúng bằng lúc đăng ký - nếu không thì "bạn rút lúc nào cũng được" chỉ là
        một câu nói.
      */}
      <Link href="/gia-dinh/quyen-rieng-tu"
        className="card mt-3.5 flex items-center gap-2 no-underline">
        <span className="text-[22px]">🔒</span>
        <div>
          <div className="text-[14px] font-semibold">Quyền riêng tư của bé</div>
          <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
            Xem ChicChic giữ gì · rút lời đồng ý · xoá hẳn dữ liệu
          </div>
        </div>
      </Link>

      {/*
        Cổng đồng bộ (spec §14.5). Việc nền ban đêm đã dựng sẵn phần lớn; nút này để cha mẹ
        kéo ngay sau khi cô chú vừa làm xong một việc, thay vì chờ tới sáng mai.
      */}
      {dangThamGia.length > 0 && treEm.some((t) => t.status === "ACTIVE") && (
        <div className="card mt-3.5">
          <div className="text-[14px] font-semibold">✨ Khoảnh khắc học của bé</div>
          <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Mỗi việc thật ở chuồng - cô chú cho ăn, đàn qua chặng mới, mẻ trứng đầu tiên - mở
            ra một điều để bé tìm hiểu. Nông trại tự dựng sẵn mỗi đêm; bấm nút này nếu bạn
            muốn tìm ngay.
          </p>
          <div className="mt-2.5">
            <LearningSyncButton />
          </div>
        </div>
      )}

      <p className="text-[12.5px] mt-3.5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Khu của bé mở bằng nút bên trên. Ra khỏi đó phải gõ lại mật khẩu của bạn - để bé
        không lạc sang phần có chuồng, chợ và hoá đơn.
      </p>
    </div>
  );
}
