// XUẤT DỮ LIỆU CỦA BÉ - Epic 7, spec §17.3 mục 5 ("cho cha mẹ chọn xoá ngay hoặc export trước").
//
// ⚠️ **CHỈ SERVER**, và **KHÔNG phải server action**: cùng khuôn với `lib/de-xuat.ts` và
// `lib/task-store.ts` - file này *tin* dữ liệu đưa vào, nên chỉ được gọi từ một action đã
// kiểm quyền xong. Cửa thật là `family-actions.taiDuLieuTre`.
//
// Vì sao đường này phải có: trước Epic 7 cha mẹ **xoá được nhưng không tải về được**, tức là
// "dữ liệu của bạn" mới đúng một nửa. Và nửa thiếu là nửa quan trọng hơn về mặt người dùng -
// một gia đình định rời chương trình mà biết cuốn album của con sẽ bốc hơi thì họ sẽ không
// xoá, họ sẽ chỉ bỏ đó. Xoá được một cách nhẹ nhõm là điều kiện để lời hứa về dữ liệu là thật.
import { prisma } from "@/lib/db";
import { batFamily } from "@/lib/family";
import { avatarEmoji } from "@/lib/family-gates";
import { timMongMuon } from "@/lib/de-xuat-meta";
import { CHU_DAN_XUAT } from "@/lib/van-hanh-meta";

const NHOM_TUOI: Record<string, string> = {
  AGE_5_6: "5 – 6 tuổi",
  AGE_7_8: "7 – 8 tuổi",
};

const VIEC_CONSENT: Record<string, string> = {
  GRANTED: "Bạn đồng ý cho bé tham gia",
  ASSENT_RECORDED: "Bé tự nói đồng ý",
  WITHDRAWN: "Bạn rút lời đồng ý",
  DELETE_REQUESTED: "Bạn yêu cầu xoá dữ liệu",
  DELETED: "Dữ liệu đã xoá xong",
};

const TRANG_THAI_BAI: Record<string, string> = {
  AVAILABLE: "đang chờ bé xem",
  STARTED: "bé đã mở, chưa xong",
  COMPLETED: "bé đã xem xong",
  ARCHIVED: "đã xếp lại",
};

const TRANG_THAI_MONG_MUON: Record<string, string> = {
  PENDING: "đang chờ bạn trả lời",
  REVIEWED: "bạn đã đồng ý",
  DECLINED: "bạn để lần sau",
  EXPIRED: "đã quá lâu, tự khép lại",
};

const gio = (d: Date | null | undefined): string | null =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;

/**
 * Gói dữ liệu của **một** bé.
 *
 * ⭐ **Mọi truy vấn trong hàm này đều lọc theo `childId` của đúng bé đó** - không có truy vấn
 * nào lấy "tất cả rồi lọc sau". Đây là một tệp sắp rời khỏi máy chủ và về máy của người dùng;
 * một dòng của nhà khác lọt vào đây thì không có cách nào gọi nó về.
 *
 * ⚠️ Hàm này **chỉ đọc**. Không `create`, không `update` - kể cả một dấu "đã tải lúc nào".
 * Ghi đo đạc là việc của action gọi nó, và cũng chỉ ghi `ageBand` (§17.5).
 */
export async function goiDuLieuTre(childId: string): Promise<Record<string, unknown> | null> {
  if (!batFamily() || !childId) return null;
  try {
    const be = await prisma.childProfile.findUnique({
      where: { id: childId },
      select: {
        id: true, nickname: true, ageBand: true, avatarKey: true, status: true,
        consentVersion: true, createdAt: true, withdrawnAt: true, deletedAt: true,
      },
    });
    if (!be) return null;

    const [consent, noi, bai, mongMuon] = await Promise.all([
      prisma.childConsentEvent.findMany({
        where: { childId: be.id },
        orderBy: { createdAt: "asc" },
        select: { action: true, policyVersion: true, purposes: true, childAssent: true, createdAt: true },
      }),
      prisma.childBarnLink.findMany({
        where: { childId: be.id },
        orderBy: { linkedAt: "asc" },
        select: {
          linkedAt: true, unlinkedAt: true,
          enrollment: {
            select: {
              status: true, cohortKey: true, programVersion: true, acceptedAt: true,
              barn: { select: { label: true } },
            },
          },
        },
      }),
      prisma.learningMoment.findMany({
        where: { childId: be.id },
        orderBy: { availableAt: "asc" },
        select: {
          unitKey: true, contentVersion: true, status: true, contentSnapshot: true,
          availableAt: true, startedAt: true, completedAt: true, missionDoneAt: true,
        },
      }),
      prisma.childSuggestion.findMany({
        where: { childId: be.id },
        orderBy: { createdAt: "asc" },
        select: { kind: true, optionKey: true, status: true, createdAt: true, reviewedAt: true },
      }),
    ]);

    return {
      docTruoc: CHU_DAN_XUAT,
      xuatLuc: new Date().toISOString(),
      be: {
        tenGoiONha: be.nickname,
        nhomTuoi: NHOM_TUOI[be.ageBand] ?? be.ageBand,
        hinhDaiDien: avatarEmoji(be.avatarKey),
        taoLuc: gio(be.createdAt),
        trangThai: be.status,
        banChinhSachDaKy: be.consentVersion,
        rutLoiDongYLuc: gio(be.withdrawnAt),
        xoaLuc: gio(be.deletedAt),
      },
      loiDongY: consent.map((c) => ({
        viec: VIEC_CONSENT[c.action] ?? c.action,
        banChinhSach: c.policyVersion,
        mucDich: c.purposes,
        beTuDongY: c.childAssent,
        luc: gio(c.createdAt),
      })),
      chuongDaTheoDoi: noi.map((n) => ({
        chuong: n.enrollment.barn.label,
        nhomPilot: n.enrollment.cohortKey,
        banChuongTrinh: n.enrollment.programVersion,
        trangThaiSuat: n.enrollment.status,
        giaDinhNhanLoiMoiLuc: gio(n.enrollment.acceptedAt),
        beGanVaoLuc: gio(n.linkedAt),
        beGoRaLuc: gio(n.unlinkedAt),
      })),
      nhungDieuDaHoc: bai.map((b) => ({
        ten: (b.contentSnapshot as { title?: string } | null)?.title ?? "Một điều mới",
        maBai: b.unitKey,
        banNoiDung: b.contentVersion,
        tinhTrang: TRANG_THAI_BAI[b.status] ?? b.status,
        hienRaLuc: gio(b.availableAt),
        beMoLuc: gio(b.startedAt),
        beXongLuc: gio(b.completedAt),
        viecCaNhaXongLuc: gio(b.missionDoneAt),
      })),
      dieuBeNhanChoBoMe: mongMuon.map((m) => ({
        // Chữ mà **chính bé đã đọc lúc bấm**, không phải khoá kỹ thuật. Khoá lạ (catalog đã
        // đổi từ hồi đó) rơi về chính khoá - thà một dòng khó đọc còn hơn một dòng biến mất.
        dieu: timMongMuon(m.optionKey)?.choBe ?? m.optionKey,
        loai: m.kind,
        tinhTrang: TRANG_THAI_MONG_MUON[m.status] ?? m.status,
        beNhanLuc: gio(m.createdAt),
        banTraLoiLuc: gio(m.reviewedAt),
      })),
    };
  } catch (e) {
    console.error("[xuat-du-lieu] không gói được dữ liệu của bé", e);
    return null;
  }
}
