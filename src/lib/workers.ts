// Sức chứa của nông dân — một chuồng thuộc về ĐÚNG MỘT nông dân,
// một nông dân quản lý tối đa `maxBarns` (mặc định 15) chuồng đang có chủ.
// Chuồng đã hoàn trả (ownerId = null) không tính vào tải → giải phóng chỗ.
import { prisma } from "@/lib/db";
import { ageFromBirthYear } from "@/lib/decor";

/** Một mục ảnh/video cô chú tự giới thiệu — cùng hình dạng với MediaVM để dùng lại MediaStrip. */
export type IntroMedia = {
  id: string;
  type: "PHOTO" | "VIDEO";
  url: string;
  posterUrl: string | null;
  caption: string | null;
  durationSec: null;
  capturedAt: string;
  workerName: string | null;
};

export type WorkerCard = {
  id: string;
  name: string;
  area: string;
  bio: string | null;
  avatarKey: string;
  yearsExp: number;
  /** Tuổi tính từ năm sinh; null nếu cô chú chưa khai */
  age: number | null;
  load: number;
  maxBarns: number;
  free: number;
  /** Còn nhận thêm chuồng mới không */
  open: boolean;
  /** Tạm nghỉ (khác với đã kín chỗ) — để hiện đúng lý do */
  paused: boolean;
  /** Ảnh/video tự giới thiệu, tối đa 6 mục */
  intro: IntroMedia[];
};

/** Số chuồng ĐANG có chủ mà nông dân này phụ trách. */
export function workerLoad(workerId: string) {
  return prisma.barn.count({ where: { workerId, ownerId: { not: null } } });
}

/** Danh sách nông dân kèm tải hiện tại, người còn nhiều chỗ trống xếp trước. */
export async function listWorkers(): Promise<WorkerCard[]> {
  const [workers, loads] = await Promise.all([
    prisma.farmWorker.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, area: true, bio: true, avatarKey: true,
        yearsExp: true, maxBarns: true, active: true, birthYear: true,
        introMedia: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: 6,
          select: { id: true, type: true, url: true, posterUrl: true, caption: true, createdAt: true },
        },
      },
    }),
    // Đếm tải một lần cho tất cả nông dân thay vì N truy vấn con
    prisma.barn.groupBy({
      by: ["workerId"],
      where: { ownerId: { not: null }, workerId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const loadOf = new Map(loads.map((l) => [l.workerId, l._count._all]));

  return workers
    .map((w) => {
      const load = loadOf.get(w.id) ?? 0;
      const free = Math.max(0, w.maxBarns - load);
      return {
        id: w.id, name: w.name, area: w.area, bio: w.bio, avatarKey: w.avatarKey,
        yearsExp: w.yearsExp, age: ageFromBirthYear(w.birthYear),
        load, maxBarns: w.maxBarns, free,
        open: w.active && free > 0, paused: !w.active,
        intro: w.introMedia.map((m) => ({
          id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
          durationSec: null, capturedAt: m.createdAt.toISOString(), workerName: w.name,
        })),
      };
    })
    .sort((a, b) => Number(b.open) - Number(a.open) || b.free - a.free);
}

/** Vài cô chú đang chăm chuồng, kèm ảnh thật nếu đã tự giới thiệu — dùng ở trang chủ. */
export type FarmerFace = {
  id: string; name: string; area: string; yearsExp: number; age: number | null;
  /** ảnh thật cô chú tự đăng; null thì trang chủ dùng hình vẽ */
  photoUrl: string | null;
  /** số chuồng đang chăm — bằng chứng sống là nông trại có thật */
  barns: number;
};

/**
 * "Mặt thật" cho trang chủ. Trụ niềm tin số 2 của định vị chống-đa-cấp: người xem
 * phải thấy người thật đang nhận tiền công, chứ không phải một hình minh hoạ.
 * Chỉ lấy cô chú đang hoạt động và ĐÃ ĐỒNG Ý lên hình (`consentMedia`).
 */
export async function featuredWorkers(take = 3): Promise<FarmerFace[]> {
  const [workers, loads] = await Promise.all([
    prisma.farmWorker.findMany({
      where: { active: true, consentMedia: true },
      orderBy: { yearsExp: "desc" },
      take,
      select: {
        id: true, name: true, area: true, yearsExp: true, birthYear: true,
        introMedia: {
          where: { type: "PHOTO" },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          take: 1,
          select: { url: true },
        },
      },
    }),
    prisma.barn.groupBy({
      by: ["workerId"],
      where: { ownerId: { not: null }, workerId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const loadOf = new Map(loads.map((l) => [l.workerId, l._count._all]));
  return workers.map((w) => ({
    id: w.id, name: w.name, area: w.area, yearsExp: w.yearsExp,
    age: ageFromBirthYear(w.birthYear),
    photoUrl: w.introMedia[0]?.url ?? null,
    barns: loadOf.get(w.id) ?? 0,
  }));
}

/** Số liệu sống của nông trại — bằng chứng "có thật" rẻ nhất mà ta đang có sẵn dữ liệu. */
export async function farmProof(): Promise<{ workers: number; barns: number; media: number }> {
  const [workers, barns, media] = await Promise.all([
    prisma.farmWorker.count({ where: { active: true } }),
    prisma.barn.count({ where: { ownerId: { not: null } } }),
    prisma.barnMedia.count(),
  ]);
  return { workers, barns, media };
}

/**
 * Nông dân này còn nhận được chuồng mới không.
 * Gọi lại NGAY TRƯỚC khi tạo chuồng — danh sách trên màn hình có thể đã cũ.
 */
export async function workerHasCapacity(workerId: string): Promise<{ ok: boolean; reason?: string; name?: string }> {
  const w = await prisma.farmWorker.findUnique({
    where: { id: workerId },
    select: { name: true, maxBarns: true, active: true },
  });
  if (!w) return { ok: false, reason: "Không tìm thấy nông dân này." };
  if (!w.active) return { ok: false, reason: `${w.name} tạm thời không nhận chuồng mới.`, name: w.name };

  const load = await workerLoad(workerId);
  if (load >= w.maxBarns) {
    return { ok: false, reason: `${w.name} đã kín ${w.maxBarns} chuồng — chọn giúp mình một nông dân khác nhé.`, name: w.name };
  }
  return { ok: true, name: w.name };
}
