"use client";
// Bàn giao chuồng của một cô/chú đang tạm dừng sang người khác.
//
// Đây là màn CỨU HOẢ, không phải màn quản trị thường ngày: mỗi dòng ở đây là một
// chuồng có người trả tiền mà KHÔNG CÓ AI gửi tin, vì người phụ trách không đăng nhập
// được nữa (CODEMAP §11.9). Vì thế nó chỉ hiện khi thật sự có chuồng như vậy, và hiện
// luôn số việc đang treo - con số đó là thứ nói lên chuồng đã im bao lâu.
import { useState, useTransition } from "react";
import { reassignBarn } from "@/app/admin-actions";
import { useToast } from "@/components/Toast";

export type HandoverBarn = {
  slug: string;
  label: string;
  /** Người đang giữ chuồng - đang tạm dừng. */
  workerName: string;
  /** Chuồng chưa có chủ thì im tin cũng không ai thiệt; vẫn hiện nhưng nhẹ hơn. */
  hasOwner: boolean;
  /** Việc đang chờ, sẽ đi theo chuồng sang người mới. */
  openTasks: number;
};

export type HandoverWorker = {
  id: string;
  name: string;
  area: string;
  /** Còn nhận thêm được bao nhiêu chuồng. */
  free: number;
};

export default function BarnHandoverForms({
  rows, workers,
}: { rows: HandoverBarn[]; workers: HandoverWorker[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  /** Người nhận đang chọn cho từng chuồng. */
  const [pick, setPick] = useState<Record<string, string>>({});

  if (rows.length === 0) return null;

  const run = (slug: string, toId: string, barnLabel: string, workerName: string) => {
    if (!toId) {
      toast("Chọn cô/chú nhận bàn giao trước đã nhé.", "warn");
      return;
    }
    if (!window.confirm(
      `Bàn giao ${barnLabel} cho ${workerName}?\n\n` +
      "• Mọi việc đang chờ chuyển sang hộp việc của cô/chú đó.\n" +
      "• Chủ chuồng sẽ nhận được thông báo và một dòng trong nhật ký chuồng.\n" +
      "• Ảnh và sổ thu hoạch cũ vẫn giữ tên người đã làm.",
    )) return;

    start(async () => {
      try {
        const r = await reassignBarn(slug, toId);
        toast(r.message, r.ok ? "ok" : "warn");
      } catch {
        toast("Không bàn giao được - kiểm tra mạng rồi thử lại.", "err");
      }
    });
  };

  return (
    <div className="card mt-3" style={{ borderColor: "#F0C9BE" }}>
      <div className="font-bold text-[14px] mb-0.5">🔄 Chuồng đang không có người chăm ({rows.length})</div>
      <p className="text-[12.2px] mb-2" style={{ color: "var(--ink-soft)" }}>
        Những chuồng này vẫn gắn tên một cô/chú <b>đang tạm dừng</b> - nghĩa là không ai
        đăng nhập được để gửi ảnh, ghi sổ hay trả lời tin nhắn. Bàn giao sang người khác
        để chuồng có tin trở lại.
      </p>

      {rows.map((b) => {
        const chon = pick[b.slug] ?? "";
        return (
          <div key={b.slug} className="py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[13.4px]">{b.label}</span>
              {!b.hasOwner && (
                <span className="text-[11px] rounded-full px-2 py-0.5"
                  style={{ background: "var(--paper2)", color: "var(--ink-soft)" }}>chưa có chủ</span>
              )}
              {b.openTasks > 0 && (
                <span className="text-[11px] font-bold rounded-full px-2 py-0.5"
                  style={{ background: "var(--yolk-tint)", color: "var(--yolk-deep)" }}>
                  {b.openTasks} việc đang treo
                </span>
              )}
            </div>
            <div className="text-[11.8px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
              Đang gắn tên <b>{b.workerName}</b> (tạm dừng)
            </div>

            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <select
                className="input flex-1 min-w-[160px]" value={chon} disabled={pending}
                onChange={(e) => setPick((cur) => ({ ...cur, [b.slug]: e.target.value }))}
                aria-label={`Chọn nông dân nhận ${b.label}`}
              >
                <option value="">- Giao cho cô/chú nào? -</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.free <= 0}>
                    {w.name} · {w.area} {w.free > 0 ? `· còn ${w.free} chỗ` : "· đã kín"}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary btn-sm flex-none" disabled={pending || !chon}
                onClick={() => run(
                  b.slug, chon, b.label,
                  workers.find((w) => w.id === chon)?.name ?? "cô/chú này",
                )}
              >
                {pending ? "Đang bàn giao…" : "Bàn giao"}
              </button>
            </div>
          </div>
        );
      })}

      {workers.length === 0 && (
        <p className="text-[12px] mt-2" style={{ color: "#8A3A26" }}>
          ⚠️ Không còn cô/chú nào đang hoạt động và còn chỗ trống. Mở lại một tài khoản
          hoặc cấp tài khoản mới ở khối bên dưới trước đã.
        </p>
      )}
    </div>
  );
}
