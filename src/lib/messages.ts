// Hộp thư của chuồng - CỬA DUY NHẤT đọc/ghi tin nhắn giữa chủ chuồng và nông dân.
//
// Vì sao gắn vào CHUỒNG chứ không phải vào cặp người: quyền hạn dùng lại nguyên
// cổng đang có, không phát minh mô hình quyền thứ hai (rủi ro an ninh lớn nhất của
// mọi tính năng nhắn tin). Đổi nông dân thì lịch sử ở lại với chuồng.
//
// File này KHÔNG có "use server" (giống lib/notify.ts, lib/task-store.ts): mọi hàm
// kiểm quyền nằm ngay trong `threadAccess`, còn phần còn lại tin dữ liệu đưa vào.
import { prisma } from "@/lib/db";
import { getSessionUser, activeWorkerSession } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { quyenHopThu } from "@/lib/gates";
import type { MessageVM, PartyRole } from "@/lib/messages-meta";

export type ThreadAccess = {
  role: PartyRole;
  barn: { id: string; slug: string; label: string; ownerId: string | null; workerId: string | null };
  /** Tài khoản của tôi - luôn có, vì chỉ hai bên trong cuộc mới qua được cổng này. */
  meId: string;
  /** Tài khoản của phía bên kia - để đẩy thông báo. */
  otherUserId: string | null;
  /** Tên hiển thị của phía bên kia (admin chỉ đọc thì là tên nông dân). */
  otherName: string;
  /** Cả hai tên - hộp thư phải gọi đúng tên từng dòng, kể cả ở chế độ xem của admin. */
  ownerName: string;
  workerName: string;
};

/** Số tin tối đa một người gửi vào một chuồng trong 1 giờ. */
export const MAX_PER_HOUR = 10;
/** Số tin liên tiếp được phép gửi khi phía bên kia chưa trả lời. */
export const MAX_UNANSWERED = 5;

/**
 * Cổng quyền của hộp thư cho HAI BÊN trong cuộc (chủ chuồng ↔ nông dân).
 * Mọi action nhắn tin phải đi qua đây.
 *
 * Nông trại KHÔNG đi lối này - xem `adminThread()` ở cuối file. Khác có chủ ý so với
 * `ownedBarn()` trong actions.ts (ở đó `role === "ADMIN"` đi qua được mọi thứ).
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

  const shape = { id: barn.id, slug: barn.slug, label: barn.label, ownerId: barn.ownerId, workerId: barn.workerId };
  const ownerName = barn.owner?.name ?? barn.owner?.email ?? "Chủ chuồng";
  const workerName = barn.worker?.name ?? "Nông dân";
  const names = { ownerName, workerName };

  // Chỉ đi hỏi hồ sơ nông dân khi câu trả lời còn phụ thuộc vào nó - chủ chuồng mở hộp
  // thư của chính mình thì không tốn thêm một lượt đi–về DB nào (§10).
  const w = barn.ownerId === me.id ? null : await activeWorkerSession();

  // Luật ở `lib/gates.quyenHopThu` - gồm cả "chuồng chưa có chủ thì không có hộp thư"
  // (không có nó thì mọi tài khoản đều nhắn được vào /chuong/demo) và "nông dân phải
  // ĐANG HOẠT ĐỘNG" (§9.10).
  const vai = quyenHopThu({ me, barn, myActiveWorkerId: w?.workerId ?? null });

  if (vai === "OWNER") {
    return {
      role: "OWNER", barn: shape, meId: me.id, ...names,
      otherUserId: barn.worker?.userId ?? null, otherName: workerName,
    };
  }
  if (vai === "WORKER") {
    return {
      role: "WORKER", barn: shape, meId: me.id, ...names,
      otherUserId: barn.ownerId, otherName: ownerName,
    };
  }
  return null;
}

/**
 * Chế độ đọc của nông trại - CHỈ dùng cho route dưới `/admin`.
 *
 * Vì sao phải tách khỏi `threadAccess`: quản trị vào `/admin` bằng **Basic Auth**, không
 * có phiên đăng nhập nào cả. Trang hộp thư của chủ chuồng lại bắt đầu bằng `requireUser`,
 * nên admin bấm "Mở hộp thư" từ hàng đợi cờ sẽ bị đá thẳng ra `/dang-nhap`. Thêm nữa,
 * trình duyệt chỉ gửi kèm header Basic Auth cho đường dẫn trong cùng realm - tức là
 * `isAdmin()` chỉ nhận ra quản trị khi URL nằm dưới `/admin`.
 *
 * Trả về null nếu hộp thư SẠCH: không có cờ, không có báo cáo thì nông trại không đọc
 * (§9.17) - kể cả khi đã qua được Basic Auth.
 */
export async function adminThread(barnSlug: string) {
  if (!(await isAdmin())) return null;

  const barn = await prisma.barn.findUnique({
    where: { slug: barnSlug },
    select: {
      id: true, slug: true, label: true, ownerId: true, workerId: true,
      owner: { select: { name: true, email: true } },
      worker: { select: { name: true } },
    },
  });
  if (!barn || !(await hasFlagged(barn.id))) return null;

  return {
    barn: { id: barn.id, slug: barn.slug, label: barn.label },
    ownerName: barn.owner?.name ?? barn.owner?.email ?? "Chủ chuồng",
    workerName: barn.worker?.name ?? "Nông dân",
  };
}

/** Hộp thư này có tin nào cần nông trại xem lại không. */
export async function hasFlagged(barnId: string): Promise<boolean> {
  const n = await prisma.barnMessage.count({
    where: { barnId, OR: [{ flagged: true }, { reportedAt: { not: null } }] },
  });
  return n > 0;
}

/** Toàn bộ hộp thư, cũ trước (đọc từ trên xuống như một cuộc trò chuyện). */
export async function listMessages(barnId: string, meId: string | null, take = 60): Promise<MessageVM[]> {
  const rows = await prisma.barnMessage.findMany({
    where: { barnId, hiddenAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, author: true, body: true, senderId: true,
      flagged: true, reportedAt: true, reportReason: true, createdAt: true,
    },
  });
  return rows.reverse().map((m) => ({
    id: m.id,
    author: m.author,
    body: m.body,
    mine: !!meId && m.senderId === meId,
    flagged: m.flagged,
    reported: !!m.reportedAt,
    reportReason: m.reportReason,
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
 * Số tin chưa đọc của NHIỀU chuồng cùng lúc - một `groupBy` thay vì N truy vấn.
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

/**
 * Kiểm tra tần suất trước khi cho gửi. Nông dân là người thật, không phải hàng đợi
 * vô hạn - cùng tinh thần với `MAX_OPEN_PER_BARN` ở task-actions.
 */
export async function sendingBlocked(
  barnId: string, meId: string, otherName: string,
): Promise<string | null> {
  const anHourAgo = new Date(Date.now() - 3_600_000);

  // Hai truy vấn đầu độc lập nhau → song song. Truy vấn thứ ba PHẢI chờ `lastFromOther`
  // nên không gộp được; tổng còn 2 lượt đi–về thay vì 3.
  const [recent, lastFromOther] = await Promise.all([
    prisma.barnMessage.count({
      where: { barnId, senderId: meId, createdAt: { gt: anHourAgo } },
    }),
    prisma.barnMessage.findFirst({
      where: { barnId, senderId: { not: meId } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  if (recent >= MAX_PER_HOUR) {
    return `Bạn đã gửi ${recent} tin trong một giờ qua. Nghỉ một chút rồi nhắn tiếp nhé.`;
  }

  // Bao nhiêu tin liên tiếp của tôi kể từ lần cuối phía bên kia trả lời.
  const mineSince = await prisma.barnMessage.count({
    where: {
      barnId, senderId: meId,
      ...(lastFromOther ? { createdAt: { gt: lastFromOther.createdAt } } : {}),
    },
  });
  if (mineSince >= MAX_UNANSWERED) {
    return `${otherName} chưa kịp trả lời. Đợi hồi âm rồi nhắn tiếp nhé - hoặc giao hẳn một việc nếu cần làm ngay.`;
  }
  return null;
}

/**
 * Có nên rung chuông cho phía bên kia không.
 * Đã có tin chưa đọc của tôi nằm đó rồi thì thôi - cùng nguyên tắc "việc gộp thì
 * không báo lại" ở §9.8, để hộp thư không biến thành máy dội chuông.
 */
export async function shouldNotify(barnId: string, meId: string): Promise<boolean> {
  const pending = await prisma.barnMessage.count({
    where: { barnId, senderId: meId, readAt: null },
  });
  // Tin vừa gửi đã nằm trong DB rồi, nên "chỉ mình nó" nghĩa là chưa dội chuông lần nào.
  return pending <= 1;
}
