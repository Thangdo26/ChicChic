"use client";
// Chụp/chọn ảnh từ điện thoại rồi tải thẳng lên kho, trả về đường dẫn công khai.
//
// Bối cảnh: người dùng chính là các cô chú nông dân, đứng giữa vườn, mạng 3G.
// Vì vậy: (1) mở thẳng camera sau, (2) NÉN ảnh ngay trên máy trước khi tải —
// ảnh 12MP ~4MB xuống còn ~250KB, tải nhanh gấp chục lần và đỡ tốn kho.
import { useRef, useState } from "react";
import { createUploadUrl } from "@/app/upload-actions";
import { useToast } from "@/components/Toast";

/** Ảnh nén về cạnh dài tối đa ngần này — vẫn nét trên mọi màn hình điện thoại. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** Video KHÔNG nén được trên trình duyệt (cần ffmpeg.wasm, quá nặng) → chặn theo dung lượng. */
const MAX_VIDEO_MB = 25;

type Kind = "PHOTO" | "VIDEO";

/** Vẽ lại ảnh qua canvas ở kích thước nhỏ hơn → Blob JPEG. Lỗi thì trả về file gốc. */
async function compressImage(file: File): Promise<{ blob: Blob; ext: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    // Ảnh đã nhỏ sẵn và nhẹ thì giữ nguyên, khỏi mã hoá lại cho mất nét.
    if (scale === 1 && file.size < 600_000) {
      bitmap.close();
      return { blob: file, ext: extOf(file, "jpg") };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-2d-context");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("no-blob");
    return { blob, ext: "jpg" };
  } catch {
    // Máy cũ không hỗ trợ createImageBitmap/toBlob → cứ tải ảnh gốc lên, vẫn chạy.
    return { blob: file, ext: extOf(file, "jpg") };
  }
}

function extOf(file: File, fallback: string): string {
  const m = file.name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] ?? fallback).toLowerCase();
}

export default function MediaUpload({
  folder,
  kind,
  onUploaded,
  label,
}: {
  /** viec | nhat-ky | ho-so | quan-tri — quyết định cổng quyền phía server */
  folder: "viec" | "nhat-ky" | "ho-so" | "quan-tri";
  kind: Kind;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  /** Nông trại chưa dựng kho ảnh → tự chuyển sang ô dán đường dẫn, không để cô chú kẹt. */
  const [noStorage, setNoStorage] = useState(false);
  const [manual, setManual] = useState("");
  const toast = useToast();

  const pick = async (file: File) => {
    setBusy(true);
    setPct(0);
    try {
      let body: Blob = file;
      let ext = extOf(file, kind === "VIDEO" ? "mp4" : "jpg");

      if (kind === "PHOTO") {
        const out = await compressImage(file);
        body = out.blob;
        ext = out.ext;
      } else if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
        toast(
          `Video này ${Math.round(file.size / 1024 / 1024)}MB, nặng quá (tối đa ${MAX_VIDEO_MB}MB). ` +
          "Quay lại một đoạn ngắn khoảng 15–30 giây giúp mình nhé.",
          "warn",
        );
        return;
      }

      const ticket = await createUploadUrl(folder, ext);
      if (!ticket.ok) {
        if (ticket.notConfigured) setNoStorage(true);
        toast(ticket.message, "warn");
        return;
      }

      // XMLHttpRequest thay vì fetch: chỉ nó báo được tiến độ tải lên, thứ rất cần
      // khi cô chú đang đứng ngoài vườn với sóng yếu.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", ticket.uploadUrl);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
        xhr.onerror = () => reject(new Error("network"));
        xhr.send(body);
      });

      onUploaded(ticket.publicUrl);
      toast(kind === "VIDEO" ? "Đã tải video lên ✓" : "Đã tải ảnh lên ✓", "ok");
    } catch {
      toast("Tải lên không xong — sóng yếu thì thử lại giúp mình nhé.", "err");
    } finally {
      setBusy(false);
      setPct(0);
      if (input.current) input.current.value = "";
    }
  };

  // Chưa có kho ảnh: hiện thẳng ô dán đường dẫn thay vì một cái nút bấm vào là báo lỗi.
  if (noStorage) {
    return (
      <div className="grid gap-1.5">
        <input
          className="rounded-[11px] px-3 py-2.5 text-[13.7px] w-full"
          style={{ border: "1.5px solid var(--line)", background: "#fff" }}
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onBlur={() => manual.trim() && onUploaded(manual.trim())}
          placeholder={kind === "VIDEO" ? "https://youtu.be/…  hoặc  https://…/clip.mp4" : "https://…/anh.jpg"}
        />
        <p className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>
          Nông trại chưa dựng kho ảnh nên chưa chụp thẳng được — dán đường dẫn giúp mình nhé.
        </p>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept={kind === "VIDEO" ? "video/*" : "image/*"}
        // Mở thẳng camera sau trên điện thoại; máy tính vẫn mở hộp chọn file như thường.
        capture="environment"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }}
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy
          ? (pct > 0 ? `Đang tải lên… ${pct}%` : "Đang chuẩn bị…")
          : (label ?? (kind === "VIDEO" ? "🎬 Quay/chọn video" : "📸 Chụp/chọn ảnh"))}
      </button>
      {busy && pct > 0 && (
        <div className="mt-1.5 rounded-full overflow-hidden" style={{ height: 5, background: "var(--paper2)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--paddy)", transition: "width .2s" }} />
        </div>
      )}
    </div>
  );
}
