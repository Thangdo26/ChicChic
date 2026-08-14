"use server";
// FAMILY LEARNING - thao tác của quản trị nông trại (spec §16.3, Epic 1 + Epic 7).
//
// Ba việc: **mời một chuồng vào pilot**, **tạm dừng một suất** và **mở lại**. Cha mẹ nhận
// lời mời, tạo hồ sơ trẻ và consent là Epic 2 - và cho tới lúc đó, lời mời **không đụng gì
// tới đàn gà**.
//
// ⚠️ Mỗi hàm ở đây là một endpoint công khai (§1.2 luật 4). `isAdmin()` phải là dòng đầu.
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin";
import { FAMILY_PROGRAM_VERSION } from "@/lib/family-gates";
import { batFamily } from "@/lib/family";
import { cleanLine } from "@/lib/decor";
import { notify } from "@/lib/notify";
import { track } from "@/lib/track";
import { timLyDoTamDung } from "@/lib/van-hanh-meta";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/** Nhóm pilot mặc định. Ngắn, không dấu - nó đi vào cột để so cohort, không phải để đọc. */
const COHORT_MAC_DINH = "pilot-1";

/**
 * Mời một chuồng vào chương trình Family Learning.
 *
 * Bốn điều kiện, và mỗi cái đứng đây vì một lý do khác nhau:
 *
 *  1. **Chuồng phải có chủ.** Lời mời gửi cho một *người*; chuồng chưa ai nhận thì không
 *     có ai để mời.
 *  2. **Phải là gà đẻ (`LAYER`).** FL-D03. Gà thịt nuôi 75 ngày rồi kết thúc bằng lò mổ -
 *     đó không phải chương trình dành cho trẻ 5–8 tuổi, và §18.4 của spec nói rõ nội dung
 *     về cái chết phải có chuyên gia duyệt trước.
 *  3. **Đàn chưa đóng.** Mời một đàn đang ở `HARVESTED`/`RETIRED` là mời vào một chương
 *     trình không còn gì để kể.
 *  4. **Chuồng chưa có suất nào đang sống.** Chốt thật nằm ở khoá `barnLiveKey` unique
 *     dưới DB, không ở phép tra bên trên: hai người trực bấm cùng lúc là hai câu lệnh xen
 *     kẽ nhau và cả hai cùng đọc được "chưa có suất nào" (§9.24). Phép tra bên trên chỉ để
 *     nói được câu tử tế; khoá unique mới là thứ giữ.
 *
 * ⚠️ **Không đụng `Flock.lifecyclePolicy` ở đây.** Cam kết chỉ khoá khi cha mẹ **đồng ý rõ
 * ràng** (spec §10.1 bước 6, làm ở Epic 2). Khoá ngay lúc mời là quyết định thay người
 * khác về số phận một đàn gà thật, dựa trên một cái bấm của người thứ ba.
 */
export async function inviteFamilyEnrollment(input: {
  barnSlug: string;
  cohortKey?: string;
}): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");
  // Cờ tắt ⟹ không có tính năng nào cả, kể cả cho quản trị. Kill switch phải cắt được từ
  // gốc, không phải chỉ giấu nút đi (§22.3 của spec).
  if (!batFamily()) return nope("Chương trình ChicChic Gia đình đang tắt trên hệ thống này.");

  const slug = String(input?.barnSlug ?? "").trim();
  if (!slug) return nope("Chưa chọn chuồng nào.");
  const cohortKey = cleanLine(input?.cohortKey || COHORT_MAC_DINH, 40) || COHORT_MAC_DINH;

  const barn = await prisma.barn.findUnique({
    where: { slug },
    select: {
      id: true, label: true, ownerId: true,
      flock: { select: { productLine: true, stage: true } },
    },
  });
  if (!barn) return nope("Không tìm thấy chuồng này.");
  if (!barn.ownerId) return nope(`${barn.label} chưa có chủ - chưa có ai để mời.`);
  if (!barn.flock) return nope(`${barn.label} chưa có đàn nào.`);
  if (barn.flock.productLine !== "LAYER") {
    return nope("Chương trình cho trẻ hiện chỉ áp dụng với chuồng gà đẻ.");
  }
  if (barn.flock.stage === "HARVESTED" || barn.flock.stage === "RETIRED") {
    return nope(`Đàn ở ${barn.label} đã khép vòng đời - mời vào lúc này thì không còn gì để kể cho bé.`);
  }

  const dangCo = await prisma.familyEnrollment.findFirst({
    where: { barnId: barn.id, status: { in: ["INVITED", "ACTIVE", "PAUSED"] } },
    select: { status: true },
  });
  if (dangCo) {
    return nope(dangCo.status === "INVITED"
      ? `${barn.label} đã có một lời mời đang chờ chủ chuồng trả lời.`
      : `${barn.label} đã tham gia chương trình rồi.`);
  }

  try {
    await prisma.familyEnrollment.create({
      data: {
        barnId: barn.id,
        parentId: barn.ownerId,
        status: "INVITED",
        cohortKey,
        programVersion: FAMILY_PROGRAM_VERSION,
        lifecyclePolicy: "FAMILY_RETIRE_ONLY",
        barnLiveKey: barn.id,
      },
    });
  } catch {
    // Đụng khoá `barnLiveKey` unique = có người vừa mời trước mình vài mili giây. Đây là
    // kết cục ĐÚNG, không phải lỗi cần báo động: chuồng vẫn chỉ có một suất.
    return nope(`${barn.label} vừa được mời rồi - tải lại trang để thấy.`);
  }

  await notify({
    userId: barn.ownerId,
    kind: "MILESTONE",
    title: "Lời mời tham gia ChicChic Gia đình 🌾",
    // Không hứa gì về vòng đời ở đây - trang `/gia-dinh` mới là chỗ nói đủ rồi mới hỏi.
    // Một câu chuông không phải chỗ để lấy sự đồng ý về số phận một đàn gà.
    body: `${barn.label} được mời vào chương trình học cùng con. Mở ra đọc rồi quyết định nhé - chưa có gì thay đổi cho tới khi bạn đồng ý.`,
    href: "/gia-dinh",
  });
  // §17.5 của spec: props tối thiểu, không nhãn chuồng, không dữ liệu người.
  await track("family_invited", { userId: barn.ownerId, barnSlug: slug, props: { cohortKey } });

  revalidatePath("/admin");
  return ok(`Đã mời ${barn.label} vào nhóm ${cohortKey}. Chủ chuồng nhận được chuông rồi.`);
}

// ---------------------------------------------------------------------------
// Tạm dừng / mở lại MỘT suất (Epic 7 · spec §22.3)
// ---------------------------------------------------------------------------

/**
 * Kill switch cho tới trước Epic 7 chỉ có đúng một mức: `FAMILY_LEARNING_ENABLED`, tắt là
 * tắt cả chương trình cho mọi nhà. Spec §22.3 đòi bốn mức tắt độc lập, và mức thiếu đau
 * nhất là mức này - **một suất**. Nông trại có chuyện ở đúng một chuồng thì thứ cần làm là
 * dừng đúng chuồng đó, chứ không phải tắt đèn nhà mười lăm gia đình khác.
 *
 * ⭐⭐ **Tắt trải nghiệm số KHÔNG được đụng vào bốn thứ** (spec §22.3, và bộ kiểm soi từng
 * cái một):
 *
 *  1. **Không dừng chăm gà.** Không đụng `BarnTask`, không đụng `Barn.workerId`. Cô chú
 *     sáng mai vẫn ra chuồng, vì đàn gà không biết pilot là gì.
 *  2. **Không xoá sự kiện nông trại.** `DomainEvent` là bản ghi những gì đã xảy ra ngoài
 *     đời; dừng một suất không làm chúng chưa từng xảy ra. Bài học ngừng **sinh mới**
 *     (materializer lọc `enrollment.status === "ACTIVE"`), thế là đủ.
 *  3. **Không mở lại `MEAT` cho đàn của gia đình.** `Flock.lifecyclePolicy` không được
 *     chạm tới ở đây - §9.37. Đó là lời hứa với một đứa trẻ, và nó không hết hiệu lực vì
 *     người trực bấm một cái nút.
 *  4. **Không đụng consent.** `ChildProfile.status` giữ nguyên `ACTIVE`. Tạm dừng là
 *     quyết định **vận hành** của nông trại; rút lời đồng ý là quyết định về **dữ liệu**
 *     của cha mẹ. Trộn hai thứ là để nông trại rút consent thay gia đình.
 *
 * Khu của bé đóng lại ngay và **không phải nhờ dòng nào ở đây**: `moKhuCuaBe` vốn đã đòi
 * `enrollment: { status: "ACTIVE" }` từ Epic 5. Cổng cũ làm đúng việc của nó - đây chỉ là
 * một trạng thái mới đi qua cùng cái cổng đó.
 */
export async function tamDungSuat(input: {
  enrollmentId: string;
  lyDo: string;
}): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");
  if (!batFamily()) return nope("Chương trình ChicChic Gia đình đang tắt trên hệ thống này.");

  // Danh sách đóng, tra TRƯỚC khi chạm DB (§9.6). Câu ở `choChaMe` hiện thẳng lên
  // `/gia-dinh` của một gia đình, nên nó phải là chữ đã viết sẵn, không phải chữ vừa gõ.
  const ly = timLyDoTamDung(input?.lyDo);
  if (!ly) return nope("Chọn một lý do tạm dừng đã nhé.");

  const suat = await prisma.familyEnrollment.findUnique({
    where: { id: String(input?.enrollmentId ?? "") },
    select: {
      id: true, status: true, parentId: true, cohortKey: true,
      barn: { select: { slug: true, label: true } },
    },
  });
  if (!suat) return nope("Không tìm thấy suất tham gia này.");
  if (suat.status === "PAUSED") return ok(`${suat.barn.label} đang tạm dừng sẵn rồi.`);
  if (suat.status !== "ACTIVE") {
    return nope(
      `${suat.barn.label} chưa tham gia (hoặc đã kết thúc) - không có gì để tạm dừng.`,
    );
  }

  // So-sánh-rồi-đặt (§9.24): hai người trực cùng bấm là hai câu lệnh xen kẽ nhau, và cả hai
  // cùng đọc được `ACTIVE` ở trên. Chỉ người thắng mới đi tiếp gửi chuông.
  const { count } = await prisma.familyEnrollment.updateMany({
    where: { id: suat.id, status: "ACTIVE" },
    data: { status: "PAUSED", pausedAt: new Date(), pauseReason: ly.khoa },
  });
  if (count === 0) return ok(`${suat.barn.label} vừa được tạm dừng rồi - tải lại trang để thấy.`);

  // Cha mẹ phải biết TRƯỚC khi con hỏi. Màn hình tắt đèn mà không ai nói gì là cách chắc
  // chắn nhất để một gia đình nghĩ app hỏng hoặc đàn gà có chuyện.
  await notify({
    userId: suat.parentId,
    kind: "MILESTONE",
    title: "Phần học cùng con tạm nghỉ ít hôm 🌾",
    body: ly.choChaMe,
    href: "/gia-dinh",
  });
  // §17.5: props tối thiểu, không nhãn chuồng, không dữ liệu người.
  await track("family_enrollment_paused", {
    userId: suat.parentId,
    props: { cohortKey: suat.cohortKey, lyDo: ly.khoa },
  });

  revalidatePath("/admin");
  revalidatePath("/gia-dinh");
  return ok(`Đã tạm dừng ${suat.barn.label}. Chủ chuồng nhận được chuông kèm lý do rồi - đàn gà vẫn chăm như thường.`);
}

/**
 * Mở lại một suất đang tạm dừng.
 *
 * Đối xứng với `tamDungSuat`, và cũng **không đụng gì tới đàn**: bài học sinh tiếp từ những
 * sự kiện xảy ra **từ đây trở đi**. Cố ý không dựng lại những bài đã bỏ lỡ trong lúc dừng -
 * chuyện xảy ra ở chuồng tuần trước mà giờ mới kể thì đã không còn là "chuyện hôm nay của
 * đàn gà nhà con" nữa, mà đó chính là điều duy nhất làm sản phẩm này khác một app học bình
 * thường.
 *
 * `pauseReason` **giữ nguyên** sau khi mở lại: đó là lịch sử vận hành, và "suất này từng
 * dừng vì cái gì" là câu người đọc báo cáo pilot sẽ hỏi. Nó chỉ được **hiện ra** khi trạng
 * thái đang là `PAUSED`.
 */
export async function moLaiSuat(input: { enrollmentId: string }): Promise<ActionResult> {
  if (!(await isAdmin())) return nope("Thao tác này chỉ dành cho quản trị nông trại.");
  if (!batFamily()) return nope("Chương trình ChicChic Gia đình đang tắt trên hệ thống này.");

  const suat = await prisma.familyEnrollment.findUnique({
    where: { id: String(input?.enrollmentId ?? "") },
    select: {
      id: true, status: true, parentId: true, cohortKey: true,
      barn: { select: { slug: true, label: true } },
    },
  });
  if (!suat) return nope("Không tìm thấy suất tham gia này.");
  if (suat.status === "ACTIVE") return ok(`${suat.barn.label} đang chạy sẵn rồi.`);
  if (suat.status !== "PAUSED") {
    return nope(`${suat.barn.label} không ở trạng thái tạm dừng - không mở lại được.`);
  }

  const { count } = await prisma.familyEnrollment.updateMany({
    where: { id: suat.id, status: "PAUSED" },
    data: { status: "ACTIVE", pausedAt: null },
  });
  if (count === 0) return ok(`${suat.barn.label} vừa được mở lại rồi - tải lại trang để thấy.`);

  await notify({
    userId: suat.parentId,
    kind: "MILESTONE",
    title: "Phần học cùng con mở lại rồi 🌱",
    body: "Chuồng có chuyện gì mới là bé lại có bài để xem. Cảm ơn nhà mình đã chờ nhé.",
    href: "/gia-dinh",
  });
  await track("family_enrollment_resumed", {
    userId: suat.parentId,
    props: { cohortKey: suat.cohortKey },
  });

  revalidatePath("/admin");
  revalidatePath("/gia-dinh");
  return ok(`Đã mở lại ${suat.barn.label}. Bài mới sẽ sinh từ những chuyện xảy ra từ bây giờ.`);
}
