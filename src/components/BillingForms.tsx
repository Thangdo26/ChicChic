"use client";
// Hoá đơn tiền nuôi — phần chạy trên máy người dùng.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PayQR from "@/components/PayQR";
import { usePayWatch } from "@/components/usePayWatch";
import { useToast } from "@/components/Toast";
import { ensureBarnInvoices, reportInvoiceTransfer } from "@/app/billing-actions";
import { fmtVnd } from "@/lib/pricing";

/**
 * Kích hoạt việc phát hành hoá đơn khi chủ chuồng mở trang.
 *
 * VÌ SAO LÀ MỘT COMPONENT RỖNG chứ không gọi thẳng trong Server Component: trang là phép
 * ĐỌC, và ghi DB trong lúc render thì bot/prefetch cũng kích hoạt, `revalidatePath` không
 * gọi được, và React dev render hai lần. Đẩy phép ghi ra sau khi trang đã hiện là cách
 * duy nhất vừa đúng yêu cầu "mở web là tự kiểm" vừa không biến một GET thành phép ghi.
 *
 * Chỉ gọi MỘT lần mỗi lần gắn (`ref`), và chỉ `router.refresh()` khi thật sự có hoá đơn
 * mới — nếu không thì mỗi lần mở trang là một vòng render thừa.
 */
export function InvoiceGate({ barnSlug }: { barnSlug: string }) {
  const router = useRouter();
  const chay = useRef(false);

  useEffect(() => {
    if (chay.current) return;
    chay.current = true;
    void (async () => {
      try {
        const r = await ensureBarnInvoices(barnSlug);
        // Câu này chỉ đổi khi CÓ hoá đơn mới; im lặng ở mọi trường hợp khác là cố ý —
        // người dùng không cần biết app vừa kiểm tra một chuyện không có gì.
        if (r.ok && r.message.startsWith("Đã phát hành")) router.refresh();
      } catch {
        /* mạng chập chờn: lần mở trang sau thử lại, và cron cũng lo phần này */
      }
    })();
  }, [barnSlug, router]);

  return null;
}

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

export type InvoiceVM = {
  id: string;
  payCode: string;
  totalVnd: number;
  grossVnd: number;
  creditVnd: number;
  ten: string;
  reported: boolean;
  quaHan: boolean;
  dueAt: string;
};

/** Ô chuyển khoản của một hoá đơn — dùng cho cả banner nhắc lẫn màn khoá. */
export function InvoicePayBox({ hd }: { hd: InvoiceVM }) {
  const { pending, run } = useRun();
  const toast = useToast();
  const router = useRouter();

  usePayWatch(hd.payCode, true, () => {
    toast("Đã nhận được tiền — cảm ơn bạn! 🌾", "ok");
    router.refresh();
  });

  return (
    <div className="rounded-[13px] p-3 mt-2" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE" }}>
      <div className="font-semibold text-[13.4px]" style={{ color: "var(--yolk-deep)" }}>
        {hd.ten} · chuyển {fmtVnd(hd.totalVnd)}
      </div>
      {hd.creditVnd > 0 && (
        // Nói rõ cọc đã được trừ. Im lặng ở đây thì người ta thấy một con số lạ và tưởng
        // mất cả 50k lẫn tiền nuôi.
        <div className="text-[11.8px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
          {fmtVnd(hd.grossVnd)} − {fmtVnd(hd.creditVnd)} tiền cọc đã chuyển = <b>{fmtVnd(hd.totalVnd)}</b>
        </div>
      )}
      <PayQR amountVnd={hd.totalVnd} code={hd.payCode} label="Quét mã để trả tiền nuôi" />
      <p className="text-[11.6px] mt-2" style={{ color: "var(--ink-soft)" }}>
        Nội dung chuyển khoản: <b className="tabular-nums">{hd.payCode}</b>
        {!hd.quaHan && ` · hạn ${hd.dueAt}`}
      </p>
      {hd.reported ? (
        <p className="text-[12.2px] mt-2" style={{ color: "var(--ink-soft)" }}>
          ⏳ Đã báo chuyển khoản — nông trại đang đối soát.
        </p>
      ) : (
        <button className="btn btn-primary btn-sm mt-2 w-full" disabled={pending}
          onClick={() => run(() => reportInvoiceTransfer(hd.id))}>
          Tôi đã chuyển khoản
        </button>
      )}
    </div>
  );
}
