"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { returnBarn } from "@/app/auth-actions";
import { renameBarn } from "@/app/actions";
import { useToast } from "@/components/Toast";
import { MAX_BARN_NAME, RETURN_PHRASE } from "@/lib/decor";

/**
 * Menu ⋯ trên thẻ chuồng ở trang Tài khoản.
 * Hoàn trả chuồng là hành động không hoàn tác được → bắt gõ đúng nguyên văn câu xác nhận.
 * Server kiểm tra lại cả quyền sở hữu lẫn câu chữ, nên không lách được bằng devtools.
 */
export default function BarnCardMenu({ barnSlug, barnLabel }: { barnSlug: string; barnLabel: string }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [typed, setTyped] = useState("");
  /** Ô đổi tên đang mở, và tên đang gõ. null = đang đóng. */
  const [naming, setNaming] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài / nhấn Esc thì đóng menu
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const matched = typed.trim() === RETURN_PHRASE;

  const submit = () =>
    start(async () => {
      try {
        const r = await returnBarn(barnSlug, typed);
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setSheet(false); setTyped(""); router.refresh(); }
      } catch {
        toast("Không hoàn trả được lúc này. Thử lại giúp mình nhé.", "err");
      }
    });

  const saveName = () =>
    start(async () => {
      try {
        const r = await renameBarn(barnSlug, naming ?? "");
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setNaming(null); router.refresh(); }
      } catch {
        toast("Không đổi tên được lúc này. Thử lại giúp mình nhé.", "err");
      }
    });

  return (
    <>
      <div className="relative flex-none" ref={wrap}>
        <button
          aria-label={`Tuỳ chọn cho ${barnLabel}`} aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid place-items-center rounded-[10px] font-bold"
          style={{ width: 34, height: 34, background: "var(--paper2)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
        >⋯</button>

        {open && (
          <div className="absolute right-0 z-30 rounded-[13px] overflow-hidden"
            style={{ top: 40, minWidth: 208, background: "var(--card)", border: "1px solid var(--line)", boxShadow: "var(--shadow)" }}>
            <Link href={`/chuong/${barnSlug}`} onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-[13.4px] no-underline" style={{ color: "var(--ink)" }}>
              🏡 Mở chuồng
            </Link>
            <Link href={`/chuong/${barnSlug}/nhat-ky`} onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-[13.4px] no-underline" style={{ borderTop: "1px solid var(--line-soft)", color: "var(--ink)" }}>
              📷 Ảnh &amp; video
            </Link>
            <button
              onClick={() => { setOpen(false); setNaming(barnLabel); }}
              className="block w-full text-left px-3.5 py-2.5 text-[13.4px]"
              style={{ borderTop: "1px solid var(--line-soft)", color: "var(--ink)" }}
            >✎ Đổi tên chuồng</button>
            <button
              onClick={() => { setOpen(false); setSheet(true); }}
              className="block w-full text-left px-3.5 py-2.5 text-[13.4px] font-semibold"
              style={{ borderTop: "1px solid var(--line-soft)", color: "#B4472F" }}
            >↩︎ Hoàn trả chuồng cho trang trại</button>
          </div>
        )}
      </div>

      {/* ---------- Đổi tên chuồng ---------- */}
      {naming !== null && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(24,34,28,.5)" }}
          onClick={(e) => e.target === e.currentTarget && !pending && setNaming(null)}>
          <div className="w-full max-w-[460px] rounded-t-[22px] p-[22px]" style={{ background: "var(--paper)" }}>
            <div className="w-[38px] h-1 rounded-[3px] mx-auto mb-3.5" style={{ background: "var(--line)" }} />
            <div className="text-[26px]">✎</div>
            <h3 className="display text-[19px] mt-1">Đổi tên chuồng</h3>
            <p className="lede mt-1.5">
              Tên này hiện trên thẻ chuồng, trong thông báo, và trên hình chuồng của bạn trong app.
              Viết hoa, dấu tiếng Việt, emoji đều được.
            </p>
            {/* §9.2 và §11.24: app không tự đổi hiện thực. Câu cũ ở đây nói tên mới hiện
                "trên biển tên treo trước chuồng" — đúng với hình VẼ trong app, nhưng người
                đọc hiểu là cái biển gỗ thật ngoài vườn, và ngoài đó thì không ai đi sơn
                lại vì một lần bấm nút. Ba tháng sau nhận được ảnh chuồng vẫn mang tên cũ
                là một lời hứa hụt, đúng kiểu làm hỏng niềm tin mà sản phẩm này sống bằng. */}
            <div className="soft mt-2.5 text-[12.3px]" style={{ color: "var(--ink-soft)" }}>
              🪧 <b style={{ color: "var(--ink)" }}>Biển tên thật ngoài vườn thì không tự đổi theo.</b>{" "}
              Muốn cô chú viết lại biển thì nhắn một câu trong hộp thư của chuồng — đổi xong sẽ có ảnh gửi về.
            </div>
            <input
              className="inp mt-3" value={naming} maxLength={MAX_BARN_NAME} autoFocus disabled={pending}
              aria-label="Tên chuồng"
              onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && naming.trim()) saveName(); }}
            />
            <div className="text-[11.4px] mt-1.5 text-right tabular-nums" style={{ color: "var(--ink-soft)" }}>
              {Array.from(naming).length}/{MAX_BARN_NAME}
            </div>
            <button className="btn btn-primary mt-2.5" disabled={pending || !naming.trim()} onClick={saveName}>
              {pending ? "Đang lưu…" : "Lưu tên mới"}
            </button>
            <button className="btn btn-ghost mt-2" disabled={pending} onClick={() => setNaming(null)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: "rgba(24,34,28,.5)" }}
          onClick={(e) => e.target === e.currentTarget && !pending && setSheet(false)}>
          <div className="w-full max-w-[460px] rounded-t-[22px] p-[22px]" style={{ background: "var(--paper)" }}>
            <div className="w-[38px] h-1 rounded-[3px] mx-auto mb-3.5" style={{ background: "var(--line)" }} />
            <div className="text-[26px]">↩︎</div>
            <h3 className="display text-[19px] mt-1">Hoàn trả {barnLabel}?</h3>
            <p className="lede mt-1.5">
              Chuồng sẽ được trả về nông trại và biến mất khỏi danh sách của bạn. Đàn gà <b>vẫn được cô chú chăm sóc
              bình thường</b> — không con nào bị bỏ rơi.
            </p>
            <ul className="mt-2.5 grid gap-1">
              {[
                "Bạn thôi theo dõi chuồng này và không nhận cập nhật nữa",
                "Đơn giữ chỗ chuyển sang trạng thái đã huỷ, cọc đối soát hoàn lại",
                "Trang trí đã lắp vẫn ở lại chuồng cùng nông trại",
              ].map((t) => (
                <li key={t} className="text-[12.6px] flex gap-2" style={{ color: "var(--ink-soft)" }}>
                  <span style={{ color: "var(--clay)" }}>•</span>{t}
                </li>
              ))}
            </ul>

            <div className="mt-3.5">
              <div className="text-[12.6px] mb-1.5" style={{ color: "var(--ink-soft)" }}>
                Gõ đúng câu sau để xác nhận:
              </div>
              <div className="rounded-[10px] px-3 py-2 mb-2 text-[13px] font-semibold select-all"
                style={{ background: "var(--paper2)", border: "1px dashed var(--line)" }}>
                {RETURN_PHRASE}
              </div>
              <input
                value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus disabled={pending}
                placeholder="Gõ lại câu trên…" aria-label="Câu xác nhận hoàn trả"
                className="w-full rounded-[11px] px-3 py-3 text-[14px]"
                style={{ border: `1.5px solid ${typed && !matched ? "#E0B6AA" : matched ? "var(--paddy)" : "var(--line)"}`, background: "#fff" }}
              />
              {typed && !matched && (
                <p className="text-[11.8px] mt-1" style={{ color: "#B4472F" }}>Chưa khớp — cần gõ đúng nguyên văn.</p>
              )}
            </div>

            <button className="btn mt-3.5" disabled={!matched || pending}
              style={matched ? { background: "#B4472F", color: "#fff" } : { background: "var(--paper2)", color: "var(--ink-soft)" }}
              onClick={submit}>
              {pending ? "Đang hoàn trả…" : "Hoàn trả chuồng"}
            </button>
            <button className="btn btn-ghost mt-2" disabled={pending} onClick={() => { setSheet(false); setTyped(""); }}>
              Giữ lại chuồng
            </button>
          </div>
        </div>
      )}
    </>
  );
}
