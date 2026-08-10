import Link from "next/link";
import { InvoicePayBox, type InvoiceVM } from "@/components/BillingForms";

/**
 * MÀN KHOÁ vì tiền nuôi quá hạn — thay cho nội dung chuồng.
 *
 * ⚠️ §9.33. Ba điều màn này BẮT BUỘC phải làm, và lý do:
 *
 * 1. **Nói rõ đàn gà vẫn được chăm.** Đây là câu quan trọng nhất trên màn. Người vừa bị
 *    khoá sẽ nghĩ ngay tới con vật của mình trước khi nghĩ tới tiền; để họ tự tưởng
 *    tượng ra điều tệ nhất là một cách gây áp lực, chỉ gián tiếp hơn.
 * 2. **Có lối liên hệ người thật.** Người không trả được đúng hạn thường có lý do thật.
 *    Một màn khoá không có lối nói chuyện là một bức tường, và nông trại thì có nút gia
 *    hạn ở `/admin` — nhưng chỉ dùng được nếu người ta gọi tới được.
 * 3. **Không doạ.** Không đếm ngược, không "sẽ bị thu hồi", không đỏ báo động. Sản phẩm
 *    này bán một quan hệ tin cậy; ngày nó chuyển giọng sang đòi nợ là ngày quan hệ đó hết.
 */
export default function BarnUnpaid({
  slug, label, hd, workerName,
}: { slug: string; label: string; hd: InvoiceVM; workerName?: string | null }) {
  return (
    <div className="screen">
      <div className="text-center mt-2">
        <div className="text-[40px]">🌾</div>
        <h2 className="display text-[21px] mt-1 leading-tight">{label} đang tạm nghỉ</h2>
        <p className="lede mt-2 px-2">
          Kỳ tiền nuôi này chưa được thanh toán nên trang chuồng tạm khoá. Thanh toán xong
          là mở lại ngay, không mất gì cả.
        </p>
      </div>

      {/* Câu quan trọng nhất trên màn — đặt TRƯỚC ô tiền, không phải sau. */}
      <div className="flex gap-2.5 rounded-[13px] p-3 mt-3 text-[12.8px]"
        style={{ background: "var(--paddy-tint)", border: "1px solid var(--paddy-line, #CFE0C4)", color: "var(--paddy-deep)" }}>
        🐔 <div>
          <b>Các bạn gà vẫn được chăm bình thường.</b>{" "}
          {workerName ?? "Cô chú nông dân"} vẫn cho ăn, vẫn dọn chuồng như mọi ngày. Tụi
          mình không bao giờ để chuyện tiền ảnh hưởng tới con vật của bạn.
        </div>
      </div>

      <InvoicePayBox hd={hd} />

      <div className="soft mt-3 p-3.5">
        <div className="font-semibold text-[13.4px]">Đang có việc khó?</div>
        <p className="text-[12.4px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Nhắn cho nông trại một câu là được — tụi mình giãn hạn cho bạn. Thật sự không sao
          cả, chuyện này ai cũng có thể gặp.
        </p>
        <Link href={`/chuong/${slug}/tin-nhan`} className="btn btn-ghost btn-sm mt-2 no-underline">
          Nhắn cho nông trại
        </Link>
      </div>

      <p className="text-[11.4px] text-center mt-4" style={{ color: "var(--ink-soft)" }}>
        Sổ thu hoạch và các lô hàng của bạn vẫn còn nguyên, không mất đi đâu.
      </p>
    </div>
  );
}
