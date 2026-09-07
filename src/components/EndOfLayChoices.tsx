"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { decideEndOfLay, cancelLifecycleRequest } from "@/app/actions";
import { useToast } from "@/components/Toast";
import { fmtVnd } from "@/lib/pricing";
import { LIFECYCLE_STATUS_VI, RENEW_UNAVAILABLE } from "@/lib/lifecycle";

type Choice = "MEAT" | "RETIRE" | "RENEW";
export type LifecycleRequestVM = {
  id: string; choice: Choice; status: keyof typeof LIFECYCLE_STATUS_VI;
  expectedCount: number; reason: string | null; createdAt: string;
};

export default function EndOfLayChoices({
  barnSlug, flockId, version, retireFeeVnd, broiler = false, duocChon, request,
}: {
  barnSlug: string; flockId: string; version: number; retireFeeVnd: number;
  broiler?: boolean; duocChon: Choice[]; request: LifecycleRequestVM | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Choice | null>(null);
  const [terms, setTerms] = useState(false);
  // Giữ nguyên key khi mạng lỗi; chỉ đổi key khi người dùng chọn một ý định mới.
  const [key, setKey] = useState("");
  const active = !!request && ["REQUESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(request.status);
  const chiNghiHuu = duocChon.length === 1 && duocChon[0] === "RETIRE";
  const options = [
    { id: "MEAT" as const, emoji: broiler ? "🍗" : "🍲", title: "Yêu cầu nhận thịt",
      desc: "Cô chú nhận việc, kiểm tra điều kiện thu hoạch, cân và ghi lô kèm ảnh. Chỉ khi đối soát đủ số con và gửi minh chứng hoàn tất, đàn mới được ghi là đã thu hoạch." },
    { id: "RETIRE" as const, emoji: "🌾", title: "Yêu cầu nghỉ hưu ở nông trại",
      desc: "Các bạn gà tiếp tục được chăm ở nông trại. Cô chú nhận việc, kiểm tra số con và gửi ảnh tại nơi chăm tiếp để xác nhận hoàn tất." },
  ].filter((o) => duocChon.includes(o.id));
  const opt = options.find((o) => o.id === confirm);

  const submit = () => start(async () => {
    if (!opt) return;
    const fd = new FormData();
    fd.set("barn", barnSlug); fd.set("flockId", flockId); fd.set("expectedVersion", String(version));
    fd.set("choice", opt.id); fd.set("idempotencyKey", key);
    fd.set("retireTermsAccepted", String(terms));
    try {
      const r = await decideEndOfLay(fd);
      toast(r.message, r.ok ? "ok" : "warn");
      if (r.ok) { setConfirm(null); setTerms(false); router.refresh(); }
    } catch { toast("Chưa gửi được. Bạn có thể thử lại cùng yêu cầu này.", "err"); }
  });

  return (
    <>
      {chiNghiHuu && (
        <p className="soft mt-4 text-[13px]">
          🌾 Đây là đàn đồng hành cùng <b>ChicChic Gia đình</b>. Đàn chỉ được nghỉ hưu và ở lại
          nông trại, đúng cam kết khi bạn nhận lời mời.
        </p>
      )}
      {request && (
        <div className="card mt-4" role="status">
          <b>{LIFECYCLE_STATUS_VI[request.status]}</b>
          <p className="text-[13px] mt-2">
            Yêu cầu {request.choice === "MEAT" ? "nhận thịt" : "nghỉ hưu"} · {request.expectedCount} con · gửi ngày{" "}
            {new Date(request.createdAt).toLocaleDateString("vi-VN")}.
          </p>
          {request.reason && <p className="text-[13px] mt-2">{request.reason}</p>}
          {request.status === "COMPLETED" && <p className="text-[13px] mt-2">
            <Link href={`/chuong/${barnSlug}/nhat-ky`}>Xem minh chứng trong nhật ký</Link>
            {request.choice === "RETIRE" && <> · <Link href={`/chuong/${barnSlug}/nghi-huu`}>Chọn kỳ nuôi dưỡng</Link></>}
          </p>}
          {request.status === "DECLINED" && (
            <p className="text-[13px] mt-2">Trao đổi với cô chú trong hộp thư; khi đã thống nhất, bạn có thể gửi yêu cầu mới bên dưới.</p>
          )}
          {request.status === "REQUESTED" && (
            <button className="btn btn-ghost btn-sm mt-2" disabled={pending} onClick={() => start(async () => {
              try {
                const r = await cancelLifecycleRequest(barnSlug, request.id);
                toast(r.message, r.ok ? "ok" : "warn"); if (r.ok) router.refresh();
              } catch { toast("Chưa rút được yêu cầu. Kiểm tra mạng rồi thử lại.", "err"); }
            })}>Rút yêu cầu khi cô chú chưa nhận</button>
          )}
        </div>
      )}
      {!active && (
        <div className="grid gap-3 mt-4">
          {options.map((o) => (
            <div className="card" key={o.id}>
              <h2 className="font-semibold">{o.emoji} {o.title}</h2>
              <p className="text-[13px] mt-2">{o.desc}</p>
              {o.id === "RETIRE" && <p className="text-[13px] mt-2">Phí nuôi dưỡng hiện tại: <b>{fmtVnd(retireFeeVnd)}/tháng</b>.</p>}
              <button className="btn btn-ghost btn-sm mt-3" disabled={pending} onClick={() => {
                setConfirm(o.id); setTerms(false); setKey(crypto.randomUUID());
              }}>Chọn</button>
            </div>
          ))}
        </div>
      )}
      {!chiNghiHuu && <p className="text-[12px] mt-3">{RENEW_UNAVAILABLE}</p>}
      <p className="text-[12px] mt-3">Gửi yêu cầu chưa phải là đã thực hiện. Trong lúc chờ, đàn vẫn được chăm bình thường.</p>
      {opt && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(24,34,28,.5)" }}>
          <div className="w-full max-w-[460px] rounded-t-[22px] p-[22px]" style={{ background: "var(--paper)" }}>
            <h3 className="display text-[19px]">{opt.title}</h3>
            <p className="text-[13px] mt-2">{opt.desc}</p>
            {opt.id === "RETIRE" && (
              <label className="flex gap-2 mt-3 text-[13px]">
                <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} disabled={pending} />
                <span>Tôi đồng ý mức phí nuôi dưỡng {fmtVnd(retireFeeVnd)}/tháng, chọn kỳ đóng tại trang nghỉ hưu sau khi cô chú hoàn tất.
                  Yêu cầu này chưa tạo hóa đơn. Đàn vẫn được chăm khi chưa đóng phí.</span>
              </label>
            )}
            <button className="btn btn-primary mt-4" disabled={pending || (opt.id === "RETIRE" && !terms)} onClick={submit}>
              {pending ? "Đang gửi…" : "Gửi yêu cầu tới nông trại"}
            </button>
            <button className="btn btn-ghost mt-2" disabled={pending} onClick={() => setConfirm(null)}>Để mình suy nghĩ thêm</button>
          </div>
        </div>
      )}
    </>
  );
}
