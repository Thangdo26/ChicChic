"use server";
// FAMILY LEARNING - thao tác của quản trị nông trại (spec §16.3, Epic 1).
//
// Đợt này mới có đúng một việc: **mời một chuồng vào pilot**. Cha mẹ nhận lời mời, tạo hồ
// sơ trẻ và consent là Epic 2 - và cho tới lúc đó, lời mời **không đụng gì tới đàn gà**.
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
    // Không hứa gì về vòng đời ở đây - trang nhận lời mời (Epic 2) mới là chỗ nói đủ rồi
    // mới hỏi. Một câu chuông không phải chỗ để lấy sự đồng ý về số phận một đàn gà.
    body: `${barn.label} được mời vào chương trình học cùng con. Mở ra đọc rồi quyết định nhé - chưa có gì thay đổi cho tới khi bạn đồng ý.`,
    href: `/chuong/${slug}`,
  });
  // §17.5 của spec: props tối thiểu, không nhãn chuồng, không dữ liệu người.
  await track("family_invited", { userId: barn.ownerId, barnSlug: slug, props: { cohortKey } });

  revalidatePath("/admin");
  return ok(`Đã mời ${barn.label} vào nhóm ${cohortKey}. Chủ chuồng nhận được chuông rồi.`);
}
