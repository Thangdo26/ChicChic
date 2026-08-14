export const dynamic = "force-dynamic";
// Quyền riêng tư của bé (spec §15.1, §10.5, §17.3, §17.4).
//
// Trang này phải trả lời được ba câu, bằng chữ người thường đọc: **giữ gì · rút thế nào ·
// xoá thì mất gì**. Nó cũng là chỗ nói thẳng thứ dễ bị hiểu nhầm nhất: xoá dữ liệu của bé
// **không** đảo ngược cam kết đàn gà nghỉ hưu.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { batFamily, daXacMinhGanDay } from "@/lib/family";
import { CONSENT_VERSION, avatarEmoji } from "@/lib/family-gates";
import FamilyPrivacyForms from "@/components/FamilyPrivacyForms";

const TRANG_THAI: Record<string, string> = {
  DRAFT: "Còn chờ bé trả lời",
  ACTIVE: "Đang tham gia",
  CONSENT_WITHDRAWN: "Đã rút lời đồng ý",
  DELETION_PENDING: "Đang xoá",
};

export default async function QuyenRiengTu() {
  const me = await requireUser("/gia-dinh/quyen-rieng-tu");
  if (!batFamily()) notFound();
  if (!(await daXacMinhGanDay())) {
    redirect("/gia-dinh/xac-minh?next=%2Fgia-dinh%2Fquyen-rieng-tu");
  }

  const treEm = await prisma.childProfile.findMany({
    where: { parentId: me.id, status: { not: "DELETED" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, nickname: true, avatarKey: true, status: true },
  });

  return (
    <div className="screen">
      <Link href="/gia-dinh" className="text-[13px] no-underline" style={{ color: "var(--ink-soft)" }}>
        ← ChicChic Gia đình
      </Link>
      <h1 className="display text-[21px] mt-2">🔒 Quyền riêng tư của bé</h1>

      <div className="card mt-3">
        <h2 className="display text-[16px]">ChicChic đang giữ gì</h2>
        <ul className="text-[13px] mt-2 grid gap-1.5 leading-relaxed">
          <li>· Tên gọi ở nhà do bạn đặt.</li>
          <li>· Nhóm tuổi (5–6 hoặc 7–8).</li>
          <li>· Một hình đại diện chọn từ danh sách có sẵn.</li>
          <li>· Tiến độ những việc bé đã làm.</li>
        </ul>
        <p className="text-[13px] mt-2.5 rounded-[10px] px-2.5 py-2 leading-relaxed"
          style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
          Không ngày sinh · không trường lớp · không địa chỉ · không ảnh hay giọng nói của bé ·
          không quảng cáo · không chia sẻ cho nông dân hay bên thứ ba.
        </p>
        <p className="text-[12px] mt-2" style={{ color: "var(--ink-soft)" }}>
          Bản cam kết {CONSENT_VERSION}.
        </p>
      </div>

      <div className="card mt-2.5">
        <h2 className="display text-[16px]">Ba việc khác nhau</h2>
        <p className="text-[13px] mt-1.5 leading-relaxed">
          <b>Rút lời đồng ý</b> - khu của bé đóng lại ngay, ChicChic dừng tạo nội dung mới và
          dừng gửi thông báo. Dữ liệu vẫn còn, bạn đổi ý lúc nào cũng được.
        </p>
        {/*
          Tải về được nói ra ở đây, không chỉ nằm dưới dạng một cái nút: §17.3 mục 5 đòi cha
          mẹ được **chọn** giữa xoá ngay và mang dữ liệu đi trước, mà một lựa chọn không ai
          kể cho bạn nghe thì không phải là một lựa chọn.
        */}
        <p className="text-[13px] mt-2 leading-relaxed">
          <b>Tải dữ liệu về máy</b> - một tệp gồm mọi thứ bên mình đang giữ về bé. Không đổi gì
          cả, tải bao nhiêu lần cũng được, và nên làm trước khi xoá.
        </p>
        <p className="text-[13px] mt-2 leading-relaxed">
          <b>Xoá hẳn</b> - tên gọi, hình và mọi thứ bé đã làm bị xoá, không lấy lại được.
        </p>
        <p className="text-[13px] mt-2.5 rounded-[10px] px-2.5 py-2 leading-relaxed"
          style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
          ⚠️ Cả hai việc trên <b>đều không</b> đổi những gì thuộc về nông trại: chuồng, đàn gà,
          ảnh các cô chú đã chụp, sổ thu hoạch và hoá đơn vẫn còn nguyên. Và{" "}
          <b>cam kết đàn gà nghỉ hưu ở nông trại vẫn giữ</b> - đàn ấy đã được hứa, nên lời hứa
          không mất theo dữ liệu.
        </p>
      </div>

      <FamilyPrivacyForms
        hoSo={treEm.map((t) => ({
          id: t.id,
          nickname: t.nickname || "(chưa đặt tên)",
          emoji: avatarEmoji(t.avatarKey),
          trangThai: TRANG_THAI[t.status] ?? t.status,
          daRut: t.status === "CONSENT_WITHDRAWN",
        }))}
      />
    </div>
  );
}
