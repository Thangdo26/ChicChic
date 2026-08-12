"use server";
// CHƯƠNG TRÌNH HỌC - server action của cha mẹ (spec §16.2, Epic 4).
//
// ⚠️ **Server action là endpoint CÔNG KHAI** (CODEMAP §1.2 luật 4): middleware không chặn lời
// gọi tới đây, nên mọi hàm trong file này tự mở bằng `chaMe()` - đăng nhập **và** cờ tổng.
//
// Epic 4 chỉ có đúng một hành động: **đồng bộ**. `startLearningMoment` /
// `completeLearningMoment` thuộc Epic 5 (khu của bé) - đừng thêm sớm, vì chúng cần cổng
// `canEnterChildSpace` và một màn hình để bấm.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSessionUser, verifyPassword } from "@/lib/auth";
import { batFamily } from "@/lib/family";
import { chanNhip, xoaNhip } from "@/lib/nhip";
import { dungKhoanhKhac, moBaiCuaBe } from "@/lib/bai-hoc";
import { locLuaChon } from "@/lib/bai-hoc-meta";
import { track } from "@/lib/track";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

async function chaMe(): Promise<{ id: string } | null> {
  if (!batFamily()) return null;
  const me = await getSessionUser();
  return me ? { id: me.id } : null;
}

/**
 * Tìm khoảnh khắc mới cho các bé của **chính tài khoản này** (spec §16.2 `syncLearningMoments`).
 *
 * Ba điều đáng nhớ:
 *
 * ① **Phạm vi là `me.id`, không nhận id nào từ client.** Không có tham số nào để bắn vào -
 *    đó là cách rẻ nhất để một endpoint công khai không bao giờ sinh bài cho con nhà người
 *    khác (§9.37).
 *
 * ② **Chạy lại bao nhiêu lần cũng vô hại.** `dungKhoanhKhac` bỏ qua sự kiện đã có biên nhận
 *    và đâm vào `@@unique([childId, domainEventId])` nếu có ai chạy song song. Nên nút này
 *    bấm mấy lần cũng được, và việc nền ban đêm không đá nhau với nó.
 *
 * ③ **Có hàng rào tần suất.** Đây là hành động **đắt** (quét sự kiện, ghi nhiều dòng) và
 *    không tốn gì để bấm - đúng hình dạng cần một bộ đếm (§9.35). Bấm nhiều thì bị chặn tạm,
 *    không ai hỏng gì.
 */
export async function dongBoKhoanhKhac(): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập để vào ChicChic Gia đình.");

  const chan = await chanNhip([["dong-bo-bai-hoc", me.id]]);
  if (chan) return nope(chan);

  const r = await dungKhoanhKhac({ parentId: me.id });
  revalidatePath("/gia-dinh");

  if (r.taoBai > 0) {
    return ok(`Đã có thêm ${r.taoBai} khoảnh khắc cho bé từ những việc thật ở chuồng.`);
  }
  if (r.hong > 0) {
    // Nói thật thay vì "đã đồng bộ xong": im lặng ở đây nghĩa là cha mẹ chờ mãi một thứ
    // không bao giờ tới.
    return nope("Có vài việc chưa dựng được thành khoảnh khắc - nông trại đã ghi lại để xem.");
  }
  return ok("Chưa có gì mới. Khi cô chú làm xong một việc ở chuồng, mình sẽ có thêm.");
}

// ---------------------------------------------------------------------------
// Khu của bé (Epic 5)
// ---------------------------------------------------------------------------

/**
 * Cửa chung của ba hành động bên dưới: **cha mẹ sở hữu bé, bé còn hiệu lực, bài đúng của bé**.
 *
 * ⚠️ Phiên đăng nhập ở đây là phiên của **cha mẹ** - khu của bé chạy trong đó (spec §15.4).
 * Nên cổng thật không phải "ai đang cầm máy" mà là ba phép so ở `moBaiCuaBe`, và cả ba đều
 * chạy lại **mỗi lần gọi**: rút consent giữa lúc một tab của bé đang mở là ca có thật.
 */
async function baiCuaBe(momentId: unknown) {
  const me = await chaMe();
  if (!me) return null;
  return moBaiCuaBe(me.id, String(momentId ?? ""));
}

/**
 * Bé mở một bài ra (`AVAILABLE` → `STARTED`, spec §16.2 `startLearningMoment`).
 *
 * So-sánh-rồi-đặt (§9.24), và **không** coi "đổi 0 dòng" là lỗi: bài đã `STARTED` hoặc đã
 * `COMPLETED` thì bé chỉ đang xem lại - trả về `ok` để màn hình cứ chạy tiếp. Đây là hành động
 * duy nhất trong repo mà một đứa trẻ 5 tuổi bấm, nên nó không được có đường nào dẫn tới một
 * câu báo lỗi đỏ.
 */
export async function batDauBai(input: { momentId: string }): Promise<ActionResult> {
  const b = await baiCuaBe(input?.momentId);
  if (!b) return nope("Chưa mở được bài này.");

  const { count } = await prisma.learningMoment.updateMany({
    where: { id: b.bai.id, childId: b.be.id, status: "AVAILABLE" },
    data: { status: "STARTED", startedAt: new Date() },
  });
  if (count > 0) {
    await track("learning_moment_started", {
      userId: b.parentId,
      props: { unitKey: b.bai.unitKey, contentVersion: b.bai.contentVersion, ageBand: b.be.ageBand },
    });
  }
  return ok("");
}

/**
 * Bé làm xong một bài (spec §16.2 `completeLearningMoment`).
 *
 * Ba điều đáng nhớ:
 *
 * ① **Idempotent một cách tử tế.** Hai tab cùng mở, bé bấm xong ở tab kia trước - tab này
 *    không được hiện lỗi, mà phải nói "bé làm xong rồi" và vẫn cho xem lại (điều kiện nghiệm
 *    thu của Epic 5). Tải lại trang cũng vậy: không nhân bản, không mất trạng thái.
 *
 * ② **Lựa chọn của bé được lọc theo BẢN CHỤP của chính bài đó**, không theo catalog hiện tại.
 *    Khoá lạ bị bỏ đi - `momentId` và `chon` đều là thứ gửi từ ngoài vào (§9.6).
 *
 * ③ **Không có điểm, không có "sai".** Ta lưu bé đã chọn gì, không lưu bé chọn đúng mấy câu
 *    (§8.2). Cột `completion` vì thế chỉ là danh sách khoá đóng.
 */
export async function xongBai(input: {
  momentId: string;
  luaChon?: { the: number; chon: string }[];
}): Promise<ActionResult> {
  const b = await baiCuaBe(input?.momentId);
  if (!b) return nope("Chưa mở được bài này.");

  if (b.bai.status === "COMPLETED") return ok("Bé làm xong bài này rồi 🎉");

  const luaChon = locLuaChon(b.bai.contentSnapshot as unknown, input?.luaChon);
  const { count } = await prisma.learningMoment.updateMany({
    where: { id: b.bai.id, childId: b.be.id, status: { in: ["AVAILABLE", "STARTED"] } },
    data: { status: "COMPLETED", completedAt: new Date(), completion: { luaChon } },
  });
  // Đổi 0 dòng = tab khác vừa xong trước. Không phải lỗi.
  if (count === 0) return ok("Bé làm xong bài này rồi 🎉");

  await track("learning_moment_completed", {
    userId: b.parentId,
    props: { unitKey: b.bai.unitKey, contentVersion: b.bai.contentVersion, ageBand: b.be.ageBand },
  });
  revalidatePath(`/be/${b.be.id}`);
  return ok("Giỏi lắm! 🎉");
}

/**
 * Đánh dấu đã làm xong nhiệm vụ CÙNG cha mẹ ngoài đời (spec §16.2 `completeFamilyMission`).
 *
 * Chỉ một dấu tick - **không tải ảnh, không gõ chữ**. Nhiệm vụ này xảy ra ngoài đời (cùng nấu
 * một món, cùng đếm lại hộp trứng); bắt chụp ảnh làm bằng chứng là kéo đúng thứ ta muốn đẩy ra
 * khỏi màn hình quay trở lại vào màn hình.
 */
export async function xongNhiemVu(input: { momentId: string }): Promise<ActionResult> {
  const b = await baiCuaBe(input?.momentId);
  if (!b) return nope("Chưa mở được bài này.");

  const nv = (b.bai.contentSnapshot as { familyMission?: { key?: string } } | null)?.familyMission;
  if (!nv?.key) return nope("Bài này không có nhiệm vụ nào cả.");

  const { count } = await prisma.learningMoment.updateMany({
    where: { id: b.bai.id, childId: b.be.id, missionDoneAt: null },
    data: { missionDoneAt: new Date() },
  });
  if (count === 0) return ok("Cả nhà làm xong rồi 💚");

  await track("family_mission_completed", { userId: b.parentId, props: { missionKey: nv.key } });
  revalidatePath(`/be/${b.be.id}`);
  return ok("Tuyệt vời! Cả nhà vừa làm xong cùng nhau 💚");
}

/**
 * Cổng ra khỏi khu của bé (spec §15.4).
 *
 * ⚠️ **Cố ý gõ lại mật khẩu chứ không dựng mã PIN**, và đây là một lựa chọn có đánh đổi:
 *  · một mã PIN bốn số là **một bí mật mới** phải băm, lưu và bảo vệ, đổi lại một chút tiện;
 *  · mật khẩu thì đã có sẵn đường kiểm (`verifyPassword`), không thêm cột nào, không thêm thứ
 *    gì để lộ.
 * Bước ra khỏi khu của bé là việc hiếm, nên phía tiện lợi không đáng để đổi lấy một credential
 * nữa trong DB.
 *
 * ⚠️ **KHÔNG đóng dấu `Session.reauthAt`.** Nếu dùng chung dấu với `xacMinhLai` thì mỗi lần
 * cha mẹ thoát khu của bé sẽ **âm thầm mở 10 phút** cho ba việc nhạy cảm nhất (tạo hồ sơ · rút
 * consent · xoá dữ liệu). Một cửa mở ra vì lý do khác hẳn là đúng kiểu quyền leo thang lặng lẽ.
 * Hàm này chỉ trả lời có/không và **không ghi gì cả**.
 */
export async function moCuaRaNgoai(input: { password: string }): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập.");

  // Đây là một cửa dò mật khẩu: máy đang nằm trong tay trẻ con, và một phiên hợp lệ đã mở sẵn.
  const chan = await chanNhip([["xac-minh-lai", me.id]]);
  if (chan) return nope(chan);

  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!u?.passwordHash) return nope("Tài khoản này chưa đặt mật khẩu.");
  if (!(await verifyPassword(String(input?.password ?? ""), u.passwordHash))) {
    return nope("Mật khẩu chưa đúng.");
  }
  await xoaNhip([["xac-minh-lai", me.id]]);
  return ok("Đúng rồi - mời bố mẹ.");
}
