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
import { demBaiDangCho } from "@/lib/bai-hoc";

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
  const [suats, treEm, baiDangCho] = await Promise.all([
    prisma.familyEnrollment.findMany({
      where: { parentId: me.id, status: { in: ["INVITED", "ACTIVE", "PAUSED"] } },
      orderBy: { invitedAt: "desc" },
      select: {
        id: true, status: true, cohortKey: true,
        barn: { select: { slug: true, label: true } },
        children: {
          where: { unlinkedAt: null },
          select: { child: { select: { nickname: true, avatarKey: true } } },
        },
      },
    }),
    prisma.childProfile.findMany({
      where: { parentId: me.id, status: { not: "DELETED" } },
      orderBy: { createdAt: "asc" },
      select: { id: true, nickname: true, ageBand: true, avatarKey: true, status: true },
    }),
    demBaiDangCho(me.id),
  ]);

  const loiMoi = suats.filter((s) => s.status === "INVITED");
  const dangThamGia = suats.filter((s) => s.status !== "INVITED");
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
                {/*
                  Chỉ nói con số, không hứa gì thêm: khu để bé mở bài là Epic 5. Một dòng
                  chữ nói thật vẫn hơn một cái nút chưa dẫn đi đâu (§9.2).
                */}
                {(baiDangCho.get(t.id) ?? 0) > 0 && (
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--paddy-deep)" }}>
                    ✨ {baiDangCho.get(t.id)} khoảnh khắc đang chờ bé
                  </div>
                )}
              </div>
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
        Khu khám phá của bé là Epic 5. Nói thẳng là chưa có, thay vì để một cái nút chết -
        §9.2 của repo: đừng vẽ ra thứ không làm được gì.
      */}
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
        Khu khám phá dành cho bé đang được dựng - đó là nơi bé mở những khoảnh khắc trên. Hồ
        sơ, lời mời và các khoảnh khắc bạn thấy ở đây đều sẽ sẵn sàng từ trước.
      </p>
    </div>
  );
}
