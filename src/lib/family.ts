// FAMILY LEARNING - phần chạm vào môi trường và DB.
//
// ⚠️ **CHỈ SERVER.** File này đọc `process.env` và (từ Epic 1) đọc/ghi Prisma. Component
// client tuyệt đối không được import - luật §1.2 của CODEMAP. Phần thuần dùng chung nằm
// ở `lib/family-gates.ts`.
//
// Và nó **không phải server action**: giống `lib/task-store.ts`, ở đây cố ý không có
// `"use server"` nên không gọi được từ client. Nó *tin* dữ liệu đưa vào, nên chỉ được
// gọi từ action đã kiểm quyền.
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth";
import { conHieuLucXacMinh, coBatFamily } from "@/lib/family-gates";

/**
 * Cờ tổng của cả chương trình - kill switch ở §22.3 của spec.
 *
 * Tên biến **không** có tiền tố `NEXT_PUBLIC_`, và đó là chủ ý: biến `NEXT_PUBLIC_*` bị
 * nướng vào bundle lúc build và ai mở DevTools cũng đọc được, tức là tắt tính năng mà
 * vẫn để lộ rằng nó tồn tại và sắp có gì. Cờ này phải là quyết định của **server**.
 *
 * Đọc mỗi lần gọi chứ không chụp vào hằng số ở đầu module: đổi biến trên Vercel rồi
 * restart là ăn ngay, không cần deploy lại. Với một kill switch thì khoảng cách giữa
 * "quyết định tắt" và "thật sự tắt" là thứ đáng trả giá vài phép đọc biến.
 */
export function batFamily(): boolean {
  return coBatFamily(process.env.FAMILY_LEARNING_ENABLED);
}

// ---------------- Lối vào cổng Gia đình ----------------

/** Có gì ở `/gia-dinh` để mà vào không, và có mấy lời mời đang chờ trả lời. */
export type LoiVaoGiaDinh = { hien: boolean; loiMoi: number };

const KHONG_CO: LoiVaoGiaDinh = { hien: false, loiMoi: 0 };

/**
 * Tài khoản này có nên thấy mục **ChicChic Gia đình** trên thanh điều hướng không.
 *
 * ⚠️ **Cờ tắt ⟹ trả về rỗng NGAY, không chạm DB.** Hàm này chạy trong layout, tức là ở
 * **mọi lần tải trang của mọi người** - một truy vấn thêm cho một tính năng đang tắt là
 * chi phí trả cho không ai; và một mục hiện lên khi cờ tắt thì kill switch chỉ còn là
 * nửa cái công tắc.
 *
 * ⚠️ **Chỉ hiện với người ĐÃ CÓ GÌ ĐÓ ở đó** - một lời mời đang chờ, một suất đang chạy,
 * hay một hồ sơ bé. Bày mục này cho mọi tài khoản là quảng cáo một chương trình pilot mà
 * họ không vào được (`/gia-dinh` không có đường tự đăng ký; chỉ quản trị mời).
 *
 * Hỏng thì **ẩn**, cùng hướng với cờ tổng: một mục điều hướng không phải thứ đáng để hiện
 * bừa khi không đọc được dữ liệu.
 */
export async function loiVaoGiaDinh(userId: string | null | undefined): Promise<LoiVaoGiaDinh> {
  if (!userId || !batFamily()) return KHONG_CO;
  try {
    const [loiMoi, dangChay, soBe] = await Promise.all([
      prisma.familyEnrollment.count({ where: { parentId: userId, status: "INVITED" } }),
      prisma.familyEnrollment.count({ where: { parentId: userId, status: { in: ["ACTIVE", "PAUSED"] } } }),
      prisma.childProfile.count({ where: { parentId: userId, status: { not: "DELETED" } } }),
    ]);
    return { hien: loiMoi + dangChay + soBe > 0, loiMoi };
  } catch (e) {
    console.error("[family] không đếm được lối vào Gia đình - ẩn mục đi", e);
    return KHONG_CO;
  }
}

// ---------------- Xác minh lại (recent-auth) ----------------

/**
 * Phiên đang mở ở máy này vừa gõ lại mật khẩu chưa (spec §17.1).
 *
 * Vì sao cần thêm một cửa nữa khi người ta đã đăng nhập: phiên sống **30 ngày**
 * (`SESSION_DAYS` ở `lib/auth.ts`). Cái máy tính để bàn trong nhà, cái điện thoại đưa cho
 * bé chơi, cái laptop mượn ở quán - trong 30 ngày đó, "đã đăng nhập" không còn nghĩa là
 * "đúng người ấy đang ngồi đây". Với việc thường thì chấp nhận được; với việc **tạo hồ sơ
 * một đứa trẻ**, **rút consent** hay **xoá dữ liệu của bé** thì không.
 *
 * ⚠️ Đọc thẳng từ DB mỗi lần, cố ý không cache: hàm này canh một cửa, mà một cửa đọc số
 * liệu cũ là một cửa mở lâu hơn nó nghĩ.
 *
 * Không đọc được (mất cookie, phiên đã xoá) ⟹ **chưa xác minh**. Hỏng thì đóng, cùng
 * hướng với cờ tổng.
 */
export async function daXacMinhGanDay(): Promise<boolean> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const s = await prisma.session.findUnique({
      where: { token },
      select: { reauthAt: true, expiresAt: true },
    });
    if (!s || s.expiresAt < new Date()) return false;
    return conHieuLucXacMinh(s.reauthAt);
  } catch (e) {
    console.error("[family] không đọc được dấu xác minh - coi như CHƯA xác minh", e);
    return false;
  }
}

/**
 * Đóng dấu "vừa xác minh" lên **đúng phiên đang gọi**, không phải mọi phiên của tài khoản.
 *
 * Gõ đúng mật khẩu ở máy này không được mở cửa cho cái phiên còn treo ở máy quán net tuần
 * trước - đó là toàn bộ lý do cột `reauthAt` nằm trên `Session` chứ không nằm trên `User`.
 *
 * Trả về `false` khi không đóng dấu được, để nơi gọi biết mà đừng nói "xong rồi".
 */
export async function dongDauXacMinh(): Promise<boolean> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await prisma.session.update({ where: { token }, data: { reauthAt: new Date() } });
    return true;
  } catch (e) {
    console.error("[family] không đóng được dấu xác minh", e);
    return false;
  }
}

/**
 * Xoá dấu xác minh của phiên hiện tại - gọi ngay **sau khi** việc nhạy cảm đã xong.
 *
 * Vì sao không để dấu tự hết hạn: một cửa mở 10 phút sau khi việc đã xong là 10 phút thừa.
 * Xác minh là để làm **một việc**, không phải để mở một khoảng thời gian.
 */
export async function xoaDauXacMinh(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return;
  try {
    await prisma.session.update({ where: { token }, data: { reauthAt: null } });
  } catch {
    // Không xoá được thì dấu vẫn tự hết hạn sau `RECENT_AUTH_MS` - im lặng ở đây được.
  }
}
