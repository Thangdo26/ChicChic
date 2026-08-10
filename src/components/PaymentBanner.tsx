"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportTransfer } from "@/app/actions";
import { useToast } from "@/components/Toast";
import PayQR from "@/components/PayQR";
import { usePayWatch } from "@/components/usePayWatch";
import { fmtVnd } from "@/lib/pricing";

type Status = "UNPAID" | "REPORTED" | "CONFIRMED";

/**
 * Banner cọc trên trang chuồng.
 * - UNPAID:   hiện số tiền + STK + mã chuyển khoản + nút "Tôi đã chuyển khoản".
 * - REPORTED: hiện "đang đối soát", tự poll mỗi 6s — nông trại xác nhận xong là
 *             trang tự làm mới + toast, không cần user bấm F5.
 */
export default function PaymentBanner({
  barnSlug, depositVnd, code, bank, momo, initialStatus,
}: {
  barnSlug: string; depositVnd: number; code: string;
  bank: string; momo: string; initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  // Ngóng tiền về. Dùng chung một vòng hỏi với hoá đơn trang trí và đơn chợ
  // (`usePayWatch`) — trước đây mỗi chỗ tự xoay xở, và hai chỗ kia thì không có gì cả.
  //
  // ⚠️ Điều kiện là "CHƯA xác nhận", KHÔNG phải "đã bấm tôi-đã-chuyển-khoản": tiền có
  // thể về trước khi người ta bấm nút, và đó đúng là lúc màn hình đứng im lâu nhất.
  usePayWatch(code, status !== "CONFIRMED", () => {
    setStatus("CONFIRMED");
    toast("Nông trại đã nhận được cọc — chuồng của bạn kích hoạt rồi! 🎉", "ok");
    router.refresh();
  });

  if (status === "CONFIRMED") return null;

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast(`Đã sao chép ${label}.`, "ok"),
      () => toast("Không sao chép được — chọn tay giúp mình nhé.", "warn"),
    );
  };

  if (status === "REPORTED") {
    return (
      <div className="rounded-[16px] p-[14px] mb-3" style={{ background: "#EAF1F6", border: "1px solid #C9DCE9" }}>
        <div className="flex items-center gap-2.5">
          <span className="flex-none grid place-items-center rounded-full" style={{ width: 30, height: 30, background: "#D6E6F0" }}>
            <span className="pulse-dot" />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-[14px]" style={{ color: "#2A5674" }}>Đang chờ nông trại đối soát cọc</div>
            <div className="text-[12.4px] mt-0.5" style={{ color: "#4A7391" }}>
              Thường xong trong vài giờ làm việc. Trang này sẽ <b>tự cập nhật</b> ngay khi tiền được xác nhận — bạn không cần tải lại.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[16px] p-[14px] mb-3" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE" }}>
      <div className="font-semibold text-[14.5px]" style={{ color: "var(--yolk-deep)" }}>
        🔒 Chuồng đang giữ chỗ — chuyển cọc để kích hoạt
      </div>
      <p className="text-[12.6px] mt-1 leading-snug" style={{ color: "var(--ink-soft)" }}>
        Cọc <b>{fmtVnd(depositVnd)}</b> — khoản này được <b>trừ thẳng vào hoá đơn tiền nuôi</b> đầu tiên, không mất đi đâu. Chuyển xong bấm nút bên dưới,
        nông trại đối soát là chuồng mở khoá trang trí &amp; mọi tính năng.
      </p>

      {/* Lối nhanh: quét là xong. Ba nút dưới đây GIỮ NGUYÊN làm đường lùi — QR không
          hiện được (chưa cấu hình / nhà cung cấp lỗi) thì vẫn chuyển khoản tay được. */}
      <PayQR amountVnd={depositVnd} code={code} label="Quét mã để chuyển cọc" />

      <div className="grid gap-1.5 mt-2.5">
        <button onClick={() => copy(bank, "thông tin chuyển khoản")} className="flex items-center justify-between gap-2 rounded-[11px] px-3 py-2.5 text-left" style={{ background: "#fff", border: "1px solid #EBD8AE" }}>
          <span className="text-[12.8px] min-w-0 truncate">🏦 {bank}</span>
          <span className="flex-none text-[11.5px] font-semibold" style={{ color: "var(--paddy)" }}>Sao chép</span>
        </button>
        <button onClick={() => copy(momo, "số MoMo")} className="flex items-center justify-between gap-2 rounded-[11px] px-3 py-2.5 text-left" style={{ background: "#fff", border: "1px solid #EBD8AE" }}>
          <span className="text-[12.8px]">💗 MoMo: {momo}</span>
          <span className="flex-none text-[11.5px] font-semibold" style={{ color: "var(--paddy)" }}>Sao chép</span>
        </button>
        <button onClick={() => copy(code, "nội dung chuyển khoản")} className="flex items-center justify-between gap-2 rounded-[11px] px-3 py-2.5 text-left" style={{ background: "#fff", border: "1px solid #EBD8AE" }}>
          <span className="text-[12.8px]">Nội dung CK: <b className="tabular-nums">{code}</b></span>
          <span className="flex-none text-[11.5px] font-semibold" style={{ color: "var(--paddy)" }}>Sao chép</span>
        </button>
      </div>

      <button
        className="btn btn-primary mt-2.5"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await reportTransfer(barnSlug);
              toast(r.message, r.ok ? "ok" : "warn");
              if (r.ok) setStatus("REPORTED");
            } catch {
              toast("Không gửi được — kiểm tra mạng rồi thử lại.", "err");
            }
          })
        }
      >
        {pending ? "Đang ghi nhận…" : "✓ Tôi đã chuyển khoản"}
      </button>
      <p className="text-[11.3px] mt-2" style={{ color: "var(--ink-soft)" }}>
        Nhớ ghi đúng nội dung <b>{code}</b> để nông trại đối soát nhanh. Đây là đặt mua trước nông sản — không phải đầu tư.
      </p>
    </div>
  );
}
