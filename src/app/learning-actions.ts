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
import { getSessionUser } from "@/lib/auth";
import { batFamily } from "@/lib/family";
import { chanNhip } from "@/lib/nhip";
import { dungKhoanhKhac } from "@/lib/bai-hoc";

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
