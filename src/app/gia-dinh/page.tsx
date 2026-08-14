export const dynamic = "force-dynamic";
// Cổng của cha mẹ - ChicChic Gia đình (spec §15.1, Epic 2).
//
// ⚠️ Hai cửa, theo đúng thứ tự: **đăng nhập trước** (§9.5), rồi **cờ tổng**. Cờ tắt ⟹
// `notFound()` chứ không phải một trang "tính năng đang tắt": trang thứ hai vẫn là lời khoe
// rằng có gì đó sắp tới, mà kill switch tồn tại để **không lộ gì cả** (§11.51).
import Link from "next/link";
import { notFound } from "next/navigation";
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

const TRANG_THAI_TRE: Record<string, string> = {
  DRAFT: "Còn chờ bé trả lời",
  ACTIVE: "Đang tham gia",
  CONSENT_WITHDRAWN: "Đã rút lời đồng ý",
  DELETION_PENDING: "Đang xoá",
  DELETED: "Đã xoá",
};

export default async function GiaDinh() {
  const me = await requireUser("/gia-dinh");
  if (!batFamily()) notFound();

  // ⚠️ `demBaiDangCho` chỉ ĐẾM. Vẽ một trang không được sinh bài (§7.14): hai người mở cùng
  // lúc là hai lượt ghi DB đua nhau, nấp trong một lượt xem trang. Sinh bài là việc của nút
  // bấm bên dưới và của việc nền ban đêm.
  const [suats, treEm, baiDangCho, tuanNay, soMongMuon] = await Promise.all([
    prisma.familyEnrollment.findMany({
      where: { parentId: me.id, status: { in: ["INVITED", "ACTIVE", "PAUSED"] } },
      orderBy: { invitedAt: "desc" },
      select: {
        id: true, status: true, cohortKey: true,
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
  ]);

  const loiMoi = suats.filter((s) => s.status === "INVITED");
  const dangThamGia = suats.filter((s) => s.status !== "INVITED");
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
                <Link href={`/be/${t.id}`} className="btn btn-ghost btn-sm no-underline ml-auto">
                  Vào khu của bé →
                </Link>
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
