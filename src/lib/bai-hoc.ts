// CHƯƠNG TRÌNH HỌC - phần chạm DB: biến sự kiện có thật ngoài đời thành bài học của bé.
//
// ⚠️ **CHỈ SERVER**, và **không phải server action** (không `"use server"`): giống
// `lib/family.ts` và `lib/su-kien.ts`, nó tin dữ liệu đưa vào và chỉ được gọi từ chỗ đã kiểm
// quyền xong - server action `dongBoKhoanhKhac` hoặc việc nền.
//
// ⭐ **ĐÂY LÀ ĐƯỜNG DUY NHẤT GHI `LearningMoment` và `LearningEventReceipt`** (§9.39).
//
// ⚠️ **KHÔNG BAO GIỜ gọi từ một Server Component.** Vẽ một trang không được ghi DB (§7.14):
// hai người mở cùng lúc là hai lượt sinh bài đua nhau, và một phép ghi nấp trong một lượt xem
// trang là thứ không ai tìm ra khi nó hỏng.
import { prisma } from "@/lib/db";
import { batFamily } from "@/lib/family";
import {
  type NhomTuoi, type TrangThaiBai, type TrangThaiTre,
  canEnterChildSpace, canViewMoment,
} from "@/lib/family-gates";
import {
  type LyDoBoQua, SO_NGAY_BAO_CAO, chonDonVi, chupNoiDung, locDuKien,
} from "@/lib/bai-hoc-meta";
import type { LoaiSuKien } from "@/lib/su-kien-meta";

/** Trần mỗi bé mỗi lượt. Một đàn im ắng cả tuần rồi bùng lên thì bé cũng không nhận 40 bài. */
export const TRAN_MOI_BE = 20;
/** Trần cho cả một lượt việc nền - giữ cho job đêm không kéo dài vô hạn (§14.5). */
export const TRAN_MOI_LUOT = 200;

export type KetQuaDongBo = { xet: number; taoBai: number; boQua: number; hong: number };
const RONG: KetQuaDongBo = { xet: 0, taoBai: 0, boQua: 0, hong: 0 };

/**
 * Sinh bài học cho những sự kiện chưa được xét.
 *
 * `parentId` có ⟹ chỉ trong phạm vi một gia đình (nút của cha mẹ, và cổng đồng bộ của khu bé
 * ở Epic 5). Không có ⟹ cả nông trại (việc nền ban đêm).
 *
 * **Bốn luật của hàm này**, theo đúng thứ tự quan trọng:
 *
 * ① **Một sự kiện sinh tối đa MỘT bài cho mỗi bé.** Chốt nằm ở `@@unique([childId,
 *    domainEventId])` dưới DB, không ở phép `if` nào tại đây - hai lượt đồng bộ song song
 *    (việc nền + nút của cha mẹ) là chuyện bình thường, và bên thua chỉ việc đi tiếp.
 *
 * ② **Chỉ lấy sự kiện xảy ra SAU `acceptedAt`** (§14.4). Chuồng đã nuôi cả năm trước khi gia
 *    đình tham gia; đổ hết quá khứ đó vào thành "nhật ký của bé" là dựng một lịch sử bé chưa
 *    từng sống. Ngoại lệ duy nhất là `FAMILY_ENROLLED` - nó xảy ra đúng tại `acceptedAt`, nên
 *    lọt vào một cách tự nhiên và cố ý: đó là bài chào.
 *
 * ③ **Bỏ qua cũng phải ghi lại.** Phần lớn sự kiện không thành bài; không ghi biên nhận thì
 *    mỗi đêm lại duyệt lại đúng những sự kiện đó, mãi mãi.
 *
 * ④ **Hỏng thì dừng ở một sự kiện, không kéo cả lượt xuống.** Việc của nông dân đã xong từ
 *    lâu và không liên quan gì tới đây (§14.6).
 */
export async function dungKhoanhKhac(input?: {
  parentId?: string;
  tranMoiBe?: number;
  tranMoiLuot?: number;
}): Promise<KetQuaDongBo> {
  if (!batFamily()) return RONG;

  const tranBe = Math.max(1, Math.min(input?.tranMoiBe ?? TRAN_MOI_BE, TRAN_MOI_BE));
  const tranLuot = Math.max(1, Math.min(input?.tranMoiLuot ?? TRAN_MOI_LUOT, TRAN_MOI_LUOT));

  // Bé đang tham gia × chuồng đang đồng hành. Bốn điều kiện, và thiếu bất cứ cái nào thì
  // không có bài nào được sinh: hồ sơ `ACTIVE` (rút consent là khoá ngay), mối nối chưa gỡ,
  // suất `ACTIVE`, và suất đã thật sự được nhận (`acceptedAt` khác null).
  const noi = await prisma.childBarnLink.findMany({
    where: {
      unlinkedAt: null,
      child: { status: "ACTIVE", ...(input?.parentId ? { parentId: input.parentId } : {}) },
      enrollment: { status: "ACTIVE", acceptedAt: { not: null } },
    },
    select: {
      childId: true,
      enrollmentId: true,
      child: { select: { ageBand: true } },
      enrollment: { select: { barnId: true, acceptedAt: true } },
    },
  });

  const ra: KetQuaDongBo = { xet: 0, taoBai: 0, boQua: 0, hong: 0 };

  for (const n of noi) {
    if (ra.xet >= tranLuot) break;
    const acceptedAt = n.enrollment.acceptedAt;
    if (!acceptedAt) continue;

    // `receipts: { none: … }` để DB tự loại sự kiện đã xét - đọc hết rồi lọc trong bộ nhớ là
    // kéo về cả bảng sự kiện của chuồng mỗi lượt.
    const suKien = await prisma.domainEvent.findMany({
      where: {
        barnId: n.enrollment.barnId,
        happenedAt: { gte: acceptedAt },
        receipts: { none: { childId: n.childId } },
      },
      orderBy: { happenedAt: "asc" },
      take: Math.min(tranBe, tranLuot - ra.xet),
      select: { id: true, type: true, payload: true },
    });

    for (const e of suKien) {
      ra.xet += 1;
      const payload = (e.payload ?? {}) as Record<string, unknown>;
      const chon = chonDonVi(e.type as LoaiSuKien, n.child.ageBand as NhomTuoi, payload);

      if (chon.chon === "bo") {
        if (await ghiBoQua(n.childId, e.id, chon.lyDo)) ra.boQua += 1;
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const bai = await tx.learningMoment.create({
            data: {
              childId: n.childId,
              domainEventId: e.id,
              enrollmentId: n.enrollmentId,
              unitKey: chon.unit.key,
              contentVersion: chon.unit.version,
              contentSnapshot: chupNoiDung(chon.unit),
              factSnapshot: locDuKien(payload),
            },
            select: { id: true },
          });
          await tx.learningEventReceipt.create({
            data: { childId: n.childId, domainEventId: e.id, status: "CREATED", momentId: bai.id },
          });
        });
        ra.taoBai += 1;
      } catch (err) {
        // `P2002` ở đây **không phải lỗi**: một lượt đồng bộ khác vừa sinh đúng bài này xong.
        // Đó chính là cách hai lượt song song được phép chạy mà không cần khoá gì.
        if (laTrungKhoa(err)) continue;
        console.error("[bai-hoc] không sinh được bài cho một sự kiện", { childId: n.childId, eventId: e.id }, err);
        ra.hong += 1;
        // ⚠️ Ghi `FAILED` nghĩa là **không tự thử lại**, và đó là chủ ý đã cân nhắc: hàng đợi
        // xếp theo `happenedAt` tăng dần, nên một sự kiện hỏng nằm ở đầu hàng sẽ chặn mọi sự
        // kiện sau nó, mỗi đêm, vĩnh viễn. Đổi lại nó hiện lên khối chẩn đoán ở `/admin` để
        // người thật nhìn thấy - xoá dòng biên nhận đó là lượt sau sinh lại.
        await ghiBoQua(n.childId, e.id, null, "FAILED");
      }
    }
  }
  return ra;
}

/**
 * Ghi biên nhận "đã xét sự kiện này rồi".
 *
 * `createMany({ skipDuplicates: true })` cùng lý do với hộp thư đi (§9.38): lượt đồng bộ song
 * song đâm vào cùng khoá là chuyện thường, và ở Postgres thì `create` + bắt `P2002` làm hỏng
 * cả transaction đang mở. Trả về `true` nếu dòng này là do mình ghi.
 */
async function ghiBoQua(
  childId: string,
  domainEventId: string,
  lyDo: LyDoBoQua | null,
  status: "SKIPPED" | "FAILED" = "SKIPPED",
): Promise<boolean> {
  try {
    const { count } = await prisma.learningEventReceipt.createMany({
      data: [{ childId, domainEventId, status, reason: lyDo ?? "loi-khi-sinh-bai" }],
      skipDuplicates: true,
    });
    return count > 0;
  } catch (e) {
    console.error("[bai-hoc] không ghi được biên nhận", { childId, domainEventId }, e);
    return false;
  }
}

function laTrungKhoa(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Bao nhiêu bài đang chờ mỗi bé - dùng để VẼ, không sinh gì. */
export async function demBaiDangCho(parentId: string): Promise<Map<string, number>> {
  if (!batFamily()) return new Map();
  try {
    const rows = await prisma.learningMoment.groupBy({
      by: ["childId"],
      where: { status: { in: ["AVAILABLE", "STARTED"] }, child: { parentId, status: "ACTIVE" } },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.childId, r._count._all]));
  } catch (e) {
    console.error("[bai-hoc] không đếm được bài đang chờ", e);
    return new Map();
  }
}

// ---------------------------------------------------------------------------
// Báo cáo tuần cho cha mẹ (Epic 6 · spec §18.2)
// ---------------------------------------------------------------------------

export type TuanCuaMotBe = {
  childId: string;
  nickname: string;
  avatarKey: string;
  soXong: number;
  soNhiemVu: number;
  dangCho: number;
  /** Tên vài bài gần nhất - để cha mẹ có chuyện mà hỏi con, không phải để chấm. */
  tenBai: string[];
};

/** Số tên bài in ra mỗi bé. Ba là đủ để bắt chuyện; nhiều hơn thì thành một bảng thống kê. */
const SO_TEN_BAI = 3;

/**
 * "Tuần này con đã khám phá gì" (spec §18.2).
 *
 * ⚠️ **CHỈ ĐỌC.** Hàm này chạy trong một Server Component, nên nó tuyệt đối không được ghi
 * gì - kể cả một dòng đo đạc (§7.14). Đó cũng là lý do repo **không có** `parent_report_viewed`
 * dù spec §17.5 có liệt: xem `lib/track.ts`.
 *
 * ⚠️ **Không xếp hạng, không so sánh** (§18.2). Trả về đúng bốn con số mô tả và vài cái tên;
 * không có "tuần trước", không có mục tiêu, không có phần trăm. Câu chữ nằm ở `cauTuanNay`.
 */
export async function baoCaoTuan(parentId: string): Promise<TuanCuaMotBe[]> {
  if (!batFamily() || !parentId) return [];
  const tu = new Date(Date.now() - SO_NGAY_BAO_CAO * 86_400_000);
  try {
    const treEm = await prisma.childProfile.findMany({
      where: { parentId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, nickname: true, avatarKey: true },
    });
    if (treEm.length === 0) return [];
    const ids = treEm.map((t) => t.id);

    // Ba phép gộp cho CẢ NHÀ, không phải ba phép cho mỗi bé: một nhà ba đứa con thì kiểu
    // kia là chín lượt đi-về cho một khối chữ nhỏ ở giữa trang (§10).
    const [xong, nhiemVu, cho, ganDay] = await Promise.all([
      prisma.learningMoment.groupBy({
        by: ["childId"],
        where: { childId: { in: ids }, status: "COMPLETED", completedAt: { gte: tu } },
        _count: { _all: true },
      }),
      prisma.learningMoment.groupBy({
        by: ["childId"],
        where: { childId: { in: ids }, missionDoneAt: { gte: tu } },
        _count: { _all: true },
      }),
      prisma.learningMoment.groupBy({
        by: ["childId"],
        where: { childId: { in: ids }, status: { in: ["AVAILABLE", "STARTED"] } },
        _count: { _all: true },
      }),
      prisma.learningMoment.findMany({
        where: { childId: { in: ids }, status: "COMPLETED", completedAt: { gte: tu } },
        orderBy: { completedAt: "desc" },
        take: SO_TEN_BAI * treEm.length,
        select: { childId: true, contentSnapshot: true },
      }),
    ]);

    const dem = (rows: { childId: string; _count: { _all: number } }[], id: string) =>
      rows.find((r) => r.childId === id)?._count._all ?? 0;

    return treEm.map((t) => ({
      childId: t.id,
      nickname: t.nickname,
      avatarKey: t.avatarKey,
      soXong: dem(xong, t.id),
      soNhiemVu: dem(nhiemVu, t.id),
      dangCho: dem(cho, t.id),
      tenBai: ganDay
        .filter((b) => b.childId === t.id)
        .slice(0, SO_TEN_BAI)
        .map((b) => (b.contentSnapshot as { title?: string } | null)?.title ?? "Một điều mới"),
    }));
  } catch (e) {
    console.error("[bai-hoc] không dựng được báo cáo tuần", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Khu của bé (Epic 5)
// ---------------------------------------------------------------------------

/** Bé + suất tham gia, sau khi đã qua cổng. `null` = không vào được, không nói vì sao. */
export type BeVaoDuoc = {
  id: string;
  nickname: string;
  ageBand: string;
  avatarKey: string;
  enrollmentId: string;
  barnId: string;
};

/**
 * ⭐ **CỔNG DUY NHẤT của khu dành cho bé** (§9.40). Mọi trang `/be/**` và mọi hành động của bé
 * đều phải đi qua đây - đừng viết bản thứ hai, §11.37 đã rò đúng vì hai bản chép tay lệch nhau.
 *
 * Năm điều kiện, và **thiếu một là đóng**: cờ tổng · cha mẹ sở hữu hồ sơ · hồ sơ `ACTIVE` (rút
 * consent khoá ngay) · có mối nối chưa gỡ · suất tham gia `ACTIVE`. Phép so cuối cùng nằm ở
 * `canEnterChildSpace` (thuần, đã phủ bảng đầy đủ từ Epic 2).
 *
 * ⚠️ **Đọc lại DB mỗi lần gọi, không nhớ đệm.** Cha mẹ rút consent trong lúc một tab của bé
 * đang mở là ca có thật, và cái tab đó phải đóng lại ở lần bấm kế tiếp.
 */
export async function moKhuCuaBe(parentId: string, childId: string): Promise<BeVaoDuoc | null> {
  if (!batFamily() || !parentId || !childId) return null;
  try {
    const be = await prisma.childProfile.findUnique({
      where: { id: childId },
      select: {
        id: true, parentId: true, status: true, nickname: true, ageBand: true, avatarKey: true,
        links: {
          where: { unlinkedAt: null, enrollment: { status: "ACTIVE", parentId, barn: { ownerId: parentId } } },
          orderBy: { linkedAt: "desc" },
          take: 1,
          select: { enrollmentId: true, enrollment: { select: { barnId: true } } },
        },
      },
    });
    if (!be) return null;
    const noi = be.links[0];
    const vao = canEnterChildSpace({
      featureEnabled: true, // `batFamily()` đã chốt ở dòng đầu
      ownsChild: be.parentId === parentId,
      childStatus: be.status as TrangThaiTre,
      consentActive: be.status === "ACTIVE",
      enrollmentActive: !!noi,
    });
    if (!vao || !noi) return null;
    return {
      id: be.id, nickname: be.nickname, ageBand: be.ageBand, avatarKey: be.avatarKey,
      enrollmentId: noi.enrollmentId, barnId: noi.enrollment.barnId,
    };
  } catch (e) {
    console.error("[bai-hoc] không mở được khu của bé - đóng lại", e);
    return null;
  }
}

export type BaiCuaBe = {
  parentId: string;
  be: BeVaoDuoc;
  bai: {
    id: string; unitKey: string; contentVersion: number; status: string;
    contentSnapshot: unknown; factSnapshot: unknown;
    missionDoneAt: Date | null; completion: unknown;
  };
};

/**
 * Mở một bài **của đúng bé đó** - cổng ở trên, cộng thêm phép so `momentChildId === childId`.
 *
 * Id trên thanh địa chỉ là thứ ai cũng sửa được (§9.6): không có phép so này thì đổi một chữ
 * trong URL là mở được nhật ký con nhà khác.
 */
export async function moBaiCuaBe(parentId: string, momentId: string): Promise<BaiCuaBe | null> {
  if (!batFamily() || !parentId || !momentId) return null;
  try {
    const bai = await prisma.learningMoment.findUnique({
      where: { id: momentId },
      select: {
        id: true, childId: true, unitKey: true, contentVersion: true, status: true,
        contentSnapshot: true, factSnapshot: true, missionDoneAt: true, completion: true,
      },
    });
    if (!bai) return null;
    const be = await moKhuCuaBe(parentId, bai.childId);
    if (!be) return null;
    if (!canViewMoment({
      vaoDuocKhuCuaBe: true, momentChildId: bai.childId, childId: be.id,
      momentStatus: bai.status as TrangThaiBai,
    })) return null;
    return { parentId, be, bai };
  } catch (e) {
    console.error("[bai-hoc] không mở được bài của bé - đóng lại", e);
    return null;
  }
}

/**
 * Đổi id ảnh trong dữ kiện thành đường dẫn ảnh thật.
 *
 * ⚠️ **Lọc theo `barnId` chứ không chỉ theo id ảnh.** `factSnapshot` là dữ liệu đã lưu, nhưng
 * "đã lưu" không đồng nghĩa với "đúng": một dòng hỏng, một lần sửa tay dưới Supabase, hay một
 * lỗi tương lai ở materializer là đủ để một tấm ảnh của chuồng khác hiện lên màn hình của bé.
 * Một điều kiện thừa ở đây rẻ hơn nhiều so với hậu quả.
 */
export async function anhCuaBai(barnId: string, mediaId: unknown): Promise<string | null> {
  // Cờ tổng ở đây là thừa - hàm này chỉ được gọi sau khi cổng đã mở, mà cổng đã hỏi cờ rồi.
  // Vẫn giữ, và cố ý: luật "mọi hàm chạm DB trong file này hỏi cờ trước" không có ngoại lệ
  // nào thì mới còn là một luật; một ngoại lệ "vì chỗ này an toàn" là chỗ ngoại lệ thứ hai
  // bám vào sau này.
  if (!batFamily() || typeof mediaId !== "string" || !mediaId || !barnId) return null;
  try {
    const m = await prisma.barnMedia.findFirst({
      where: { id: mediaId, barnId },
      select: { url: true },
    });
    return m?.url ?? null;
  } catch (e) {
    console.error("[bai-hoc] không đọc được ảnh của bài", e);
    return null;
  }
}
