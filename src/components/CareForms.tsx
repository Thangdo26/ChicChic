"use client";
// Đóng tiền nuôi dưỡng đàn nghỉ hưu - chọn khối tháng, chuyển khoản, ngóng tiền về.
//
// Dùng lại nguyên ô QR và vòng ngóng tiền của cọc chuồng / trang trí / chợ. Không dựng
// đường tiền thứ hai (§9.19).
import { useState } from "react";
import { useRouter } from "next/navigation";
import PayQR from "@/components/PayQR";
import { usePayWatch } from "@/components/usePayWatch";
import { useToast } from "@/components/Toast";
import { cancelCareOrder, createCareOrder, reportCareTransfer } from "@/app/care-actions";
import { CARE_MONTH_BLOCKS, careTotalVnd, khoiLabel } from "@/lib/care";
import { fmtVnd } from "@/lib/pricing";

function useRun() {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const run = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setPending(true);
    try {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "warn");
      if (r.ok) router.refresh();
    } finally {
      setPending(false);
    }
  };
  return { pending, run };
}

/** Chọn khối tháng. Giá hiện thẳng trên nút - đừng bắt ai bấm vào mới biết mất bao nhiêu. */
export function ChonKhoi({ barnSlug, monthlyVnd }: { barnSlug: string; monthlyVnd: number }) {
  const { pending, run } = useRun();
  return (
    <div className="grid gap-2 mt-2.5">
      {CARE_MONTH_BLOCKS.map((m) => (
        <button key={m} type="button" className="btn" disabled={pending}
          onClick={() => run(() => createCareOrder(barnSlug, m))}>
          {khoiLabel(m)} · {fmtVnd(careTotalVnd(m, monthlyVnd))}
        </button>
      ))}
      <p className="text-[11.6px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
        {/* Nói rõ vì sao mua 1 năm không rẻ hơn - im lặng ở đây trông như quên giảm giá. */}
        Mua kỳ dài không rẻ hơn: {fmtVnd(monthlyVnd)}/tháng cho mọi kỳ. Tụi mình không muốn
        biến một lựa chọn tình cảm thành phép tính.
      </p>
    </div>
  );
}

/** Ô chuyển khoản của kỳ đang chờ. */
export function CarePayBox({
  orderId, payCode, totalVnd, months, reported,
}: { orderId: string; payCode: string; totalVnd: number; months: number; reported: boolean }) {
  const { pending, run } = useRun();
  const toast = useToast();
  const router = useRouter();

  // `active` là "kỳ CHƯA được trả", KHÔNG phải "đã bấm tôi-đã-chuyển-khoản" - tiền có
  // thể về trước khi người ta bấm nút, và đó là lúc màn hình đứng im lâu nhất (§10).
  usePayWatch(payCode, true, () => {
    toast("Đã nhận được tiền nuôi dưỡng - cảm ơn bạn! 🌾", "ok");
    router.refresh();
  });

  return (
    <div className="rounded-[13px] p-3 mt-3" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE" }}>
      <div className="font-semibold text-[13.4px]" style={{ color: "var(--yolk-deep)" }}>
        Kỳ {khoiLabel(months)} · chuyển {fmtVnd(totalVnd)}
      </div>
      <PayQR amountVnd={totalVnd} code={payCode} label="Quét mã để đóng kỳ nuôi dưỡng" />
      <p className="text-[11.6px] mt-2" style={{ color: "var(--ink-soft)" }}>
        Nội dung chuyển khoản: <b className="tabular-nums">{payCode}</b>.
      </p>
      <div className="flex gap-2 mt-2.5">
        {reported ? (
          <span className="text-[12.2px] flex-1 self-center" style={{ color: "var(--ink-soft)" }}>
            ⏳ Đã báo chuyển khoản - nông trại đang đối soát.
          </span>
        ) : (
          <button className="btn btn-primary btn-sm flex-1" disabled={pending}
            onClick={() => run(() => reportCareTransfer(orderId))}>
            Tôi đã chuyển khoản
          </button>
        )}
        <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
          onClick={() => run(() => cancelCareOrder(orderId))}
          style={{ color: "#B4472F", borderColor: "#F0CFC6" }}>
          Huỷ kỳ này
        </button>
      </div>
    </div>
  );
}
