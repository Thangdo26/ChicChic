// Hộp thư của chuồng — CỬA DUY NHẤT đọc/ghi tin nhắn giữa chủ chuồng và nông dân.
//
// Vì sao gắn vào CHUỒNG chứ không phải vào cặp người: quyền hạn dùng lại nguyên
// cổng đang có, không phát minh mô hình quyền thứ hai (rủi ro an ninh lớn nhất của
// mọi tính năng nhắn tin). Đổi nông dân thì lịch sử ở lại với chuồng.
//
// File này KHÔNG có "use server" (giống lib/notify.ts, lib/task-store.ts): mọi hàm
// kiểm quyền nằm ngay trong `threadAccess`, còn phần còn lại tin dữ liệu đưa vào.
import { prisma } from "@/lib/db";
import { getSessionUser, activeWorkerSession } from "@/lib/auth";

export type ThreadRole = "OWNER" | "WORKER" | "ADMIN";

export type ThreadAccess = {
  role: ThreadRole;
  barn: { id: string; slug: string; label: string; ownerId: string | null; workerId: string | null };
  /** Tài khoản của tôi (admin xem qua Basic Auth thì null — chỉ đọc, không gửi được) */
  meId: string | null;
  /** Tài khoản của phía bên kia — để đẩy thông báo. */
  otherUserId: string | null;
  /** Tên hiển thị của phía bên kia (admin chỉ đọc thì là tên nông dân). */
  otherName: string;
  /** Cả hai tên — hộp thư phải gọi đúng tên từng dòng, kể cả ở chế độ xem của admin. */
  ownerName: string;
  workerName: string;
};

/** Số tin tối đa một người gửi vào một chuồng trong 1 giờ. */
export const MAX_PER_HOUR = 10;
/** Số tin liên tiếp được phép gửi khi phía bên kia chưa trả lời. */
export const MAX_UNANSWERED = 5;
export const MAX_BODY = 1000;

/**
 * Cổng quyền DUY NHẤT của hộp thư. Mọi action và page phải đi qua đây.
 *
 * Khác một chỗ có chủ ý so với `ownedBarn()` trong actions.ts: ở đó `role === "ADMIN"`
 * đi qua được mọi thứ. Hộp thư thì KHÔNG — nông trại chỉ đọc được khi trong hộp thư
 * có tin bị gắn cờ hoặc bị một bên báo cáo. Đây là lời hứa ghi ngay trên đầu hộp thư
 * cho cả hai bên đọc, nên không được lặng lẽ nới ra.
 */
export async function threadAccess(barnSlug: string): Promise<ThreadAccess | null> {
  const me = await getSessionUser();
  if (!me) return null;

  const barn = await prisma.barn.findUnique({
    where: { slug: barnSlug },
    select: {
      id: true, slug: true, label: true, ownerId: true, workerId: true,
      owner: { select: { id: true, name: true, email: true } },
      worker: { select: { name: true, userId: true } },
    },
  });
  if (!barn) return null;

  // Chuồng chưa có chủ (kể cả chuồng trưng bày isPublic) thì không có hộp thư nào cả.
  // Không có luật này thì mọi tài khoản đều nhắn được vào /chuong/demo.
  if (!barn.ownerId) return null;

  const shape = { id: barn.id, slug: barn.slug, label: barn.label, ownerId: barn.ownerId, workerId: barn.workerId };
  const ownerName = barn.owner?.name ?? barn.owner?.email ?? "Chủ chuồng";
  const workerName = barn.worker?.name ?? "Nông dân";

  const names = { ownerName, workerName };

  // --- Chủ chuồng ---
  if (barn.ownerId === me.id) {
    return {
      role: "OWNER", barn: shape, meId: me.id, ...names,
      otherUserId: barn.worker?.userId ?? null, otherName: workerName,
    };
  }

  // --- Nông dân phụ trách, và phải ĐANG HOẠT ĐỘNG (§9.10) ---
  const w = await activeWorkerSession();
  if (w && barn.workerId === w.workerId) {
    return {
      role: "WORKER", barn: shape, meId: me.id, ...names,
      otherUserId: barn.ownerId, otherName: ownerName,
    };
  }

  // --- Quản trị: chỉ khi hộp thư có tin bị gắn cờ hoặc bị báo cáo ---
  if (me.role === "ADMIN" && (await hasFlagged(barn.id))) {
    return { role: "ADMIN", barn: shape, meId: me.id, ...names, otherUserId: null, otherName: workerName };
  }

  return null;
}

/** Hộp thư này có tin nào cần nông trại xem lại không. */
export async function hasFlagged(barnId: string): Promise<boolean> {
  const n = await prisma.barnMessage.count({
    where: { barnId, OR: [{ flagged: true }, { reportedAt: { not: null } }] },
  });
  return n > 0;
}

export type MessageVM = {
  id: string;
  author: "OWNER" | "WORKER";
  body: string;
  mine: boolean;
  flagged: boolean;
  reported: boolean;
  createdAt: string;
};

/** Toàn bộ hộp thư, cũ trước (đọc từ trên xuống như một cuộc trò chuyện). */
export async function listMessages(barnId: string, meId: string | null, take = 60): Promise<MessageVM[]> {
  const rows = await prisma.barnMessage.findMany({
    where: { barnId, hiddenAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, author: true, body: true, senderId: true,
      flagged: true, reportedAt: true, createdAt: true,
    },
  });
  return rows.reverse().map((m) => ({
    id: m.id,
    author: m.author,
    body: m.body,
    mine: !!meId && m.senderId === meId,
    flagged: m.flagged,
    reported: !!m.reportedAt,
    createdAt: m.createdAt.toISOString(),
  }));
}

/** Số tin chưa đọc GỬI TỚI tôi trong một chuồng. */
export function unreadFor(barnId: string, meId: string) {
  return prisma.barnMessage.count({
    where: { barnId, readAt: null, hiddenAt: null, senderId: { not: meId } },
  });
}

/**
 * Số tin chưa đọc của NHIỀU chuồng cùng lúc — một `groupBy` thay vì N truy vấn.
 * Dùng ở /nong-trai, nơi một nông dân có tới 15 chuồng (bẫy N+1, CODEMAP §10).
 */
export async function unreadByBarn(barnIds: string[], meId: string): Promise<Map<string, number>> {
  if (barnIds.length === 0) return new Map();
  const rows = await prisma.barnMessage.groupBy({
    by: ["barnId"],
    where: { barnId: { in: barnIds }, readAt: null, hiddenAt: null, senderId: { not: meId } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.barnId, r._count._all]));
}

/** Đánh dấu đã đọc mọi tin phía bên kia gửi vào chuồng này. */
export async function markRead(barnId: string, meId: string): Promise<number> {
  const { count } = await prisma.barnMessage.updateMany({
    where: { barnId, readAt: null, senderId: { not: meId } },
    data: { readAt: new Date() },
  });
  return count;
}

/**
 * Nghi ngờ đang trao đổi để đi vòng qua nền tảng.
 * CỐ Ý rộng tay và CỐ Ý không chặn: đây chỉ là cờ cho nông trại xem lại. Chặn nhầm
 * một câu "chú gọi hotline nông trại 024… nhé" còn hại hơn là để lọt vài tin.
 */
export function looksLikeContactSwap(text: string): boolean {
  const t = text.toLowerCase();
  // Số điện thoại VN: 9–11 chữ số, cho phép chấm/gạch/khoảng trắng xen giữa.
  if (/(?:\d[\s.\-]?){9,11}/.test(t)) return true;
  if (/\b(zalo|facebook|fb\.com|messenger|telegram|viber|whatsapp|tiktok)\b/.test(t)) return true;
  if (/https?:\/\/|www\./.test(t)) return true;
  // "kết bạn zalo", "sđt", "số đt", "gọi cho mình"
  if (/(s[ốo]\s*[đd]t|sdt|s[đd]t|k[ees]t b[aạ]n)/.test(t)) return true;
  return false;
}

export const CONTACT_WARNING =
  "Mình thấy tin này có vẻ trao đổi liên hệ riêng. Nhắn ngoài app thì nông trại không có " +
  "bằng chứng để bênh bạn khi có tranh chấp — cứ trao đổi ở đây cho an toàn nhé.";

/**
 * Kiểm tra tần suất trước khi cho gửi. Nông dân là người thật, không phải hàng đợi
 * vô hạn — cùng tinh thần với `MAX_OPEN_PER_BARN` ở task-actions.
 */
export async function sendingBlocked(
  barnId: string, meId: string, otherName: string,
): Promise<string | null> {
  const anHourAgo = new Date(Date.now() - 3_600_000);
  const recent = await prisma.barnMessage.count({
    where: { barnId, senderId: meId, createdAt: { gt: anHourAgo } },
  });
  if (recent >= MAX_PER_HOUR) {
    return `Bạn đã gửi ${recent} tin trong một giờ qua. Nghỉ một chút rồi nhắn tiếp nhé.`;
  }

  // Bao nhiêu tin liên tiếp của tôi kể từ lần cuối phía bên kia trả lời.
  const lastFromOther = await prisma.barnMessage.findFirst({
    where: { barnId, senderId: { not: meId } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const mineSince = await prisma.barnMessage.count({
    where: {
      barnId, senderId: meId,
      ...(lastFromOther ? { createdAt: { gt: lastFromOther.createdAt } } : {}),
    },
  });
  if (mineSince >= MAX_UNANSWERED) {
    return `${otherName} chưa kịp trả lời. Đợi hồi âm rồi nhắn tiếp nhé — hoặc giao hẳn một việc nếu cần làm ngay.`;
  }
  return null;
}

/**
 * Có nên rung chuông cho phía bên kia không.
 * Đã có tin chưa đọc của tôi nằm đó rồi thì thôi — cùng nguyên tắc "việc gộp thì
 * không báo lại" ở §9.8, để hộp thư không biến thành máy dội chuông.
 */
export async function shouldNotify(barnId: string, meId: string): Promise<boolean> {
  const pending = await prisma.barnMessage.count({
    where: { barnId, senderId: meId, readAt: null },
  });
  // Tin vừa gửi đã nằm trong DB rồi, nên "chỉ mình nó" nghĩa là chưa dội chuông lần nào.
  return pending <= 1;
}
