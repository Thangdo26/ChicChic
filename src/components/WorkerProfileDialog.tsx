"use client";
// Popup hồ sơ cô/chú nông dân — mở từ dấu ⋯ trong danh sách chọn người chăm ở /nhan-chuong.
// Mục đích: trước khi giao đàn gà của mình cho ai, khách được nhìn mặt và nghe người đó tự giới thiệu.
import { useEffect } from "react";
import Link from "next/link";
import { FarmerAvatar } from "@/components/Illustrations";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";

export type WorkerProfileVM = {
  id: string;
  name: string;
  area: string;
  bio: string | null;
  yearsExp: number;
  age: number | null;
  load: number;
  maxBarns: number;
  free: number;
  open: boolean;
  paused: boolean;
  intro: MediaVM[];
};

export default function WorkerProfileDialog({
  worker, open, onClose,
}: {
  worker: WorkerProfileVM;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const photos = worker.intro.filter((m) => m.type === "PHOTO").length;
  const videos = worker.intro.filter((m) => m.type === "VIDEO").length;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-3"
      style={{ background: "rgba(20,28,23,.52)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Hồ sơ ${worker.name}`}
    >
      <div
        className="w-full max-w-[400px] rounded-[18px] overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--line)", boxShadow: "0 18px 50px rgba(20,28,23,.34)", maxHeight: "86vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- Đầu ---- */}
        <div className="flex items-start gap-3 px-4 py-3.5"
          style={{ background: "var(--paper2)", borderBottom: "1px solid var(--line-soft)" }}>
          <div className="avatar w-14 h-14 flex-none"><FarmerAvatar /></div>
          <div className="flex-1 min-w-0">
            <div className="display font-bold text-[18px] leading-tight truncate">{worker.name}</div>
            <div className="text-[12.4px] mt-0.5 truncate" style={{ color: "var(--ink-soft)" }}>
              {worker.age ? `${worker.age} tuổi · ` : ""}{worker.yearsExp} năm nuôi gà
            </div>
            <div className="text-[12px] truncate" style={{ color: "var(--ink-soft)" }}>📍 {worker.area}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng"
            className="flex-none text-[20px] leading-none px-1" style={{ color: "var(--ink-soft)" }}>×</button>
        </div>

        <div className="p-4 overflow-y-auto" style={{ maxHeight: "calc(86vh - 92px)" }}>
          {/* ---- Đang chăm bao nhiêu ---- */}
          <div className="flex items-center justify-between gap-2 rounded-[13px] px-3 py-2.5"
            style={{ background: worker.open ? "var(--paddy-tint)" : "var(--paper2)" }}>
            <div className="min-w-0">
              <div className="text-[12.4px] font-semibold" style={{ color: worker.open ? "var(--paddy-deep)" : "var(--ink)" }}>
                Đang chăm {worker.load}/{worker.maxBarns} chuồng
              </div>
              <div className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
                {worker.open
                  ? `Còn nhận thêm ${worker.free} chuồng nữa`
                  : worker.paused ? "Tạm không nhận chuồng mới" : "Đã kín chỗ"}
              </div>
            </div>
            <span className="flex-none text-[11px] font-bold rounded-full px-2 py-0.5"
              style={worker.open
                ? { background: "var(--paddy)", color: "#F7FBF4" }
                : { background: "var(--paper2)", color: "#B4472F", border: "1px solid var(--line)" }}>
              {worker.open ? "Còn nhận" : worker.paused ? "Tạm nghỉ" : "Kín chỗ"}
            </span>
          </div>

          {/* ---- Tự giới thiệu ---- */}
          {worker.bio && (
            <>
              <div className="label">Cô/chú tự giới thiệu</div>
              <p className="text-[13.4px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>“{worker.bio}”</p>
            </>
          )}

          {/* ---- Ảnh & video giới thiệu ---- */}
          <div className="label">
            Ảnh & video giới thiệu
            {worker.intro.length > 0 && (
              <span className="font-normal normal-case tracking-normal">
                {" "}· {photos > 0 && `${photos} ảnh`}{photos > 0 && videos > 0 && " · "}{videos > 0 && `${videos} video`}
              </span>
            )}
          </div>
          {worker.intro.length > 0 ? (
            <MediaStrip list={worker.intro} />
          ) : (
            <div className="soft text-[12.8px]" style={{ color: "var(--ink-soft)" }}>
              Cô/chú chưa gửi ảnh giới thiệu. Bạn vẫn xem được ảnh chuồng hằng ngày sau khi nhận nuôi.
            </div>
          )}

          <Link href={`/nong-dan/${worker.id}`} className="btn btn-ghost mt-3.5 no-underline">
            Xem hồ sơ đầy đủ →
          </Link>
          <p className="text-[11.4px] mt-2 text-center" style={{ color: "var(--ink-soft)" }}>
            Chuồng của bạn sẽ thuộc về đúng một cô/chú — người nhận việc bạn giao và gửi ảnh mỗi ngày.
          </p>
        </div>
      </div>
    </div>
  );
}
