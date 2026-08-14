"use client";
// Khối 👨‍👩‍👧 ở /admin - mời một chuồng vào chương trình ChicChic Gia đình (§11.51, Epic 1),
// và tạm dừng / mở lại từng suất (Epic 7 · spec §22.3).
//
// Component client: chỉ vẽ và gọi action. Không đụng Prisma, không tự kiểm quyền - luật
// nằm ở `family-admin-actions.*` (§1.2).
import { useState, useTransition } from "react";
import { inviteFamilyEnrollment, moLaiSuat, tamDungSuat } from "@/app/family-admin-actions";
import { LY_DO_TAM_DUNG } from "@/lib/van-hanh-meta";
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
  /** Khoá lý do đang tạm dừng - chỉ có nghĩa khi `status === "PAUSED"`. */
  pauseReason: string | null;
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
            <DongSuat key={s.id} s={s} />
          ))}
        </div>
      )}

      {/* Lối vào bảng số liệu. Đặt DƯỚI danh sách suất, không đặt trên: người trực mở khối
          này để làm một việc, còn số liệu là thứ họ đọc khi đã xong việc. */}
      <a href="/admin/gia-dinh" className="btn btn-ghost btn-sm w-full mt-3 no-underline">
        📊 Bảng vận hành pilot →
      </a>
    </div>
  );
}

/**
 * Một suất + hai nút vận hành (Epic 7).
 *
 * ⚠️ Nút **chỉ hiện ở đúng trạng thái dùng được** - `ACTIVE` mới tạm dừng được, `PAUSED` mới
 * mở lại được. §9.2: không bày một cái nút chỉ để nó trả về lời từ chối.
 */
function DongSuat({ s }: { s: SuatVM }) {
  const [mo, setMo] = useState(false);
  const [lyDo, setLyDo] = useState(LY_DO_TAM_DUNG[0].khoa);
  const [pending, start] = useTransition();
  const toast = useToast();

  const dung = () =>
    start(async () => {
      const r = await tamDungSuat({ enrollmentId: s.id, lyDo });
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) setMo(false);
    });

  const mola = () =>
    start(async () => {
      const r = await moLaiSuat({ enrollmentId: s.id });
      toast(r.message, r.ok ? "ok" : "err");
    });

  return (
    <div className="rounded-[10px] px-2.5 py-2" style={{ background: "var(--paper2)" }}>
      <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
        <span className="font-semibold">{s.barnLabel}</span>
        <span style={{ color: "var(--ink-soft)" }}>{s.chuNhan}</span>
        <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
          style={TRANG_THAI_MAU[s.status] ?? TRANG_THAI_MAU.PAUSED}>
          {TRANG_THAI_VI[s.status] ?? s.status}
        </span>
        <span className="ml-auto text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          {s.cohortKey} · bản {s.programVersion} · {s.invitedAt}
        </span>
        {s.status === "ACTIVE" && (
          <button className="btn btn-ghost btn-sm text-[12px]" disabled={pending}
            onClick={() => setMo((v) => !v)}>
            {mo ? "Thôi" : "Tạm dừng…"}
          </button>
        )}
        {s.status === "PAUSED" && (
          <button className="btn btn-primary btn-sm text-[12px]" disabled={pending} aria-busy={pending}
            onClick={mola}>
            {pending ? "Đang mở…" : "Mở lại"}
          </button>
        )}
      </div>

      {/* Suất đang dừng: nói ngay VÌ SAO, bằng đúng câu cha mẹ đang đọc ở /gia-dinh. Người
          trực và gia đình phải nhìn thấy cùng một câu, nếu không thì lúc gia đình gọi điện
          hỏi, người trực lại đi đoán mình đã nói gì với họ. */}
      {s.status === "PAUSED" && (
        <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {LY_DO_TAM_DUNG.find((l) => l.khoa === s.pauseReason)?.emoji ?? "⏸️"}{" "}
          {LY_DO_TAM_DUNG.find((l) => l.khoa === s.pauseReason)?.choChaMe ??
            "Đang tạm dừng (không rõ lý do - dữ liệu cũ)."}
        </p>
      )}

      {mo && s.status === "ACTIVE" && (
        <div className="grid gap-2 mt-2">
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            Tạm dừng thì <b>bé không vào được khu của mình</b> và <b>không có bài mới</b>. Đàn gà,
            việc của cô chú, ảnh đã gửi và cam kết nghỉ hưu <b>không đổi gì cả</b>.
          </p>
          <label className="grid gap-1">
            <span className="text-[12px] font-semibold">Nói với gia đình là vì sao</span>
            <select className="input" value={lyDo} onChange={(e) => setLyDo(e.target.value)}>
              {LY_DO_TAM_DUNG.map((l) => (
                <option key={l.khoa} value={l.khoa}>{l.emoji} {l.choQuanTri}</option>
              ))}
            </select>
          </label>
          <p className="text-[12px] rounded-[10px] px-2.5 py-2 leading-relaxed"
            style={{ background: "var(--paper)", color: "var(--ink-soft)" }}>
            Cha mẹ sẽ đọc đúng câu này:{" "}
            <b>{LY_DO_TAM_DUNG.find((l) => l.khoa === lyDo)?.choChaMe}</b>
          </p>
          <div>
            <button className="btn btn-primary btn-sm" disabled={pending} aria-busy={pending} onClick={dung}>
              {pending ? "Đang dừng…" : "Tạm dừng suất này"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
