"use client";
import { useRef, useState, useTransition } from "react";
import { addMedia, postUpdate } from "@/app/actions";
import { useToast } from "@/components/Toast";
import MediaUpload from "@/components/MediaUpload";

export type BarnOption = { slug: string; label: string };

const CLS = "rounded-[11px] px-3 py-2.5 text-[14px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

/** Giữ lại chuồng đang chọn sau khi gửi, xoá sạch phần nội dung - để đăng liên tiếp cho nhanh. */
function useResettableForm() {
  const ref = useRef<HTMLFormElement>(null);
  const reset = (keep: string[]) => {
    const form = ref.current;
    if (!form) return;
    const saved = new Map(keep.map((n) => [n, (form.elements.namedItem(n) as HTMLInputElement | null)?.value]));
    form.reset();
    saved.forEach((v, n) => {
      const el = form.elements.namedItem(n) as HTMLInputElement | null;
      if (el && v != null) el.value = v;
    });
  };
  return { ref, reset };
}

// ---------------- Gửi ảnh / video ----------------

export function MediaForm({ barns }: { barns: BarnOption[] }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [type, setType] = useState<"PHOTO" | "VIDEO">("PHOTO");
  const [url, setUrl] = useState("");
  const { ref, reset } = useResettableForm();

  return (
    <form
      ref={ref}
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          try {
            const r = await addMedia(data);
            toast(r.message, r.ok ? "ok" : "warn");
            if (r.ok) { reset(["barn", "type"]); setUrl(""); } // giữ chuồng + loại, xoá URL/poster/chú thích
          } catch {
            toast("Gửi không thành công. Kiểm tra kết nối rồi thử lại.", "err");
          }
        });
      }}
    >
      <select name="barn" className={CLS} style={BORDER} required>
        {barns.map((b) => <option key={b.slug} value={b.slug}>{b.label} ({b.slug})</option>)}
      </select>

      <select name="type" className={CLS} style={BORDER} value={type}
        onChange={(e) => setType(e.target.value as "PHOTO" | "VIDEO")}>
        <option value="PHOTO">Ảnh</option>
        <option value="VIDEO">Video</option>
      </select>

      <input name="url" className={CLS} style={BORDER} required value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder={type === "VIDEO" ? "https://youtu.be/…  hoặc  https://…/clip.mp4" : "https://…/anh.jpg"} />
      {!url && <MediaUpload folder="quan-tri" kind={type} onUploaded={setUrl} label="📸 Tải ảnh/video từ máy" />}

      {type === "VIDEO" && (
        <input name="poster" className={CLS} style={BORDER} placeholder="Ảnh bìa cho video (tuỳ chọn)" />
      )}

      <input name="caption" className={CLS} style={BORDER} maxLength={200}
        placeholder="Chú thích - VD: đàn ra ăn cữ đầu, trời nắng đẹp" />

      <button className="btn btn-primary mt-1" type="submit" disabled={pending}>
        {pending ? "Đang gửi…" : "Gửi lên chuồng"}
      </button>
    </form>
  );
}

// ---------------- Đăng ghi chú ----------------

export function UpdateForm({ barns }: { barns: BarnOption[] }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const { ref, reset } = useResettableForm();

  return (
    <form
      ref={ref}
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const barn = String(data.get("barn") ?? "");
        const text = String(data.get("text") ?? "");
        const kind = String(data.get("kind") ?? "NOTE");
        if (!text.trim()) { toast("Chưa nhập nội dung cập nhật.", "warn"); return; }

        start(async () => {
          try {
            const r = await postUpdate(barn, text, kind);
            toast(r.message, r.ok ? "ok" : "warn");
            if (r.ok) reset(["barn", "kind"]); // giữ chuồng + loại, xoá nội dung
          } catch {
            toast("Đăng không thành công. Thử lại giúp mình nhé.", "err");
          }
        });
      }}
    >
      <select name="barn" className={CLS} style={BORDER}>
        {barns.map((b) => <option key={b.slug} value={b.slug}>{b.label} ({b.slug})</option>)}
      </select>
      <select name="kind" className={CLS} style={BORDER}>
        {["CARE", "NOTE", "HEALTH", "MILESTONE", "RANGE"].map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <textarea name="text" rows={3} className={CLS} style={BORDER}
        placeholder="VD: Sáng nay đàn ăn khỏe, trời nắng đẹp." />
      <button className="btn btn-primary mt-1" type="submit" disabled={pending}>
        {pending ? "Đang đăng…" : "Đăng cập nhật"}
      </button>
    </form>
  );
}
