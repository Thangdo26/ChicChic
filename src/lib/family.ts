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

/**
 * Có gì ở `/gia-dinh` để mà vào không, và có mấy **việc đang chờ chính bạn trả lời**.
 *
 * `cho` gộp hai thứ khác nhau nhưng cùng một nghĩa với người đọc: lời mời chưa trả lời và
 * mong muốn bé gửi chưa ai ngó. Cả hai đều là "có người đang chờ bạn", và đó là điều duy
 * nhất một con số trên huy hiệu nói được.
 */
export type LoiVaoGiaDinh = { hien: boolean; cho: number };

const KHONG_CO: LoiVaoGiaDinh = { hien: false, cho: 0 };

/**
 * Tài khoản này có nên thấy mục **ChicChic Gia đình** trên thanh điều hướng không.
 *
 * ⚠️ **Cờ tắt ⟹ trả về rỗng NGAY, không chạm DB.** Hàm này chạy trong layout, tức là ở
 * **mọi lần tải trang của mọi người** - một truy vấn thêm cho một tính năng đang tắt là
 * chi phí trả cho không ai; và một mục hiện lên khi cờ tắt thì kill switch chỉ còn là
 * nửa cái công tắc.
 *
 * Mọi phụ huynh đăng nhập đều có lối vào khi cờ bật. Họ tự xác nhận trên chuồng
 * LAYER đủ điều kiện; lời mời admin là đường hỗ trợ tùy chọn.
 *
 * Hỏng thì **ẩn**, cùng hướng với cờ tổng: một mục điều hướng không phải thứ đáng để hiện
 * bừa khi không đọc được dữ liệu.
 */
export async function loiVaoGiaDinh(userId: string | null | undefined): Promise<LoiVaoGiaDinh> {
  if (!userId || !batFamily()) return KHONG_CO;
  try {
    // ⚠️ Đếm mong muốn **tại chỗ** thay vì gọi `de-xuat.demMongMuonCho`: file đó import
    // `batFamily` từ đây, nên gọi ngược lại là một vòng import. Đây là phép ĐẾM, không phải
    // phép ghi - luật "một cửa ghi" ở §9.41 không bị đụng tới.
    const [loiMoi, mongMuon] = await Promise.all([
      prisma.familyEnrollment.count({ where: { parentId: userId, status: "INVITED" } }),
      prisma.childSuggestion.count({ where: { parentId: userId, status: "PENDING" } }),
    ]);
    return { hien: true, cho: loiMoi + mongMuon };
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
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const s = await prisma.session.findUnique({
      where: { token },
      select: { reauthAt: true, expiresAt: true, scope: true },
    });
    if (!s || s.scope !== "ADULT" || s.expiresAt <= new Date()) return false;
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
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const changed = await prisma.session.updateMany({
      where: { token, scope: "ADULT", expiresAt: { gt: new Date() } }, data: { reauthAt: new Date() },
    });
    return changed.count === 1;
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
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  try {
    await prisma.session.update({ where: { token }, data: { reauthAt: null } });
  } catch {
    // Không xoá được thì dấu vẫn tự hết hạn sau `RECENT_AUTH_MS` - im lặng ở đây được.
  }
}
