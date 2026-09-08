// MONG MUỐN CỦA BÉ - phần chạm DB (spec §12.8 · §16.2, Epic 6). Phần thuần ở `de-xuat-meta.ts`.
//
// ⚠️ **CHỈ SERVER**, và **không phải server action** (không `"use server"`): giống
// `lib/bai-hoc.ts` và `lib/su-kien.ts`, nó tin dữ liệu đưa vào và chỉ được gọi từ chỗ đã
// kiểm quyền xong.
//
// ⭐ **ĐÂY LÀ ĐƯỜNG DUY NHẤT GHI `ChildSuggestion`** (§9.41).
//
// ⚠️⚠️ **KHÔNG hàm nào trong file này tạo `BarnTask`, đơn hàng hay bất cứ thứ gì tiêu tiền.**
// Một mong muốn là một câu nói của đứa trẻ, không phải một lệnh (FL-D06/D07). Việc thật sinh
// ra ở `learning-actions.nhoCoChuLam`, sau cổng "cha mẹ **và** sở hữu chuồng".
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { batFamily } from "@/lib/family";
import {
  type LoaiMongMuon, type MongMuon, type TrangThaiMongMuon,
  NGAY_HET_HAN_MONG_MUON, SO_NGAY_TUAN, TRAN_CARE_WISH_TUAN, TRAN_DANG_CHO_MOI_BE,
  timMongMuon,
} from "@/lib/de-xuat-meta";

const NGAY = 86_400_000;

export type KetQuaGui =
  | { ok: true; kind: LoaiMongMuon }
  | { ok: false; ly: "khoa-la" | "da-gui" | "day-hang-cho" | "het-suat-tuan" | "hong" };

/**
 * Ghi một mong muốn ở trạng thái `PENDING`.
 *
 * **Ba cửa, theo đúng thứ tự** - và không cửa nào trong số đó là "bé có quyền không":
 * quyền đã được `moKhuCuaBe` trả lời trước khi tới đây.
 *
 *  ① **Khoá phải thuộc catalog đóng.** `optionKey` tới từ ngoài vào (§9.6).
 *  ② **Hàng chờ của bé có trần.** Gửi mười điều một lúc thì chín điều sẽ không ai trả lời,
 *     và một hàng chờ không bao giờ vơi là hàng chờ người ta thôi mở ra.
 *  ③ **`CARE_WISH` có trần THEO TUẦN, theo chuồng** (FL-D23). Mỗi cái được duyệt là công
 *     của một người thật đi làm và chụp ảnh.
 *
 * Trả về lý do từ chối thay vì ném lỗi: nơi gọi là màn hình của một đứa trẻ, nên mọi nhánh
 * đều phải có một câu tử tế để nói.
 */
export async function taoMongMuon(input: {
  childId: string;
  parentId: string;
  enrollmentId: string;
  optionKey: unknown;
}): Promise<KetQuaGui> {
  if (!batFamily()) return { ok: false, ly: "hong" };
  const m = timMongMuon(input.optionKey);
  if (!m) return { ok: false, ly: "khoa-la" };

  try {
    return await prisma.$transaction(async (tx) => {
    // Một suất có thể có nhiều bé. Khóa suất TRƯỚC hồ sơ để trần tuần dùng chung là atomic.
    const enrollment = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "FamilyEnrollment"
      WHERE id = ${input.enrollmentId} AND "parentId" = ${input.parentId} AND status = 'ACTIVE' FOR UPDATE`;
    if (enrollment.length !== 1) return { ok: false, ly: "hong" } as const;
    const child = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ChildProfile"
      WHERE id = ${input.childId} AND "parentId" = ${input.parentId} AND status = 'ACTIVE' FOR UPDATE`;
    if (child.length !== 1 || !(await tx.childBarnLink.findFirst({
      where: { childId: input.childId, enrollmentId: input.enrollmentId, unlinkedAt: null },
      select: { id: true },
    }))) return { ok: false, ly: "hong" } as const;
    const [dangCho, careTuan] = await Promise.all([
      tx.childSuggestion.findMany({
        where: { childId: input.childId, status: "PENDING" },
        select: { optionKey: true },
      }),
      m.kind === "CARE_WISH"
        ? tx.childSuggestion.count({
            where: {
              enrollmentId: input.enrollmentId,
              kind: "CARE_WISH",
              createdAt: { gte: new Date(Date.now() - SO_NGAY_TUAN * NGAY) },
              // Đếm cả cái đã bị bỏ qua: nông dân không phải nơi gánh việc đếm lại, và
              // "xin ba việc một tuần" phải là ba **lần xin**, không phải ba lần được duyệt.
              status: { in: ["PENDING", "REVIEWED", "DECLINED"] },
            },
          })
        : Promise.resolve(0),
    ]);

    if (dangCho.some((d) => d.optionKey === m.key)) return { ok: false, ly: "da-gui" };
    if (dangCho.length >= TRAN_DANG_CHO_MOI_BE) return { ok: false, ly: "day-hang-cho" };
    if (m.kind === "CARE_WISH" && careTuan >= TRAN_CARE_WISH_TUAN) {
      return { ok: false, ly: "het-suat-tuan" };
    }

    // Khóa ở trên giữ cả phép đếm, kiểm trùng và ghi trong cùng transaction.
    await tx.childSuggestion.create({
      data: {
        childId: input.childId,
        parentId: input.parentId,
        enrollmentId: input.enrollmentId,
        kind: m.kind,
        optionKey: m.key,
        expiresAt: new Date(Date.now() + NGAY_HET_HAN_MONG_MUON * NGAY),
      },
    });
    return { ok: true, kind: m.kind } as const;
    });
  } catch (e) {
    console.error("[de-xuat] không ghi được mong muốn của bé", e);
    return { ok: false, ly: "hong" };
  }
}

/** Những khoá bé đã gửi và đang chờ - để màn hình của bé không mời gửi lại cùng một điều. */
export async function khoaDangCho(childId: string): Promise<Set<string>> {
  if (!batFamily() || !childId) return new Set();
  try {
    const ds = await prisma.childSuggestion.findMany({
      where: { childId, status: "PENDING" },
      select: { optionKey: true },
    });
    return new Set(ds.map((d) => d.optionKey));
  } catch (e) {
    console.error("[de-xuat] không đọc được mong muốn đang chờ của bé", e);
    return new Set();
  }
}

/** Bao nhiêu mong muốn đang chờ cha mẹ trả lời - dùng cho huy hiệu trên thanh điều hướng. */
export async function demMongMuonCho(parentId: string): Promise<number> {
  if (!batFamily() || !parentId) return 0;
  try {
    return await prisma.childSuggestion.count({ where: { parentId, status: "PENDING" } });
  } catch (e) {
    console.error("[de-xuat] không đếm được mong muốn đang chờ", e);
    return 0;
  }
}

export type DongMongMuon = {
  id: string;
  m: MongMuon;
  kind: LoaiMongMuon;
  status: TrangThaiMongMuon;
  createdAt: Date;
  be: { id: string; nickname: string; avatarKey: string };
  barn: { slug: string; label: string } | null;
};

/**
 * Hàng chờ của cha mẹ.
 *
 * ⚠️ **Lọc kèm `parentId` ngay trong `where`**, không tra rồi so sau: đây là hàng chờ chứa
 * lời của con người ta.
 *
 * Trả về **cả** mục đã trả lời gần đây (`SO_DA_TRA_LOI` dòng): không có chúng thì bấm xong
 * là mục biến mất không dấu vết, và cha mẹ không có cách nào biết mình đã trả lời cái gì.
 */
export const SO_DA_TRA_LOI = 10;

export async function dsMongMuon(parentId: string): Promise<{
  dangCho: DongMongMuon[];
  daTraLoi: DongMongMuon[];
}> {
  if (!batFamily() || !parentId) return { dangCho: [], daTraLoi: [] };
  try {
    const [cho, xong] = await Promise.all([
      prisma.childSuggestion.findMany({
        where: { parentId, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        select: CHON,
      }),
      prisma.childSuggestion.findMany({
        where: { parentId, status: { in: ["REVIEWED", "DECLINED"] } },
        orderBy: { reviewedAt: "desc" },
        take: SO_DA_TRA_LOI,
        select: CHON,
      }),
    ]);

    // Nhãn chuồng cho cả hai danh sách trong MỘT truy vấn. `enrollmentId` là cột trần chứ
    // không phải khoá ngoại (xem schema), nên Prisma không tự join giúp - và một truy vấn
    // cho mỗi dòng thì hàng chờ mười dòng thành mười lượt đi-về (§10).
    const ids = Array.from(new Set([...cho, ...xong].map((r) => r.enrollmentId)));
    const suats = ids.length
      ? await prisma.familyEnrollment.findMany({
          where: { id: { in: ids }, parentId },
          select: { id: true, barn: { select: { slug: true, label: true } } },
        })
      : [];
    const chuong = new Map(suats.map((s) => [s.id, s.barn]));

    return {
      dangCho: cho.map((r) => doiDong(r, chuong)).filter(laDong),
      daTraLoi: xong.map((r) => doiDong(r, chuong)).filter(laDong),
    };
  } catch (e) {
    console.error("[de-xuat] không đọc được hàng chờ mong muốn", e);
    return { dangCho: [], daTraLoi: [] };
  }
}

const CHON = {
  id: true, kind: true, optionKey: true, status: true, createdAt: true, enrollmentId: true,
  child: { select: { id: true, nickname: true, avatarKey: true } },
} as const;

type DongTho = {
  id: string; kind: string; optionKey: string; status: string; createdAt: Date;
  enrollmentId: string;
  child: { id: string; nickname: string; avatarKey: string };
};

function doiDong(
  r: DongTho,
  chuong: Map<string, { slug: string; label: string }>,
): DongMongMuon | null {
  const m = timMongMuon(r.optionKey);
  // Khoá đã bị gỡ khỏi catalog (đổi nội dung sau này) ⟹ **bỏ dòng đi, không vẽ nửa vời**.
  // Một dòng trống trong hàng chờ của cha mẹ không nói được gì và cũng không bấm được.
  if (!m) return null;
  return {
    id: r.id, m, kind: m.kind, status: r.status as TrangThaiMongMuon,
    createdAt: r.createdAt, be: r.child, barn: chuong.get(r.enrollmentId) ?? null,
  };
}

function laDong(d: DongMongMuon | null): d is DongMongMuon {
  return d !== null;
}

export type MongMuonMo = {
  id: string;
  m: MongMuon;
  childId: string;
  nickname: string;
  /** Chủ hồ sơ **đã được xác nhận** là người đang gọi - dùng lại thay vì tra `me.id` lần nữa. */
  parentId: string;
  enrollmentId: string;
  /**
   * Trạng thái hiện tại, và cố ý **không** lọc sẵn ở truy vấn.
   *
   * ⚠️ Bản đầu của cổng này lọc `status: "PENDING"` ngay trong `where`, và hậu quả lộ ra
   * lúc chạy thật: cha mẹ bấm "Nhờ cô chú làm" hai lần (mạng chậm, hoặc hai tab) thì lần
   * thứ hai nhận **"Không tìm thấy mong muốn này"** - một câu vô nghĩa cho thứ họ vừa bấm,
   * và nghe như app đã đánh mất lời của con họ. Cùng một bài học với §9.40: **trùng thì tử
   * tế**, và "không tìm thấy" phải để dành cho thứ thật sự không phải của mình.
   */
  status: TrangThaiMongMuon;
  barn: {
    id: string;
    slug: string;
    label: string;
    workerId: string | null;
    workerUserId: string | null;
    outside: boolean;
    /** Đàn đã mổ xong - không còn con nào ở chuồng để mà nhờ chăm. */
    dongDan: boolean;
  };
};

/**
 * ⭐ **CỔNG của mọi hành động cha mẹ làm với một mong muốn** (§9.41).
 *
 * Bốn điều kiện, và thiếu một là đóng:
 *  · cờ tổng · mong muốn thuộc **đúng** tài khoản này · suất tham gia còn `ACTIVE`
 *  · ⭐ **và tài khoản này đang là CHỦ của chuồng đó**.
 *
 * Điều kiện cuối nghe thừa (suất được mời tới chủ chuồng) nhưng không thừa: chuồng đổi chủ
 * được, và FL-D22 nói rõ cổng là `parent + owns barn`. Một mong muốn được duyệt sẽ **tạo
 * việc thật cho một người thật** - đó không phải chỗ để suy ra quyền từ một cột chép sẵn.
 */
export async function moMongMuon(parentId: string, id: string, db: Prisma.TransactionClient = prisma): Promise<MongMuonMo | null> {
  if (!batFamily() || !parentId || !id) return null;
  try {
    const row = await db.childSuggestion.findFirst({
      // ⚠️ **Không lọc theo `status` ở đây** - xem chú thích ở trường `status` bên trên.
      // `parentId` thì lọc ngay trong `where`, không tra rồi so sau: đây là lời của con
      // người ta.
      where: { id, parentId, child: { parentId, status: "ACTIVE" } },
      select: {
        id: true, optionKey: true, childId: true, enrollmentId: true, status: true,
        child: { select: { nickname: true } },
      },
    });
    if (!row) return null;
    const m = timMongMuon(row.optionKey);
    if (!m) return null;

    const suat = await db.familyEnrollment.findFirst({
      where: { id: row.enrollmentId, parentId, status: "ACTIVE" },
      select: {
        barn: {
          select: {
            id: true, slug: true, label: true, ownerId: true, outside: true, workerId: true,
            worker: { select: { userId: true } },
            flock: { select: { stage: true } },
          },
        },
      },
    });
    if (!suat?.barn || suat.barn.ownerId !== parentId) return null;

    return {
      id: row.id, m, childId: row.childId, nickname: row.child.nickname,
      parentId, enrollmentId: row.enrollmentId, status: row.status as TrangThaiMongMuon,
      barn: {
        id: suat.barn.id, slug: suat.barn.slug, label: suat.barn.label,
        workerId: suat.barn.workerId, workerUserId: suat.barn.worker?.userId ?? null,
        outside: suat.barn.outside,
        // ⚠️ **`RETIRED` KHÔNG phải đóng đàn.** Đàn của gia đình kết chu kỳ bằng `RETIRE`
        // (FL-D13), và những con gà đó vẫn sống ở nông trại, vẫn ăn, vẫn uống - nên bé vẫn
        // nhờ chăm được. Chỉ `HARVESTED` là thật sự không còn con nào ở chuồng.
        dongDan: suat.barn.flock?.stage === "HARVESTED",
      },
    };
  } catch (e) {
    console.error("[de-xuat] không mở được mong muốn - đóng lại", e);
    return null;
  }
}

/**
 * Đóng những mong muốn không ai trả lời quá `NGAY_HET_HAN_MONG_MUON` ngày (việc nền).
 *
 * **Im lặng, không thông báo gì.** Đây là dọn dẹp, không phải một lời trách cha mẹ đã quên.
 * So-sánh-rồi-đặt (§9.24): chỉ đụng dòng còn `PENDING`.
 */
export async function hetHanMongMuon(): Promise<number> {
  if (!batFamily()) return 0;
  const { count } = await prisma.childSuggestion.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return count;
}
