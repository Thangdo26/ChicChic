"use client";
// Khối 👨‍👩‍👧 ở /admin - mời một chuồng vào chương trình ChicChic Gia đình (§11.51, Epic 1).
//
// Component client: chỉ vẽ và gọi action. Không đụng Prisma, không tự kiểm quyền - luật
// nằm ở `family-admin-actions.inviteFamilyEnrollment` (§1.2).
import { useState, useTransition } from "react";
import { inviteFamilyEnrollment } from "@/app/family-admin-actions";
import { useToast } from "@/components/Toast";

export type ChuongMoiDuocVM = { slug: string; label: string; chuNhan: string };
export type SuatVM = {
  id: string;
  barnSlug: string;
  barnLabel: string;
  chuNhan: string;
  status: string;
  cohortKey: string;
  programVersion: string;
  invitedAt: string;
};

const TRANG_THAI_VI: Record<string, string> = {
  INVITED: "Đã mời · chờ trả lời",
  ACTIVE: "Đang tham gia",
  PAUSED: "Tạm dừng",
  WITHDRAWN: "Đã rút",
  COMPLETED: "Đã kết thúc",
};

const TRANG_THAI_MAU: Record<string, { background: string; color: string }> = {
  INVITED: { background: "var(--yolk-tint)", color: "var(--yolk-deep)" },
  ACTIVE: { background: "var(--paddy-tint)", color: "var(--paddy-deep)" },
  PAUSED: { background: "var(--paper2)", color: "var(--ink-soft)" },
  WITHDRAWN: { background: "var(--paper2)", color: "var(--ink-soft)" },
  COMPLETED: { background: "var(--paper2)", color: "var(--ink-soft)" },
};

export default function FamilyPilotForms({
  moiDuoc, suats,
}: {
  moiDuoc: ChuongMoiDuocVM[];
  suats: SuatVM[];
}) {
  const [chon, setChon] = useState("");
  const [cohort, setCohort] = useState("pilot-1");
  const [pending, start] = useTransition();
  const toast = useToast();

  const moi = () =>
    start(async () => {
      const r = await inviteFamilyEnrollment({ barnSlug: chon, cohortKey: cohort });
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) setChon("");
    });

  return (
    <div className="card mt-3">
      <h3 className="display text-[17px]">👨‍👩‍👧 ChicChic Gia đình · pilot</h3>
      <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Mời một chuồng <b>gà đẻ đang nuôi</b> vào chương trình học cùng con. Lời mời{" "}
        <b>chưa thay đổi gì</b>: đàn vẫn ba lựa chọn như cũ cho tới khi chủ chuồng đồng ý.
      </p>
      {/*
        Nói trước hệ quả, ở đúng chỗ người ta sắp bấm. Đây là cam kết nông trại sẽ phải
        giữ bằng thức ăn và công người thật trong nhiều tháng sau khi đàn hết đẻ - không
        phải một cái nhãn trong app.
      */}
      <p className="text-[12.3px] mt-2 rounded-[10px] px-2.5 py-2 leading-relaxed"
        style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
        ⚠️ Khi chủ chuồng đồng ý, đàn đó <b>chỉ còn một chặng cuối: nghỉ hưu ở nông trại</b>.
        Không nhận thịt, không nuôi lứa mới. Nông trại nuôi tiếp đàn đã hết đẻ - hãy chắc
        là có chỗ và có tiền cho việc đó trước khi mời.
      </p>

      {moiDuoc.length === 0 ? (
        <p className="text-[12.5px] mt-3" style={{ color: "var(--ink-soft)" }}>
          Chưa có chuồng nào mời được. Cần: chuồng <b>đã có chủ</b> · đàn <b>gà đẻ</b> ·
          đàn chưa khép vòng đời · chưa có suất nào đang chạy.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2 mt-3">
          <label className="grid gap-1 flex-1 min-w-[200px]">
            <span className="text-[12px] font-semibold">Chuồng</span>
            <select className="input" value={chon} onChange={(e) => setChon(e.target.value)}>
              <option value="">— chọn chuồng —</option>
              {moiDuoc.map((b) => (
                <option key={b.slug} value={b.slug}>{b.label} · {b.chuNhan}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 w-[140px]">
            <span className="text-[12px] font-semibold">Nhóm pilot</span>
            <input className="input" value={cohort} maxLength={40}
              onChange={(e) => setCohort(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-sm" disabled={!chon || pending} aria-busy={pending}
            onClick={moi}>
            {pending ? "Đang mời…" : "Gửi lời mời"}
          </button>
        </div>
      )}

      {suats.length > 0 && (
        <div className="grid gap-1.5 mt-3.5">
          {suats.map((s) => (
            <div key={s.id} className="flex items-center gap-2 flex-wrap text-[12.5px] rounded-[10px] px-2.5 py-2"
              style={{ background: "var(--paper2)" }}>
              <span className="font-semibold">{s.barnLabel}</span>
              <span style={{ color: "var(--ink-soft)" }}>{s.chuNhan}</span>
              <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                style={TRANG_THAI_MAU[s.status] ?? TRANG_THAI_MAU.PAUSED}>
                {TRANG_THAI_VI[s.status] ?? s.status}
              </span>
              <span className="ml-auto text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
                {s.cohortKey} · bản {s.programVersion} · {s.invitedAt}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
