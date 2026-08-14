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
import { dungKhoanhKhac, moBaiCuaBe, moKhuCuaBe } from "@/lib/bai-hoc";
import { locLuaChon } from "@/lib/bai-hoc-meta";
import { moMongMuon, taoMongMuon } from "@/lib/de-xuat";
import { notify } from "@/lib/notify";
import { upsertTask } from "@/lib/task-store";
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

// ---------------------------------------------------------------------------
// Mong muốn của bé (Epic 6 - spec §10.4 · §16.2 · FL-D21..D24)
// ---------------------------------------------------------------------------

/**
 * Bé gửi một mong muốn cho bố mẹ (spec §16.2 `createChildSuggestion`).
 *
 * ⚠️⚠️ **Hành động này KHÔNG có tác động thật nào.** Nó ghi đúng một dòng `PENDING` và hết:
 * không việc cho nông dân, không đơn hàng, không đồng tiền nào đổi chỗ (FL-D06/D07). Đó là
 * toàn bộ lý do nó được phép nằm trong tay một đứa trẻ. Ba hàm bên dưới - của **cha mẹ** -
 * mới là nơi một mong muốn biến thành chuyện có thật.
 *
 * Cổng: `moKhuCuaBe` (5 điều kiện, §9.40) + hàng rào tần suất + catalog đóng ở `taoMongMuon`.
 *
 * Mọi nhánh từ chối đều trả `ok` hoặc một câu **tử tế**: đây là màn hình của một đứa trẻ,
 * và "bạn đã vượt giới hạn" không phải câu để nói với một đứa trẻ 5 tuổi.
 */
export async function guiMongMuon(input: {
  childId: string;
  optionKey: string;
}): Promise<ActionResult> {
  const me = await chaMe();
  if (!me) return nope("Chưa gửi được, nhờ bố mẹ giúp nhé.");

  const be = await moKhuCuaBe(me.id, String(input?.childId ?? ""));
  if (!be) return nope("Chưa gửi được, nhờ bố mẹ giúp nhé.");

  const chan = await chanNhip([["mong-muon-cua-be", me.id]]);
  if (chan) return nope("Mình gửi hơi nhiều rồi - nghỉ một lát rồi gửi tiếp nhé.");

  const r = await taoMongMuon({
    childId: be.id, parentId: me.id, enrollmentId: be.enrollmentId, optionKey: input?.optionKey,
  });
  if (!r.ok) {
    // Năm lý do, năm câu khác nhau - và không câu nào là một lời trách.
    const cau: Record<typeof r.ly, string> = {
      "khoa-la": "Chưa gửi được điều này.",
      "da-gui": "Mình đã nhắn bố mẹ điều này rồi 💌",
      "day-hang-cho": "Mình đang có nhiều điều chờ bố mẹ quá - mình nhắc bố mẹ xem giúp nhé!",
      "het-suat-tuan": "Tuần này mình đã nhờ cô chú mấy việc rồi - để tuần sau mình nhờ tiếp nhé.",
      "hong": "Chưa gửi được, mai mình thử lại nhé.",
    };
    // `da-gui` là kết quả BÌNH THƯỜNG (bé bấm lại cùng một nút), nên nó không được đỏ.
    return r.ly === "da-gui" ? ok(cau[r.ly]) : nope(cau[r.ly]);
  }

  // Chỉ `kind`, không `optionKey` - xem chú thích ở `lib/track.ts`.
  await track("child_suggestion_created", { userId: me.id, props: { kind: r.kind } });
  revalidatePath(`/be/${be.id}/mong-muon`);
  revalidatePath("/gia-dinh");
  return ok("Đã nhắn bố mẹ rồi 💌");
}

/** Cổng chung của ba hành động cha mẹ làm với một mong muốn: sở hữu hồ sơ **và** sở hữu chuồng. */
async function mongMuonCuaToi(id: unknown) {
  const me = await chaMe();
  if (!me) return null;
  return moMongMuon(me.id, String(id ?? ""));
}

/**
 * Câu trả lời cho "bạn bấm rồi mà bấm lại".
 *
 * ⚠️ **Đây là một lỗi đã vấp thật ở đợt này.** Cổng lọc sẵn `status: "PENDING"` nên lần bấm
 * thứ hai rơi vào nhánh "không tìm thấy" - một câu vô nghĩa cho thứ cha mẹ vừa bấm, và nghe
 * như app vừa đánh mất lời của con họ. Cùng bài học với §9.40: **trùng thì tử tế**, và "không
 * tìm thấy" chỉ để dành cho thứ thật sự không phải của mình.
 */
const DA_TRA_LOI = "Bạn đã trả lời điều này rồi.";

/**
 * Cha mẹ trả lời một mong muốn **mà không kéo theo hành động nào** (spec §16.2
 * `reviewChildSuggestion`: "REVIEWED/DECLINED, no adult side effect").
 *
 * Hai nút, hai nghĩa, và cố ý **không** gọi nút nào là "đồng ý":
 *  · `ghiNho`  - "mình đã đọc rồi, để đó" ⟹ `REVIEWED`. Không mua gì, không tạo việc gì.
 *  · `boQua`   - "lần này thôi nhé" ⟹ `DECLINED`.
 *
 * ⚠️ **`REVIEWED` không có nghĩa là đã làm.** Với `DECOR_WISH` thì món chỉ vào chuồng sau
 * khi cha mẹ đi hết luồng trang trí cũ - có giá, có kho, có đối soát tiền (spec §10.4 bước
 * 6). Một nút "đồng ý" ở đây mà tự đặt hàng là đúng thứ FL-D06 sinh ra để cấm.
 */
async function traLoiMongMuon(id: unknown, sang: "REVIEWED" | "DECLINED"): Promise<ActionResult> {
  const g = await mongMuonCuaToi(id);
  if (!g) return nope("Không tìm thấy mong muốn này.");
  if (g.status !== "PENDING") return ok(DA_TRA_LOI);

  const { count } = await prisma.childSuggestion.updateMany({
    where: { id: g.id, parentId: g.parentId, status: "PENDING" },
    data: { status: sang, reviewedAt: new Date() },
  });
  if (count === 0) return ok(DA_TRA_LOI);

  await track("child_suggestion_reviewed", {
    userId: g.parentId,
    props: { kind: g.m.kind, traLoi: sang, taoViec: false },
  });
  revalidatePath("/gia-dinh/de-xuat");
  revalidatePath("/gia-dinh");
  return ok(sang === "REVIEWED" ? "Đã ghi nhớ điều bé mong 💚" : "Đã bỏ qua lần này.");
}

export async function ghiNhoMongMuon(input: { id: string }): Promise<ActionResult> {
  return traLoiMongMuon(input?.id, "REVIEWED");
}

export async function boQuaMongMuon(input: { id: string }): Promise<ActionResult> {
  return traLoiMongMuon(input?.id, "DECLINED");
}

/**
 * ⭐ Cha mẹ biến một `CARE_WISH` thành **việc thật** cho nông dân (FL-D22).
 *
 * ⚠️⚠️ **Đây là hành động của CHA MẸ, không phải của trẻ** - và đó là ranh giới quan trọng
 * nhất của cả Epic 6. Trẻ chỉ nói ra điều mình mong; người quyết định có làm phiền một người
 * thật ngoài đời hay không là người lớn đã đăng nhập, đang sở hữu chuồng đó (`moMongMuon`).
 * Cố ý **không** thêm nghi thức xác minh lại: bố mẹ đã đăng nhập là đủ (§B của spec v1.1),
 * và việc sinh ra ở đây không đụng tới tiền hay dữ liệu của trẻ.
 *
 * Việc sinh ra chịu **mọi bất biến cũ** (FL-D23): `upsertTask` gộp vào việc cùng loại đang
 * chờ (không dội hộp việc), và nông dân vẫn phải có ảnh mới đóng được (§9.1).
 *
 * **Nhận chỗ TRƯỚC, tạo việc SAU, hỏng thì trả lại chỗ.** Hai tab cùng bấm thì chỉ một tab
 * đi tiếp; và nếu phép tạo việc ném lỗi thì mong muốn phải quay về `PENDING`, không được
 * nằm lại ở `REVIEWED` với con số 0 việc - đó là kiểu hỏng không ai nhìn thấy.
 */
export async function nhoCoChuLam(input: { id: string }): Promise<ActionResult> {
  const g = await mongMuonCuaToi(input?.id);
  if (!g) return nope("Không tìm thấy mong muốn này.");
  // Trước MỌI phép kiểm khác: đã trả lời rồi thì bốn câu từ chối bên dưới đều lạc đề.
  if (g.status !== "PENDING") return ok(DA_TRA_LOI);
  const viec = g.m.viec;
  if (!viec) return nope("Điều này không phải việc nhờ cô chú làm.");
  if (!g.barn.workerId) return nope("Chuồng chưa có nông dân phụ trách.");
  if (g.barn.dongDan) {
    return nope("Đàn đã khép lại chu kỳ - không nhờ thêm việc được nữa.");
  }
  // Nút chết (§9.2): đàn đang ở ngoài vườn rồi thì "thả ra vườn" là một việc không có nội
  // dung, và nông dân sẽ phải bấm "không làm được" cho một thứ đã xong.
  if (viec.kind === "RANGE_OUT" && g.barn.outside) {
    return nope("Đàn đang ở ngoài vườn rồi - mình để bé ngắm đã nhé.");
  }

  const { count } = await prisma.childSuggestion.updateMany({
    where: { id: g.id, parentId: g.parentId, status: "PENDING" },
    data: { status: "REVIEWED", reviewedAt: new Date() },
  });
  if (count === 0) return ok(DA_TRA_LOI);

  let created = false;
  try {
    ({ created } = await upsertTask({
      barnId: g.barn.id, workerId: g.barn.workerId, requestedById: g.parentId,
      kind: viec.kind, title: viec.title, note: viec.note,
    }));
  } catch (e) {
    console.error("[learning-actions] không tạo được việc từ mong muốn của bé", e);
    await prisma.childSuggestion.updateMany({
      where: { id: g.id, status: "REVIEWED" },
      data: { status: "PENDING", reviewedAt: null },
    });
    return nope("Chưa nhắn được cô chú - bạn thử lại giúp nhé.");
  }

  if (created) {
    await notify({
      userId: g.barn.workerUserId,
      kind: "TASK_NEW",
      title: `📋 Việc mới: ${viec.title}`,
      // ⚠️ Không có biệt danh bé ở đây - xem chú thích `note` trong `lib/de-xuat-meta.ts`.
      body: `${g.barn.label} · gia đình vừa nhờ qua app`,
      href: `/nong-trai/chuong/${g.barn.slug}#viec`,
    });
  }

  await track("child_suggestion_reviewed", {
    userId: g.parentId,
    props: { kind: g.m.kind, traLoi: "REVIEWED", taoViec: true },
  });
  revalidatePath("/gia-dinh/de-xuat");
  revalidatePath("/gia-dinh");
  revalidatePath(`/chuong/${g.barn.slug}`);
  return ok(
    created
      ? `Đã nhắn cô chú: ${viec.title.toLowerCase()} 🌾 - xong sẽ có ảnh gửi về.`
      : `Cô chú đang có việc này chờ làm rồi - mình đã gộp lời nhắn vào đó.`,
  );
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
