"use client";
/* eslint-disable @next/next/no-img-element -- URL do người dùng/nông trại dán vào, không qua image optimizer */
import { useCallback, useEffect, useState } from "react";
import { mediaKind, fmtDuration, dayLabel, hhmm } from "@/lib/decor";

export type MediaVM = {
  id: string;
  type: "PHOTO" | "VIDEO";
  url: string;
  posterUrl: string | null;
  caption: string | null;
  durationSec: number | null;
  capturedAt: string; // ISO
  workerName: string | null;
};

// ---------------- Ô xem trước ----------------

/**
 * Ảnh xem trước của một mục.
 *
 * ⚠️ Bẫy đã đạp: bản cũ làm `src = posterUrl ?? url` rồi nhét vào `<img>` — nhưng
 * **video thì không có `posterUrl`**, và không trình duyệt nào hiện được file .mp4 trong
 * thẻ `<img>`. Kết quả là mọi video trong lưới đều ra **biểu tượng ảnh vỡ** kèm nút play
 * đè lên. Lỗi này không lộ ra khi thử bằng ảnh, và cũng không lộ ra trên chuồng demo vì
 * dữ liệu seed có sẵn `posterUrl`.
 *
 * Nay: có poster thì dùng poster; không có mà là file video thì để **chính thẻ `<video>`
 * vẽ khung hình đầu** (`preload="metadata"`, không tải cả file); còn lại — video nhúng
 * YouTube/Vimeo, hoặc ảnh tải hỏng — thì một ô thay thế tử tế, không phải biểu tượng vỡ.
 */
function OThayThe({ videoNhung }: { videoNhung: boolean }) {
  return (
    <span className="absolute inset-0 grid place-items-center" style={{ background: "var(--paper2)" }}>
      <span className="text-[24px]" aria-hidden>{videoNhung ? "🎬" : "🖼️"}</span>
    </span>
  );
}

function Thumb({ m, onOpen, className = "" }: { m: MediaVM; onOpen: () => void; className?: string }) {
  const dur = fmtDuration(m.durationSec);
  const [hong, setHong] = useState(false);
  const kind = m.type === "VIDEO" ? mediaKind(m.url) : "image";
  const oVideo = !m.posterUrl && kind === "video-file";
  const src = m.posterUrl ?? m.url;
  const phu: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };

  return (
    <button
      onClick={onOpen}
      className={`relative block w-full overflow-hidden rounded-[13px] ${className}`}
      style={{ border: "1px solid var(--line)", background: "var(--paper2)", aspectRatio: "16 / 9" }}
      aria-label={m.caption ?? (m.type === "VIDEO" ? "Xem video" : "Xem ảnh")}
    >
      {hong || (!m.posterUrl && kind === "embed") ? (
        <OThayThe videoNhung={m.type === "VIDEO"} />
      ) : oVideo ? (
        // `#t=0.1` xin trình duyệt nhảy tới 0,1 giây để có khung hình mà vẽ — nhiều máy
        // để nguyên đầu video thì chỉ ra một ô đen. `muted` + `playsInline` để iOS đừng
        // đòi mở toàn màn hình.
        <video src={m.url.includes("#") ? m.url : `${m.url}#t=0.1`} preload="metadata"
          muted playsInline tabIndex={-1} onError={() => setHong(true)} style={phu} />
      ) : (
        <img src={src} alt={m.caption ?? ""} loading="lazy" onError={() => setHong(true)} style={phu} />
      )}
      {m.type === "VIDEO" && (
        <>
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid place-items-center rounded-full"
              style={{ width: 34, height: 34, background: "rgba(24,34,28,.62)", backdropFilter: "blur(2px)" }}>
              <svg width="13" height="14" viewBox="0 0 13 14" aria-hidden><path d="M1 1 L12 7 L1 13 Z" fill="#fff" /></svg>
            </span>
          </span>
          {dur && (
            <span className="absolute font-semibold text-[10.5px] rounded-[5px] px-1.5 py-0.5"
              style={{ right: 6, bottom: 6, background: "rgba(24,34,28,.72)", color: "#fff" }}>{dur}</span>
          )}
        </>
      )}
    </button>
  );
}

// ---------------- Trình xem toàn màn hình ----------------

function Player({ m }: { m: MediaVM }) {
  const kind = m.type === "VIDEO" ? mediaKind(m.url) : "image";
  const box: React.CSSProperties = { width: "100%", maxHeight: "62vh", borderRadius: 14, display: "block", background: "#000" };
  /** Máy này giải mã được tiếng nhưng KHÔNG giải mã được hình — xem ghi chú dưới. */
  const [chiCoTieng, setChiCoTieng] = useState(false);

  if (kind === "video-file") {
    return (
      <>
        <video
          src={m.url} poster={m.posterUrl ?? undefined} controls autoPlay playsInline style={box}
          /**
           * Video H.265/HEVC (iPhone chế độ "High Efficiency") phát được TIẾNG nhưng
           * không ra HÌNH trên phần lớn máy không phải Apple — và trình duyệt **không
           * báo lỗi gì cả**: `onError` không kêu vì luồng tiếng vẫn chạy ngon. Người xem
           * chỉ thấy một ô đen và tự kết luận là mạng lỗi, hoặc tệ hơn, là nông dân gửi
           * video rỗng.
           *
           * `videoWidth === 0` sau khi đã có metadata là dấu hiệu chắc chắn: có luồng
           * hình trong file nhưng máy này dựng không nổi khung nào. Nói thẳng ra còn hơn
           * để người ta ngồi đoán. (Chặn từ lúc tải lên nằm ở `lib/video.ts`; chỗ này lo
           * cho những video đã trót nằm trong sổ từ trước.)
           */
          onLoadedMetadata={(e) => setChiCoTieng(e.currentTarget.videoWidth === 0)}
        />
        {chiCoTieng && (
          <div className="mt-2 rounded-[12px] p-2.5 text-[12.4px] leading-snug"
            style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
            ⚠️ <b>Máy này nghe được tiếng nhưng không hiện được hình.</b> Video quay ở định
            dạng H.265 (HEVC) — máy Apple mở được, máy khác thì thường không. Mở bằng
            iPhone/iPad/Mac là xem được, hoặc nhờ người quay gửi lại sau khi đổi
            <i> Cài đặt › Camera › Định dạng › &ldquo;Tương thích nhất&rdquo;</i>.
          </div>
        )}
      </>
    );
  }
  if (kind === "embed") {
    return (
      <div style={{ aspectRatio: "16 / 9", width: "100%" }}>
        <iframe src={m.url} title={m.caption ?? "Video"} allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen style={{ width: "100%", height: "100%", border: 0, borderRadius: 14, background: "#000" }} />
      </div>
    );
  }
  return <img src={m.url} alt={m.caption ?? ""} style={{ ...box, background: "var(--paper2)", objectFit: "contain" }} />;
}

function Lightbox({ list, index, onClose, onMove }: {
  list: MediaVM[]; index: number; onClose: () => void; onMove: (d: 1 | -1) => void;
}) {
  const m = list[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onMove(1);
      if (e.key === "ArrowLeft") onMove(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, onMove]);

  if (!m) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3"
      style={{ background: "rgba(18,26,21,.92)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full" style={{ maxWidth: 460 }}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-[12.5px]" style={{ color: "rgba(255,255,255,.72)" }}>
            {index + 1}/{list.length} · {dayLabel(m.capturedAt)} {hhmm(m.capturedAt)}
          </span>
          <button onClick={onClose} aria-label="Đóng"
            className="grid place-items-center rounded-full text-[17px]"
            style={{ width: 32, height: 32, background: "rgba(255,255,255,.14)", color: "#fff" }}>×</button>
        </div>

        <Player m={m} />

        {(m.caption || m.workerName) && (
          <div className="mt-2.5 rounded-[13px] p-3" style={{ background: "rgba(255,255,255,.08)" }}>
            {m.caption && <div className="text-[13.6px]" style={{ color: "#F3F7F1" }}>{m.caption}</div>}
            {m.workerName && (
              <div className="text-[11.8px] mt-1" style={{ color: "rgba(255,255,255,.6)" }}>
                📷 {m.workerName} chụp/quay tại nông trại
              </div>
            )}
          </div>
        )}

        {list.length > 1 && (
          <div className="flex gap-2 mt-3">
            <button className="btn btn-ghost btn-sm flex-1" onClick={() => onMove(-1)} disabled={index === 0}>‹ Trước</button>
            <button className="btn btn-ghost btn-sm flex-1" onClick={() => onMove(1)} disabled={index === list.length - 1}>Sau ›</button>
          </div>
        )}
      </div>
    </div>
  );
}

function useLightbox(list: MediaVM[]) {
  const [index, setIndex] = useState<number | null>(null);
  const move = useCallback((d: 1 | -1) => {
    setIndex((i) => (i == null ? i : Math.min(list.length - 1, Math.max(0, i + d))));
  }, [list.length]);
  const close = useCallback(() => setIndex(null), []);
  const node = index == null ? null : <Lightbox list={list} index={index} onClose={close} onMove={move} />;
  return { open: setIndex, node };
}

// ---------------- Dải "hôm nay" trên trang chuồng ----------------

export function MediaStrip({ list, compact = false }: { list: MediaVM[]; compact?: boolean }) {
  const { open, node } = useLightbox(list);
  if (!list.length) return null;
  return (
    <>
      <div
        className={`flex gap-2.5 overflow-x-auto pb-1 ${compact ? "mt-2" : "-mx-4 px-4"}`}
        style={{ scrollbarWidth: "none" }}
      >
        {list.map((m, i) => (
          <div key={m.id} className="flex-none" style={{ width: compact ? 138 : 208 }}>
            <Thumb m={m} onOpen={() => open(i)} />
            {!compact && (
              <div className="text-[11.8px] mt-1.5 leading-snug line-clamp-2" style={{ color: "var(--ink-soft)" }}>
                {hhmm(m.capturedAt)} · {m.caption ?? (m.type === "VIDEO" ? "Video từ nông trại" : "Ảnh từ nông trại")}
              </div>
            )}
          </div>
        ))}
      </div>
      {node}
    </>
  );
}

// ---------------- Lưới đầy đủ, gom theo ngày ----------------

export function MediaGrid({ list }: { list: MediaVM[] }) {
  const { open, node } = useLightbox(list);

  if (!list.length) {
    return (
      <div className="soft text-center py-6">
        <div className="text-[26px]">📷</div>
        <div className="font-semibold text-[14px] mt-1">Chưa có ảnh hay video nào</div>
        <p className="text-[12.6px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Nông dân sẽ gửi ảnh/video từ nông trại. Ở bản demo, bạn tự thêm được ở trang <b>/admin</b>.
        </p>
      </div>
    );
  }

  const groups: { label: string; items: { m: MediaVM; i: number }[] }[] = [];
  list.forEach((m, i) => {
    const label = dayLabel(m.capturedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push({ m, i });
    else groups.push({ label, items: [{ m, i }] });
  });

  return (
    <>
      {groups.map((g) => (
        <div key={g.label} className="mt-4">
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-[12.5px] tracking-wide uppercase" style={{ color: "var(--ink-soft)" }}>{g.label}</span>
            <span className="flex-1 h-px" style={{ background: "var(--line-soft)" }} />
            <span className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>{g.items.length} mục</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mt-2.5">
            {g.items.map(({ m, i }) => (
              <div key={m.id}>
                <Thumb m={m} onOpen={() => open(i)} />
                <div className="text-[11.5px] mt-1 leading-snug line-clamp-2" style={{ color: "var(--ink-soft)" }}>
                  {hhmm(m.capturedAt)} · {m.caption ?? (m.type === "VIDEO" ? "Video" : "Ảnh")}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {node}
    </>
  );
}
