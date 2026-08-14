// Đo đạc - ghi lại những gì người dùng THỰC SỰ làm, để trả lời được 5 chỉ số PoC
// (playbook §7.3) mà không phải đếm tay trên DB.
//
// File này KHÔNG có "use server" (giống lib/notify.ts và lib/task-store.ts): nó tin
// dữ liệu đưa vào, nên chỉ được gọi từ action/route/page đã kiểm quyền xong.
//
// Nguyên tắc: đo đạc hỏng thì im lặng bỏ qua. Không bao giờ để một dòng thống kê
// làm hỏng việc nhận chuồng hay việc nông dân vừa làm xong.
import { prisma } from "@/lib/db";

/**
 * Danh sách đóng - thêm sự kiện thì thêm ở đây trước, để tên không trôi mỗi nơi
 * một kiểu (thứ giết mọi hệ thống analytics tự làm).
 */
export type EventName =
  /** Chủ chuồng chọn một con gà để mặc yếm - đo xem tính năng "nhận ra từng con" có được dùng thật không. */
  | "gear_worn"
  /** Nông dân ghi một lô thu hoạch. Đây là NGUỒN của mọi con số sản lượng thật. */
  | "harvest_logged"
  /**
   * Chủ chuồng xin nhận một lô về tận nhà. Đo cái này để biết người ta thật sự nuôi
   * để ĂN hay để bán lại - câu hỏi định vị quan trọng nhất còn chưa có số liệu.
   */
  | "lot_claimed"
  /**
   * Chủ lô nhờ cấp đông lô của mình. Đo để biết **người ta có thật sự định ăn hàng của
   * mình hay không** - ai bỏ công xin cấp đông là ai đang chờ lấy hàng về, chứ không
   * phải đang chờ bán lại. Cùng một câu hỏi định vị với `lot_claimed`, nhìn từ góc khác.
   */
  | "lot_freeze_requested"
  /** Nông dân cân mẫu đàn gà thịt. Đo xem sổ lớn có được ghi đều hay bỏ giữa chừng. */
  | "weighin_logged"
  /** Chợ: đăng bán · giữ chỗ · tiền về · nông trại đã chi cho người bán. */
  | "listing_created"
  | "listing_reserved"
  /**
   * Người mua CHỐT GIỎ (§11.45). Đọc cùng `listing_reserved` mới có nghĩa: tỉ lệ
   * "bỏ vào giỏ" trên "chốt" là chỗ người ta bỏ cuộc, và `props.soLo` nói giỏ trung
   * bình mấy lô - tức phí giao một chuyến đang gánh được bao nhiêu hàng.
   */
  | "order_placed"
  /**
   * Người mua bấm "Tôi đã chuyển khoản" trên đơn chợ (Đợt 15).
   *
   * Đọc cùng `order_placed` và `market_paid` mới có nghĩa: khoảng cách `order_placed →
   * market_reported` là thời gian người ta thật sự cần để đi chuyển khoản, và đó là con
   * số duy nhất nói được **hạn giữ chỗ 3 giờ có quá ngắn không**. Đoán bằng cảm giác ở
   * chỗ này là lấy mất hàng của người đang trả tiền.
   */
  | "market_reported"
  /**
   * Người mua tự huỷ đơn đã chốt nhưng chưa trả tiền (Đợt 16).
   *
   * Đọc cùng `order_placed`: tỉ lệ huỷ cao là dấu hiệu **chốt đơn đang quá dễ bấm** hoặc
   * số tiền cuối cùng khác với thứ người ta tưởng lúc bỏ vào giỏ - cả hai đều là chuyện
   * phải sửa ở màn hình chứ không phải ở đây.
   */
  | "order_cancelled"
  | "market_paid"
  | "payout_paid"
  /**
   * Người bán bấm "rút tiền". Đo để biết **khoảng chờ có làm người ta sốt ruột không**
   * - nếu ai cũng bấm rút ngay ngày đầu thì cái ví đang không nói đủ rõ là tiền chỉ về
   * sau khi giao hàng.
   */
  | "payout_requested"
  /** Nông trại đổi giá niêm yết - để sau này hiểu vì sao doanh số có một bậc thang. */
  | "price_changed"
  /**
   * Nuôi dưỡng đàn nghỉ hưu: đặt kỳ · tiền về.
   *
   * Hai con số đáng theo dõi nhất của sản phẩm nằm ở đây, và trước đợt này **không đo
   * được**: (1) bao nhiêu người chọn nghỉ hưu rồi thật sự đóng tiền - tức "lòng tốt" có
   * chuyển thành doanh thu không, hay chỉ là một nút bấm miễn phí; (2) họ đóng kỳ mấy
   * tháng - tức người ta cam kết với con vật của mình xa tới đâu.
   */
  | "care_order_created"
  | "care_paid"
  /**
   * Hoá đơn tiền nuôi: phát hành · tiền về · chuồng bị khoá vì quá hạn.
   *
   * Đây là **phễu doanh thu chính** và trước đợt này nó không tồn tại: sản phẩm thu đúng
   * 50k cọc rồi thôi. Ba con số cần đọc cùng nhau - bao nhiêu hoá đơn phát ra, bao nhiêu
   * được trả, và bao nhiêu chuồng phải khoá. Tỉ lệ thứ ba mà cao thì vấn đề nằm ở GIÁ
   * hoặc ở cách nói, không phải ở việc nhắc chưa đủ rát.
   */
  | "invoice_issued"
  | "invoice_paid"
  | "barn_locked_unpaid"
  /**
   * Hoàn tiền: xin · đã chuyển trả.
   *
   * Hai con số này đọc cùng `barn_returned` và `market_paid` mới có nghĩa. Tỉ lệ hoàn
   * cao ở nhánh `MARKET` là hàng đang hỏng thật; cao ở nhánh `INVOICE` là người ta đang
   * bỏ đi giữa chừng, và lúc đó câu hỏi nằm ở GIÁ hoặc ở kỳ vọng lúc bán, không phải ở
   * chỗ hoàn tiền. `props.kind` để tách được hai nhánh đó.
   */
  | "refund_requested"
  | "refund_paid"
  // Phễu tiền
  | "barn_reserved" // giữ chỗ thành công → mẫu số của conversion
  | "deposit_reported" // người dùng báo đã chuyển khoản
  | "deposit_confirmed" // nông trại xác nhận nhận tiền → tử số của conversion
  | "barn_returned" // hoàn trả chuồng → churn
  // Gắn bó của chủ chuồng
  | "barn_opened" // mở dashboard chuồng → tín hiệu DAU/giữ chân
  | "task_requested" // giao việc cho nông dân
  | "decor_installed" // lắp một món trang trí → tỉ lệ mua decor
  | "end_of_lay_decided" // chọn thịt / nghỉ hưu / lứa mới
  // Vận hành của nông dân
  | "barn_reassigned" // nông trại bàn giao một chuồng sang người khác
  /**
   * Nông trại XOÁ HẲN một chuồng (§11.42).
   *
   * Đây là sự kiện duy nhất trong bảng này ghi lại một thứ **không còn tra lại được**:
   * chuồng, ảnh, việc, sổ thu hoạch của nó đã biến mất khỏi DB, nên dòng `Event` này là
   * dấu vết duy nhất còn lại rằng nó từng tồn tại. Vì thế `props` chép sẵn nhãn chuồng,
   * người chủ lúc xoá và số thứ bị xoá theo - đọc lại được mà không cần join vào đâu.
   */
  | "barn_deleted"
  | "task_done" // hoàn thành việc kèm minh chứng
  | "task_declined"
  | "worker_daily_update" // nhật ký hằng ngày - nhịp nội dung
  // Hộp thư của chuồng
  | "message_sent" // một tin trong hộp thư - đo mức hỏi–đáp thật giữa hai bên
  | "message_to_task" // tin nhắn được chuyển thành việc có minh chứng
  | "message_reported" // báo cáo vi phạm - theo dõi chất lượng cuộc trò chuyện
  // Trang trí trả phí
  | "decor_ordered" // đặt mua món trang trí → mẫu số của phễu decor
  | "decor_paid" // nông trại xác nhận tiền decor → tử số
  /**
   * Family Learning: quản trị mời một chuồng vào pilot (§11.51).
   *
   * ⚠️ `props` **chỉ được mang `cohortKey`** - spec §17.5 cấm đưa dữ liệu trẻ vào đo đạc,
   * và ở đợt này còn chưa có dữ liệu trẻ nào để mà lỡ. Đừng thêm nhãn chuồng hay biệt
   * danh của bé vào đây sau này; đây là bảng ai cũng đọc được ở `/admin`.
   */
  | "family_invited"
  /**
   * Family Learning · Epic 2: cha mẹ tạo hồ sơ một bé · nhận lời mời · rút consent · xoá
   * dữ liệu của bé (spec §17.5).
   *
   * ⚠️ **`props` bị bóp tới mức gần như rỗng, và đó là chủ ý.** Được phép: `ageBand`
   * (`AGE_5_6`/`AGE_7_8`), `programVersion`, `cohortKey`. **Cấm**: biệt danh · `avatarKey` ·
   * `childId` · bất cứ thứ gì lần ngược ra được một đứa trẻ cụ thể. Bảng `Event` hiện ra ở
   * `/admin` cho người trực đọc; dữ liệu của trẻ không có việc gì ở đó.
   *
   * `userId` là **tài khoản cha mẹ** - đó là người dùng của hệ thống này, và cũng là người
   * duy nhất có mặt trong `Event`.
   */
  | "family_profile_created"
  | "family_enrolled"
  | "consent_withdrawn"
  | "child_data_deleted"
  /**
   * Khu của bé (Epic 5). Cùng luật `props` như trên, thêm hai khoá **của nội dung** chứ không
   * phải của trẻ: `unitKey` (vd `ch4-qua-trung-dau-tien-5-6`) và `contentVersion` - hai thứ
   * này nói về BÀI, dùng để biết bài nào bé bỏ dở, và không lần ngược ra ai cả.
   *
   * ⚠️ **Cố ý KHÔNG có `child_space_opened`** dù spec §17.5 có liệt: nó sẽ phải bắn lúc vẽ
   * trang, mà một phép ghi DB nấp trong một lượt xem trang là thứ §7.14 đã cấm một lần rồi.
   * Cần đo lượt vào thì đo bằng `learning_moment_started`.
   */
  | "learning_moment_started"
  | "learning_moment_completed"
  | "family_mission_completed"
  /**
   * Mong muốn của bé (Epic 6): bé gửi · cha mẹ trả lời.
   *
   * ⚠️ **`props` chỉ mang `kind`** (`CARE_WISH`/`DECOR_WISH`/…), **không mang `optionKey`** -
   * spec §17.5 nói thẳng "kind, không option text". Khoá lựa chọn thì vô hại một mình, nhưng
   * đọc cùng `userId` nó dựng lại được một chân dung khá chi tiết về một đứa trẻ cụ thể
   * trong một bảng ai trực cũng mở được ở `/admin`. `traLoi` là `REVIEWED`/`DECLINED`, và
   * `taoViec` nói mong muốn đó có thành việc thật cho nông dân không - hai con số cần để
   * biết vòng lặp này có khép được hay chỉ là một cái hộp thư chết.
   *
   * ⚠️ Cố ý **KHÔNG có `parent_report_viewed`** dù spec §17.5 có liệt: nó phải bắn lúc vẽ
   * trang, mà một phép ghi DB nấp trong một lượt xem trang là thứ §7.14 đã cấm - cùng lý do
   * với `child_space_opened` ở trên.
   */
  | "child_suggestion_created"
  | "child_suggestion_reviewed"
  /**
   * Vận hành pilot (Epic 7): quản trị tạm dừng · mở lại một suất.
   *
   * `props`: `cohortKey` và `lyDo` - **một khoá trong danh sách đóng** ở
   * `van-hanh-meta.LY_DO_TAM_DUNG`, không phải chữ người trực gõ. Đây là hai con số duy
   * nhất cần để trả lời câu hỏi của Epic 8: *"pilot dừng vì cái gì, và mấy lần"*.
   */
  | "family_enrollment_paused"
  | "family_enrollment_resumed"
  /**
   * Cha mẹ tải dữ liệu của bé về (Epic 7 · spec §17.3 mục 5).
   *
   * ⚠️ **`props` không được mang gì của bé** - kể cả số dòng đã xuất, vì "nhà này có 47 dòng
   * dữ liệu" đọc cùng `userId` là một mô tả về một đứa trẻ cụ thể. Chỉ `ageBand`, cùng luật
   * với `consent_withdrawn`/`child_data_deleted` mà nó đứng cạnh trong luồng.
   */
  | "child_data_exported"
  /**
   * Nông dân gắn nhãn một chạm lúc báo xong việc (Epic 7 · spec §18.3 · FL-D24).
   *
   * `props.nhan` là khoá đóng (`CHO_AN`/`UONG_NUOC`/…), `props.viec` là loại việc. Đọc
   * cùng nhau mới có nghĩa: `CHECK` gộp ba mong muốn khác nhau của bé, và đây là chỗ duy
   * nhất phân biệt được cô chú thật sự đã làm gì.
   *
   * ⚠️ **Không bắn khi cô chú bỏ qua nhãn.** Nhãn là tuỳ chọn; một sự kiện "đã bỏ qua"
   * biến một thứ tuỳ chọn thành một thứ bị đếm, và đó là bước đầu của việc nó thành bắt buộc.
   */
  | "care_tag_used";

export type TrackInput = {
  userId?: string | null;
  barnSlug?: string | null;
  /** Số liệu kèm theo: giá tiền, loại việc, số con… Giữ nhỏ và phẳng. */
  props?: Record<string, string | number | boolean | null>;
};

/** Ghi một sự kiện. Lỗi được nuốt - xem chú thích đầu file. */
export async function track(name: EventName, input: TrackInput = {}): Promise<void> {
  try {
    await prisma.event.create({
      data: {
        name,
        userId: input.userId ?? null,
        barnSlug: input.barnSlug ?? null,
        props: input.props ?? undefined,
      },
    });
  } catch (e) {
    console.error(`[track] không ghi được sự kiện "${name}"`, e);
  }
}
