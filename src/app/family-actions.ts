"use server";
// FAMILY LEARNING - thao tác của CHA MẸ (spec §16.1, Epic 2).
//
// ⚠️ Mỗi hàm ở đây là một **endpoint công khai** (§1.2 luật 4). Không một dòng nào trong file
// này được tin vào việc "giao diện đã không vẽ cái nút đó ra".
//
// Bốn thứ file này canh, xếp theo mức không-được-hỏng:
//
//  1. **Cha mẹ A không chạm được hồ sơ con của cha mẹ B.** Một phép so, ở `canParentManageChild`,
//     dùng chung cho mọi đường - không chép tay lần thứ hai (§11.37).
//  2. **`Flock.lifecyclePolicy` chỉ có ĐÚNG MỘT đường ghi**, là `nhanLoiMoiGiaDinh` bên dưới,
//     và nó không bao giờ đảo ngược (§9.37). Rút consent hay xoá dữ liệu con **không** đụng
//     tới nó - đàn gà thật đã được hứa sẽ về hưu, và lời hứa đó không phụ thuộc vào việc
//     cuốn album của bé còn hay mất.
//  3. **Ba việc phải gõ lại mật khẩu**: tạo hồ sơ · rút consent · xoá dữ liệu (spec §17.1).
//  4. **Không thu gì ngoài ba trường đã khai** (FL-D11). Không ngày sinh, không trường lớp,
//     không vị trí, không ảnh/giọng của bé - kể cả khi có người gửi kèm vào `FormData`.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSessionUser, verifyPassword } from "@/lib/auth";
import { cleanLine } from "@/lib/decor";
import { chanNhip, xoaNhip } from "@/lib/nhip";
import { batFamily, daXacMinhGanDay, dongDauXacMinh, xoaDauXacMinh } from "@/lib/family";
import {
  CONSENT_PURPOSES, CONSENT_VERSION, FAMILY_PROGRAM_VERSION, MAX_BIET_DANH,
  canAssent, canParentManageChild, hopLeAvatar, hopLeNhomTuoi, type NhomTuoi,
} from "@/lib/family-gates";
import { notify } from "@/lib/notify";
import { ghiSuKien } from "@/lib/su-kien";
import { track } from "@/lib/track";
import { goiDuLieuTre } from "@/lib/xuat-du-lieu";
import { tenTepXuat } from "@/lib/van-hanh-meta";

export type ActionResult = { ok: boolean; message: string };
const ok = (message: string): ActionResult => ({ ok: true, message });
const nope = (message: string): ActionResult => ({ ok: false, message });

/**
 * Câu từ chối chung cho "chưa gõ lại mật khẩu". Một câu duy nhất, ở một chỗ duy nhất.
 *
 * ⚠️ Nói **tải lại trang này**, không nói "mở lại trang ChicChic Gia đình" như bản đầu: cả
 * hai trang gọi tới đây (`/gia-dinh/tre-moi` và `/gia-dinh/quyen-rieng-tu`) đều tự chuyển
 * sang màn gõ mật khẩu ngay khi dấu xác minh hết hạn, nên tải lại là xong. Câu cũ bảo người
 * ta đi tới một chỗ họ **đang đứng** - và ca gặp nó thật là ca dấu xác minh hết hạn trong lúc
 * họ còn đang đọc, tức đúng lúc không nên bắt ai phải đoán.
 */
const CAN_XAC_MINH = "Việc này cần bạn gõ lại mật khẩu một lần nữa - tải lại trang này là mình hỏi ngay.";

/**
 * Cửa chung của mọi hành động trong file này: **đăng nhập + cờ tổng còn bật**.
 *
 * Cờ tắt ⟹ từ chối, kể cả với người đã có hồ sơ trẻ từ trước. Kill switch phải cắt được từ
 * gốc chứ không phải chỉ giấu nút đi (§22.3 của spec) - lúc phải tắt là lúc có gì đó không
 * ổn với nội dung dành cho trẻ, và "người dùng cũ vẫn dùng tiếp" là đúng thứ không được có.
 */
async function chaMe(): Promise<{ id: string } | null> {
  if (!batFamily()) return null;
  const me = await getSessionUser();
  return me ? { id: me.id } : null;
}

// ---------------------------------------------------------------------------
// Xác minh lại
// ---------------------------------------------------------------------------

/**
 * Gõ lại mật khẩu để mở cửa cho một việc nhạy cảm (spec §17.1, Epic 2 mục 2).
 *
 * **Dùng lại hạ tầng đã có, không dựng cơ chế mới** - đúng ghi chú §C.2 của spec v1.1:
 * `verifyPassword` của `lib/auth.ts` và bảng đếm của `lib/nhip.ts`. Cái mới duy nhất là một
 * cột `Session.reauthAt`.
 *
 * ⚠️ **Đếm TRƯỚC khi so mật khẩu**, cùng lý do với `login` (§11.50): muốn biết đúng hay sai
 * thì phải so xong đã, mà "đọc bộ đếm rồi mới ghi" là chỗ 200 lượt song song cùng đi lọt.
 * Gõ đúng thì bộ đếm được xoá, nên không ai tự khoá mình.
 */
export async function xacMinhLai(input: { password: string }): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập để vào ChicChic Gia đình.");

  const chan = await chanNhip([["xac-minh-lai", me.id]]);
  if (chan) return nope(chan);

  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { passwordHash: true } });
  if (!u?.passwordHash) {
    // Tài khoản cũ chưa đặt mật khẩu. Không có gì để gõ lại ⟹ không mở cửa được. Nói thẳng
    // đường đi thay vì để họ gõ mãi một ô không bao giờ đúng.
    return nope("Tài khoản này chưa đặt mật khẩu. Vào Tài khoản đặt mật khẩu trước rồi quay lại nhé.");
  }
  if (!(await verifyPassword(String(input?.password ?? ""), u.passwordHash))) {
    return nope("Mật khẩu chưa đúng.");
  }

  await xoaNhip([["xac-minh-lai", me.id]]);
  if (!(await dongDauXacMinh())) return nope("Chưa ghi được dấu xác minh - thử lại giúp nhé.");
  return ok("Đã xác minh. Bạn có 10 phút để làm việc vừa chọn.");
}

// ---------------------------------------------------------------------------
// Hồ sơ trẻ
// ---------------------------------------------------------------------------

/**
 * Cha mẹ tạo hồ sơ cho một bé (spec §16.1 `createChildProfile`).
 *
 * Ba trường, hết. `nickname` qua `cleanLine` như mọi chữ người dùng gõ trong repo này;
 * `ageBand` và `avatarKey` phải nằm trong danh sách đóng ở `family-gates.ts` - **kiểm ở
 * server**, vì cái `<select>` ngoài kia không chặn được một dòng `curl`.
 *
 * Trạng thái sau khi tạo:
 *  · nhóm **5–6** ⟹ `ACTIVE` ngay. Bé chưa đọc trôi, chỗ này dựa vào cha mẹ (spec §17.1).
 *  · nhóm **7–8** ⟹ `DRAFT`, chờ chính bé nói đồng ý ở bước sau. Chưa hỏi bé thì hồ sơ
 *    chưa dùng được - đó là điều kiện nghiệm thu "7–8 cần assent theo policy sản phẩm".
 *
 * Hồ sơ và dấu mốc consent ghi trong **cùng một transaction**: một hồ sơ `ACTIVE` mà cuốn
 * sổ không có dòng nào là một hồ sơ không chứng minh được ai đã đồng ý.
 */
export async function taoHoSoTre(input: {
  nickname: string;
  ageBand: string;
  avatarKey: string;
}): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập để vào ChicChic Gia đình.");
  if (!(await daXacMinhGanDay())) return nope(CAN_XAC_MINH);

  const chan = await chanNhip([["ho-so-tre", me.id]]);
  if (chan) return nope(chan);

  const nickname = cleanLine(input?.nickname, MAX_BIET_DANH);
  if (!nickname) return nope("Bé chưa có tên gọi nào - đặt một cái tên ngắn ở nhà hay gọi nhé.");
  if (!hopLeNhomTuoi(input?.ageBand)) return nope("Chưa chọn nhóm tuổi cho bé.");
  if (!hopLeAvatar(input?.avatarKey)) return nope("Hình đại diện này không có trong danh sách.");
  const ageBand: NhomTuoi = input.ageBand;

  // Nhóm 7–8 còn phải hỏi chính bé; chưa hỏi thì hồ sơ để nháp.
  const status = canAssent(ageBand) ? "DRAFT" : "ACTIVE";
  const now = new Date();

  const child = await prisma.$transaction(async (tx) => {
    const c = await tx.childProfile.create({
      data: {
        parentId: me.id,
        nickname,
        ageBand,
        avatarKey: input.avatarKey,
        status,
        consentVersion: CONSENT_VERSION,
        consentedAt: now,
      },
      select: { id: true, nickname: true },
    });
    await tx.childConsentEvent.create({
      data: {
        childId: c.id,
        parentId: me.id,
        action: "GRANTED",
        policyVersion: CONSENT_VERSION,
        // Chụp nguyên văn danh sách mục đích: một năm sau vẫn dựng lại được đúng thứ họ đọc.
        purposes: [...CONSENT_PURPOSES],
        // ⚠️ CHỈ cách xác minh và mốc thời gian. Không mật khẩu, không giấy tờ, không IP.
        evidence: { method: "password_reauth", at: now.toISOString() },
      },
    });
    return c;
  });

  // Dấu xác minh dùng xong là bỏ - nó mở cửa cho MỘT việc, không mở một khoảng thời gian.
  await xoaDauXacMinh();
  // §17.5: chỉ nhóm tuổi. Không biệt danh, không `childId`, không hình đại diện.
  await track("family_profile_created", { userId: me.id, props: { ageBand } });

  revalidatePath("/gia-dinh");
  return ok(canAssent(ageBand)
    ? `Đã tạo hồ sơ cho ${child.nickname}. Còn một bước nữa: hỏi chính bé xem bé có muốn không.`
    : `Đã tạo hồ sơ cho ${child.nickname}.`);
}

/**
 * Bé 7–8 tuổi tự nói có muốn tham gia không (spec §16.1 `recordChildAssent`).
 *
 * ⚠️ **"Không" là một câu trả lời thật.** Hồ sơ ở lại `DRAFT` và không ai vào được khu của
 * bé. Cám dỗ ở đây là làm cái nút "để sau" rồi lặng lẽ bật `ACTIVE` - làm thế thì cả nghi
 * thức này chỉ là một màn hình đẹp. Cha mẹ hỏi lại lúc khác được; hệ thống thì không tự
 * đổi câu trả lời của bé.
 *
 * Cổng: `parent session + owns child + nhóm 7–8`. **Không** đòi gõ lại mật khẩu - spec
 * §16.1 cố ý để nhẹ, vì đây là màn hình cha mẹ mở ra cho bé xem ngay lúc đó, và chen một
 * ô mật khẩu vào giữa là chen người lớn vào giữa câu hỏi dành cho bé.
 */
export async function ghiNhanAssent(input: {
  childId: string;
  dongY: boolean;
}): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập để vào ChicChic Gia đình.");

  const child = await prisma.childProfile.findUnique({
    where: { id: String(input?.childId ?? "") },
    select: { id: true, parentId: true, status: true, ageBand: true, nickname: true },
  });
  if (!child) return nope("Không tìm thấy hồ sơ này.");
  if (!canParentManageChild({ sessionUserId: me.id, parentId: child.parentId, childStatus: child.status })) {
    return nope("Hồ sơ này không thuộc tài khoản của bạn.");
  }
  if (!canAssent(child.ageBand)) return nope("Nhóm tuổi này không cần bước hỏi ý bé.");
  if (child.status !== "DRAFT") return nope("Hồ sơ này đã qua bước hỏi ý bé rồi.");

  const dongY = input?.dongY === true;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // So-sánh-rồi-đặt trong `WHERE`: hai tab cùng bấm thì chỉ một tab đổi được trạng thái.
    if (dongY) {
      await tx.childProfile.updateMany({
        where: { id: child.id, parentId: me.id, status: "DRAFT" },
        data: { status: "ACTIVE", assentedAt: now },
      });
    }
    await tx.childConsentEvent.create({
      data: {
        childId: child.id,
        parentId: me.id,
        action: "ASSENTED",
        policyVersion: CONSENT_VERSION,
        purposes: [...CONSENT_PURPOSES],
        childAssent: dongY,
        evidence: { method: "parent_present", at: now.toISOString() },
      },
    });
  });

  revalidatePath("/gia-dinh");
  return dongY
    ? ok(`${child.nickname} đã đồng ý. Hồ sơ sẵn sàng rồi.`)
    : ok(`Đã ghi lại là ${child.nickname} chưa muốn. Hỏi lại lúc khác cũng được - không sao cả.`);
}

// ---------------------------------------------------------------------------
// Nhận lời mời - ĐƯỜNG DUY NHẤT khoá vòng đời đàn (§9.37)
// ---------------------------------------------------------------------------

/**
 * Cha mẹ nhận lời mời cho một chuồng (spec §16.1 `acceptFamilyEnrollment`, §10.2 bước 8).
 *
 * ⚠️⚠️ **ĐÂY LÀ NƠI DUY NHẤT TRONG CẢ REPO GHI `Flock.lifecyclePolicy`** (§9.37). Đọc kỹ
 * trước khi thêm bất kỳ đường nào khác - và trước khi thêm, hãy chắc là nó thật sự cần.
 *
 * Cái được ghi ở đây **không phải một cài đặt**. Nó là một lời hứa với một đứa trẻ rằng
 * con gà nó đặt tên sẽ già đi ở nông trại chứ không đi đâu khác, và nông trại phải giữ lời
 * đó bằng thức ăn và công người thật trong nhiều tháng sau khi đàn hết đẻ. Vì thế:
 *
 *  · **Không đảo ngược.** Không có `boLoiMoi` nào đặt lại `STANDARD`. Rút consent (§17.3),
 *    xoá dữ liệu con (§17.4), admin tạm dừng suất - không cái nào đụng vào cột này.
 *  · **Chỉ khoá khi cha mẹ đồng ý rõ ràng**, không phải lúc quản trị bấm mời (§10.1 bước 6).
 *  · **Một transaction.** Suất `ACTIVE`, mối nối bé↔suất, và cột trên đàn phải cùng sống
 *    hoặc cùng chết. Đàn bị khoá mà suất còn `INVITED` là một đàn gà mang cam kết không ai
 *    nhớ vì sao.
 *
 * Cổng: `parent + owns barn + active consent` (spec §16.1). Cố ý **không** đòi gõ lại mật
 * khẩu: người này vừa tạo hồ sơ con xong bằng đúng cửa đó, và trang nhận lời mời đã nói hết
 * hệ quả trước khi có nút để bấm.
 *
 * `DomainEvent.FAMILY_ENROLLED` ở bước 8 của spec **chưa ghi** - bảng đó là Epic 3. Chỗ đặt
 * nó là ngay trong transaction này (§14).
 */
export async function nhanLoiMoiGiaDinh(input: {
  enrollmentId: string;
  childId: string;
  xacNhan?: boolean;
}): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập để vào ChicChic Gia đình.");
  // Chốt chống-bấm-nhầm, KHÔNG phải cổng quyền: một endpoint công khai thì cờ này ai cũng
  // đặt được. Cổng thật là ba phép kiểm bên dưới.
  if (input?.xacNhan !== true) return nope("Bạn cần tích vào ô xác nhận trước đã.");

  const suat = await prisma.familyEnrollment.findUnique({
    where: { id: String(input?.enrollmentId ?? "") },
    select: {
      id: true, parentId: true, status: true, lifecyclePolicy: true, programVersion: true,
      barn: {
        select: {
          id: true, slug: true, label: true, ownerId: true,
          flock: { select: { id: true, productLine: true, stage: true } },
        },
      },
    },
  });
  if (!suat) return nope("Không tìm thấy lời mời này.");
  // Hai phép so, không phải một: `parentId` là người được mời, `ownerId` là chủ chuồng
  // **lúc này**. Chuồng đổi chủ sau khi mời thì người cũ không được quyết thay người mới.
  if (suat.parentId !== me.id || suat.barn.ownerId !== me.id) {
    return nope("Lời mời này không thuộc tài khoản của bạn.");
  }
  if (suat.status !== "INVITED") {
    return nope(suat.status === "ACTIVE"
      ? "Chuồng này đã tham gia rồi."
      : "Lời mời này không còn hiệu lực.");
  }
  if (!suat.barn.flock) return nope("Chuồng này chưa có đàn nào.");
  if (suat.barn.flock.stage === "HARVESTED" || suat.barn.flock.stage === "RETIRED") {
    return nope("Đàn ở chuồng này đã khép vòng đời rồi.");
  }

  const child = await prisma.childProfile.findUnique({
    where: { id: String(input?.childId ?? "") },
    select: { id: true, parentId: true, status: true, nickname: true },
  });
  if (!child) return nope("Chưa chọn hồ sơ của bé.");
  if (!canParentManageChild({ sessionUserId: me.id, parentId: child.parentId, childStatus: child.status })) {
    return nope("Hồ sơ này không thuộc tài khoản của bạn.");
  }
  // Consent phải đang còn hiệu lực - `DRAFT` (chưa hỏi bé) và `CONSENT_WITHDRAWN` đều không.
  if (child.status !== "ACTIVE") {
    return nope(child.status === "DRAFT"
      ? `Còn thiếu một bước: hỏi ${child.nickname} xem bé có muốn tham gia không.`
      : "Hồ sơ của bé đang không hoạt động.");
  }

  const now = new Date();
  const flockId = suat.barn.flock.id;

  try {
    await prisma.$transaction(async (tx) => {
      // So-sánh-rồi-đặt: hai tab cùng bấm thì tab thứ hai đổi 0 dòng và cả transaction hỏng
      // ở dòng dưới - đúng thứ ta muốn, thay vì hai lần khoá và hai mối nối.
      const doi = await tx.familyEnrollment.updateMany({
        where: { id: suat.id, parentId: me.id, status: "INVITED" },
        data: { status: "ACTIVE", acceptedAt: now },
      });
      if (doi.count !== 1) throw new Error("suat-da-doi-trang-thai");

      await tx.childBarnLink.create({ data: { childId: child.id, enrollmentId: suat.id } });

      // ⭐ Dòng khoá cam kết. Chỉ dòng này, chỉ ở đây.
      await tx.flock.update({
        where: { id: flockId },
        data: { lifecyclePolicy: suat.lifecyclePolicy },
      });

      // Sự kiện nghiệp vụ đầu tiên của bé: "chuồng nhà mình đã vào chương trình". Nằm TRONG
      // transaction nên nó và ba dòng trên sống chết cùng nhau - suất không đổi được trạng
      // thái thì cũng không có sự kiện nào để sinh bài học (§14.3).
      await ghiSuKien(tx, {
        type: "FAMILY_ENROLLED",
        enrollmentId: suat.id, barnId: suat.barn.id, flockId,
        programVersion: suat.programVersion, lifecyclePolicy: suat.lifecyclePolicy,
      }, now);
    });
  } catch {
    return nope("Lời mời vừa đổi trạng thái - tải lại trang để xem lại nhé.");
  }

  await notify({
    userId: me.id,
    kind: "MILESTONE",
    title: "Chuồng đã vào ChicChic Gia đình 🌾",
    body: `${suat.barn.label} sẽ đồng hành cùng ${child.nickname}. Đàn này giờ chỉ còn một chặng cuối: nghỉ hưu ở nông trại.`,
    href: "/gia-dinh",
  });
  await track("family_enrolled", {
    userId: me.id,
    barnSlug: suat.barn.slug,
    props: { programVersion: FAMILY_PROGRAM_VERSION },
  });

  revalidatePath("/gia-dinh");
  revalidatePath(`/chuong/${suat.barn.slug}`);
  return ok(`${suat.barn.label} đã vào chương trình cùng ${child.nickname}.`);
}

// ---------------------------------------------------------------------------
// Rút consent · xoá dữ liệu
// ---------------------------------------------------------------------------

/**
 * Cha mẹ rút lời đồng ý (spec §16.1 `withdrawChildConsent`, §17.3).
 *
 * Khoá khu của bé **ngay lập tức**: `canEnterChildSpace` đòi `status === "ACTIVE"`, nên dòng
 * `updateMany` dưới đây là cái khoá, không cần thêm cờ nào khác.
 *
 * ⚠️ **KHÔNG đụng `Flock.lifecyclePolicy`** (§9.37, spec §17.3 mục 4). Đàn gà không biết gì
 * về consent; cam kết đã hứa thì nông trại giữ, dù cuốn album của bé có còn hay không.
 *
 * Dữ liệu **chưa xoá** ở bước này - cha mẹ được quyền nghĩ lại hoặc xin bản sao trước. Xoá
 * là một quyết định riêng, ở `xoaDuLieuTre`.
 */
export async function rutConsentTre(input: { childId: string }): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập để vào ChicChic Gia đình.");
  if (!(await daXacMinhGanDay())) return nope(CAN_XAC_MINH);

  const child = await prisma.childProfile.findUnique({
    where: { id: String(input?.childId ?? "") },
    select: { id: true, parentId: true, status: true, nickname: true, ageBand: true },
  });
  if (!child) return nope("Không tìm thấy hồ sơ này.");
  if (!canParentManageChild({ sessionUserId: me.id, parentId: child.parentId, childStatus: child.status })) {
    return nope("Hồ sơ này không thuộc tài khoản của bạn.");
  }
  if (child.status === "CONSENT_WITHDRAWN") return nope("Hồ sơ này đã rút rồi.");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.childProfile.updateMany({
      where: { id: child.id, parentId: me.id, status: { in: ["DRAFT", "ACTIVE"] } },
      data: { status: "CONSENT_WITHDRAWN", withdrawnAt: now },
    });
    await tx.childConsentEvent.create({
      data: {
        childId: child.id,
        parentId: me.id,
        action: "WITHDRAWN",
        policyVersion: CONSENT_VERSION,
        purposes: [],
        evidence: { method: "password_reauth", at: now.toISOString() },
      },
    });
  });

  await xoaDauXacMinh();
  await track("consent_withdrawn", { userId: me.id, props: { ageBand: child.ageBand } });

  revalidatePath("/gia-dinh");
  return ok(`Đã rút lời đồng ý cho ${child.nickname}. Khu dành cho bé đóng ngay từ bây giờ.`);
}

/**
 * Cha mẹ xin xoá dữ liệu của bé (spec §16.1 `requestChildDataDeletion`, §17.4).
 *
 * **Xoá gì:** biệt danh và hình đại diện bị bôi trắng, mọi mối nối bé↔suất bị xoá hẳn.
 *
 * **Giữ gì, và vì sao:**
 *  · **Dòng `ChildProfile` ở lại làm bia mộ.** `ChildConsentEvent` cascade từ nó, nên xoá
 *    dòng này là xoá luôn cuốn sổ chứng minh mình đã làm đúng - đúng thứ §17.4 dặn giữ tối
 *    thiểu. Bia mộ không còn gì đọc ra được về đứa trẻ.
 *  · **`ChildProfile.ageBand` ở lại.** Cột `NOT NULL`, không bôi trắng được, và trên một
 *    bia mộ vô danh thì "5–6 hay 7–8" không lần ra ai. ⚠️ **Đây là chỗ lệch với spec
 *    §17.4** (spec xếp nhóm tuổi vào phần phải xoá); ghi ra đây thay vì im lặng làm khác.
 *  · **Chuồng, đàn, ảnh, sổ thu hoạch, hoá đơn ở lại** - đó là dữ liệu vận hành của nông
 *    trại, không phải dữ liệu trẻ.
 *  · ⚠️ **`Flock.lifecyclePolicy` ở lại** (§9.37, spec §17.4). Xoá album của bé không đảo
 *    ngược được lời hứa với con gà.
 */
export async function xoaDuLieuTre(input: { childId: string }): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập để vào ChicChic Gia đình.");
  if (!(await daXacMinhGanDay())) return nope(CAN_XAC_MINH);

  const child = await prisma.childProfile.findUnique({
    where: { id: String(input?.childId ?? "") },
    select: { id: true, parentId: true, status: true, nickname: true, ageBand: true },
  });
  if (!child) return nope("Không tìm thấy hồ sơ này.");
  if (!canParentManageChild({ sessionUserId: me.id, parentId: child.parentId, childStatus: child.status })) {
    return nope("Hồ sơ này không thuộc tài khoản của bạn.");
  }

  const ten = child.nickname;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.childConsentEvent.create({
      data: {
        childId: child.id,
        parentId: me.id,
        action: "DELETE_REQUESTED",
        policyVersion: CONSENT_VERSION,
        purposes: [],
        evidence: { method: "password_reauth", at: now.toISOString() },
      },
    });
    // Mối nối bé↔suất: xoá hẳn. Suất tham gia của nông trại vẫn còn nguyên (`Restrict` chỉ
    // chặn chiều ngược lại), nên cam kết vòng đời không đi theo.
    await tx.childBarnLink.deleteMany({ where: { childId: child.id } });
    await tx.childProfile.update({
      where: { id: child.id },
      data: { nickname: "", avatarKey: "", status: "DELETED", deletedAt: now },
    });
    await tx.childConsentEvent.create({
      data: {
        childId: child.id,
        parentId: me.id,
        action: "DELETED",
        policyVersion: CONSENT_VERSION,
        purposes: [],
        evidence: { method: "password_reauth", at: now.toISOString() },
      },
    });
  });

  await xoaDauXacMinh();
  await track("child_data_deleted", { userId: me.id, props: { ageBand: child.ageBand } });

  revalidatePath("/gia-dinh");
  return ok(`Đã xoá dữ liệu của ${ten}. Chuồng, đàn gà và ảnh của nông trại vẫn còn nguyên - và cam kết nghỉ hưu của đàn cũng vậy.`);
}

/**
 * Cha mẹ tải toàn bộ dữ liệu của bé về máy (Epic 7 · spec §17.3 mục 5).
 *
 * Đây là nửa còn thiếu của lời hứa "dữ liệu này là của bạn": trước đợt này cha mẹ **xoá được
 * nhưng không tải về được**, mà một gia đình biết cuốn album của con sẽ bốc hơi thì sẽ không
 * xoá - họ sẽ chỉ bỏ đó, và thế là quyền rút lui trở thành một câu nói suông.
 *
 * Ba chốt, và cái thứ ba là cái dễ làm sai nhất:
 *
 *  1. **Cùng cổng với rút/xoá**: sở hữu hồ sơ (`canParentManageChild`) + gõ lại mật khẩu.
 *     Một tệp gói cả đời sống số của một đứa trẻ không được rẻ hơn nút rút consent.
 *  2. **Không lọc theo trạng thái hồ sơ.** Rút lời đồng ý rồi thì `canParentManageChild` vẫn
 *     cho qua (chỉ `DELETED`/`DELETION_PENDING` mới đóng), và đó là **cố ý**: rút xong rồi
 *     mới nghĩ tới chuyện tải về là thứ tự tự nhiên nhất của việc rời đi.
 *  3. ⚠️ **KHÔNG gọi `xoaDauXacMinh()` sau khi xong** - khác hẳn ba hàm bên trên. Lý do:
 *     đường đi thật của người dùng là **tải về rồi xoá**, và bắt gõ mật khẩu hai lần trong
 *     một phút không làm ai an toàn hơn, nó chỉ làm bước cuối khó chịu đúng lúc người ta đang
 *     buồn. Việc này **chỉ đọc** - dấu xác minh vẫn tự hết sau `RECENT_AUTH_MS`.
 *
 * Trả chữ về cho client tự dựng tệp thay vì mở một route tải: mở thêm một endpoint là mở
 * thêm một cửa phải canh, mà cửa đó lại nhận id từ thanh địa chỉ - đúng hình dạng của lỗ rò
 * §11.37. Ở đây id đi qua đúng cái cổng mọi hành động khác đã đi qua.
 */
export async function taiDuLieuTre(input: { childId: string }): Promise<
  ActionResult & { tenTep?: string; noiDung?: string }
> {
  const me = await chaMe();
  if (!me) return nope("Bạn cần đăng nhập để vào ChicChic Gia đình.");
  if (!(await daXacMinhGanDay())) return nope(CAN_XAC_MINH);

  const child = await prisma.childProfile.findUnique({
    where: { id: String(input?.childId ?? "") },
    select: { id: true, parentId: true, status: true, nickname: true, ageBand: true },
  });
  if (!child) return nope("Không tìm thấy hồ sơ này.");
  if (!canParentManageChild({ sessionUserId: me.id, parentId: child.parentId, childStatus: child.status })) {
    return nope("Hồ sơ này không thuộc tài khoản của bạn.");
  }

  const goi = await goiDuLieuTre(child.id);
  if (!goi) return nope("Chưa gói được dữ liệu lúc này - thử lại sau một chút nhé.");

  await track("child_data_exported", { userId: me.id, props: { ageBand: child.ageBand } });

  return {
    ok: true,
    message: `Đã tải xong dữ liệu của ${child.nickname}. Tệp nằm trong thư mục Tải về của máy bạn.`,
    tenTep: tenTepXuat(new Date()),
    noiDung: JSON.stringify(goi, null, 2),
  };
}
