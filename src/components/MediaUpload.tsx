"use client";
// Chụp/chọn ảnh từ điện thoại rồi tải thẳng lên kho, trả về đường dẫn công khai.
//
// Bối cảnh: người dùng chính là các cô chú nông dân, đứng giữa vườn, mạng 3G.
// Vì vậy: (1) mở thẳng camera sau, (2) NÉN ảnh ngay trên máy trước khi tải —
// ảnh 12MP ~4MB xuống còn ~250KB, tải nhanh gấp chục lần và đỡ tốn kho.
import { useEffect, useRef, useState } from "react";
import { createUploadUrl } from "@/app/upload-actions";
import { useToast } from "@/components/Toast";

/** Ảnh nén về cạnh dài tối đa ngần này — vẫn nét trên mọi màn hình điện thoại. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Video KHÔNG nén được trên trình duyệt (cần ffmpeg.wasm, quá nặng) → chặn theo dung lượng.
 *
 * 45 chứ không phải một số tròn cho đẹp: **trần thật của kho là 50MB** (đã đo — 45MB lên
 * được, 60MB kho trả `413 EntityTooLarge`). Chặn ở 45 để phần dư gánh chỗ chênh lệch
 * MB/MiB, và để người dùng gặp lời từ chối tử tế NGAY LÚC CHỌN, thay vì đợi hết ba phút
 * tải trên sóng 3G rồi mới nhận một con số 413 chẳng nói lên điều gì.
 *
 * Cũ là 25MB — quá chặt với video quay sẵn ở điện thoại đời mới, mà bấm "chọn video đã
 * quay sẵn" thì đúng là để gửi những video đó.
 */
const MAX_VIDEO_MB = 45;

/**
 * Đuôi ảnh mà MỌI trình duyệt đều mở được. Quan trọng hơn vẻ ngoài của nó: ảnh minh
 * chứng tồn tại để người khác XEM (§9.1 — việc chỉ `DONE` khi có ảnh). Một tấm ảnh tải
 * lên trót lọt nhưng máy người xem không mở nổi còn tệ hơn là từ chối ngay từ đầu, vì
 * nó biến bằng chứng thành một ô vỡ mà chẳng ai biết đã hỏng từ lúc nào.
 */
const ANH_MO_DUOC = /^(jpe?g|png|webp)$/;

/** Đuôi → mime, để đặt `Content-Type` lúc PUT. Kho lưu lại đúng cái này và trả cho `<img>`/`<video>`. */
const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};

type Kind = "PHOTO" | "VIDEO";

/**
 * Vẽ lại ảnh qua canvas ở kích thước nhỏ hơn → Blob JPEG.
 * `nenDuoc: false` nghĩa là trình duyệt KHÔNG giải mã nổi file này — bên gọi phải xử lý,
 * đừng lặng lẽ tải nguyên bản lên (xem `ANH_MO_DUOC`).
 */
async function compressImage(file: File): Promise<{ blob: Blob; ext: string; nenDuoc: boolean }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const goc = extOf(file, "jpg");
    // Ảnh đã nhỏ sẵn, nhẹ, VÀ ở đuôi mở được thì giữ nguyên, khỏi mã hoá lại cho mất nét.
    // Điều kiện đuôi là bắt buộc: giải mã được (vd .gif, .bmp) không có nghĩa là kho nhận.
    if (scale === 1 && file.size < 600_000 && ANH_MO_DUOC.test(goc)) {
      bitmap.close();
      return { blob: file, ext: goc, nenDuoc: true };
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
    return { blob, ext: "jpg", nenDuoc: true };
  } catch {
    // Máy cũ không nén được, hoặc file ở định dạng trình duyệt không đọc nổi (HEIC của
    // iPhone là ca hay gặp nhất). Trả về nguyên bản kèm cờ để bên gọi tự quyết.
    return { blob: file, ext: extOf(file, "jpg"), nenDuoc: false };
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
  /**
   * Thư mục trong kho ảnh — quyết định cổng quyền phía server.
   * Danh sách này phải khớp `FOLDERS` trong `app/upload-actions.ts`; lệch nhau thì
   * TS bắt được ở đây trước khi ra tới runtime.
   */
  folder: "viec" | "nhat-ky" | "ho-so" | "thu-hoach" | "quan-tri";
  kind: Kind;
  onUploaded: (url: string) => void;
  label?: string;
}) {
  /** Hai ô chọn file riêng: một mở thẳng máy ảnh, một mở kho file. Xem phần render. */
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  /** Nông trại chưa dựng kho ảnh → tự chuyển sang ô dán đường dẫn, không để cô chú kẹt. */
  const [noStorage, setNoStorage] = useState(false);
  const [manual, setManual] = useState("");
  /**
   * Máy có màn cảm ứng → mới bày nút "chụp thẳng". Nhận diện sau khi dựng xong trang
   * (`useEffect`) vì server không biết máy nào; lần dựng đầu coi như máy tính, và đó là
   * chiều an toàn — chỉ hiện nút chọn file, thứ chạy được ở MỌI máy.
   */
  const [camDuoc, setCamDuoc] = useState(false);
  useEffect(() => {
    setCamDuoc(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true);
  }, []);
  const toast = useToast();

  const pick = async (file: File) => {
    setBusy(true);
    setPct(0);
    try {
      let body: Blob = file;
      let ext = extOf(file, kind === "VIDEO" ? "mp4" : "jpg");

      if (kind === "PHOTO") {
        const out = await compressImage(file);
        // Trình duyệt không mở nổi ảnh này. Hay gặp nhất: ảnh HEIC lấy từ kho ảnh iPhone
        // trên máy tính. Nếu cứ tải lên thì ảnh minh chứng thành ô vỡ với mọi người xem.
        if (!out.nenDuoc && !ANH_MO_DUOC.test(out.ext)) {
          toast(
            `Ảnh .${out.ext} này máy khác mở không lên nên mình chưa nhận được. ` +
            "Nếu là ảnh iPhone: vào Cài đặt › Camera › Định dạng › chọn \"Tương thích nhất\" " +
            "rồi chụp lại, hoặc gửi ảnh qua Zalo/Messenger cho chính mình rồi tải ảnh đó lên nhé.",
            "warn",
          );
          return;
        }
        body = out.blob;
        ext = out.ext;
      } else if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
        toast(
          `Video này ${Math.round(file.size / 1024 / 1024)}MB, nặng quá (tối đa ${MAX_VIDEO_MB}MB). ` +
          "Quay một đoạn ngắn khoảng 15–30 giây, hoặc hạ chất lượng quay xuống 1080p giúp mình nhé.",
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
        // Đặt rõ Content-Type: kho lưu lại đúng cái này rồi trả về cho <img>/<video> sau
        // này. Bỏ trống thì file quay từ máy ảnh (Blob không có `type`) bị lưu thành
        // application/octet-stream và trình duyệt tải về thay vì mở lên.
        xhr.setRequestHeader("Content-Type", body.type || MIME[ext] || "application/octet-stream");
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
      // Xoá cả hai ô: không xoá thì chọn lại đúng file vừa rồi sẽ không kích `onChange`,
      // nên lần thử lại sau một lần hỏng trông như bấm vào không có gì xảy ra.
      if (camRef.current) camRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
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

  const nhan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void pick(f);
  };
  const dangLam = pct > 0 ? `Đang tải lên… ${pct}%` : "Đang chuẩn bị…";

  /**
   * HAI ô chọn file, không phải một.
   *
   * `capture="environment"` mở thẳng máy ảnh sau — rất đúng cho cô chú đứng giữa vườn,
   * nhưng nó **thay thế** hộp chọn file chứ không thêm vào: trên điện thoại, ô có
   * `capture` thì KHÔNG còn đường nào vào kho ảnh. Thành ra ai đã quay sẵn một đoạn
   * video rồi thì không tài nào gửi lên được, chỉ còn cách quay lại tại chỗ.
   *
   * Nên: giữ nút chụp thẳng làm lối chính trên điện thoại, và luôn có một lối thứ hai
   * vào kho ảnh. Máy tính bỏ qua `capture` nên chỉ bày một nút cho gọn.
   */
  return (
    <div>
      <input ref={fileRef} type="file" className="hidden"
        accept={kind === "VIDEO" ? "video/*" : "image/*"} onChange={nhan} />
      <input ref={camRef} type="file" className="hidden"
        accept={kind === "VIDEO" ? "video/*" : "image/*"} capture="environment" onChange={nhan} />

      {camDuoc ? (
        <div className="grid gap-1.5">
          <button type="button" className="btn btn-primary" disabled={busy}
            onClick={() => camRef.current?.click()}>
            {busy ? dangLam : (label ?? (kind === "VIDEO" ? "🎬 Quay video ngay" : "📸 Chụp ảnh ngay"))}
          </button>
          {!busy && (
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              {kind === "VIDEO" ? "🎞️ Chọn video đã quay sẵn" : "🖼️ Chọn ảnh có sẵn trong máy"}
            </button>
          )}
        </div>
      ) : (
        <button type="button" className="btn btn-primary" disabled={busy}
          onClick={() => fileRef.current?.click()}>
          {busy ? dangLam : (label ?? (kind === "VIDEO" ? "🎬 Chọn video từ máy" : "📸 Chọn ảnh từ máy"))}
        </button>
      )}

      {busy && pct > 0 && (
        <div className="mt-1.5 rounded-full overflow-hidden" style={{ height: 5, background: "var(--paper2)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--paddy)", transition: "width .2s" }} />
        </div>
      )}
    </div>
  );
}
