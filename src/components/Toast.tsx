"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition } from "react";

export type Tone = "ok" | "warn" | "err";
export type ActionResult = { ok: boolean; message: string };

type Toast = { id: number; message: string; tone: Tone };
type ShowFn = (message: string, tone?: Tone) => void;

const ToastCtx = createContext<ShowFn>(() => {});

/** Hiện một thông báo ngắn ở đáy màn hình. Dùng ở bất kỳ client component nào. */
export const useToast = () => useContext(ToastCtx);

const ICON: Record<Tone, string> = { ok: "✓", warn: "!", err: "×" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const seq = useRef(0);

  const show = useCallback<ShowFn>((message, tone = "ok") => {
    const id = ++seq.current;
    setList((cur) => [...cur.slice(-2), { id, message, tone }]);
    setTimeout(() => setList((cur) => cur.filter((t) => t.id !== id)), 3800);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span
              aria-hidden
              className="flex-none grid place-items-center rounded-full font-bold text-[12px]"
              style={{ width: 19, height: 19, background: "rgba(255,255,255,.22)" }}
            >
              {ICON[t.tone]}
            </span>
            <span className="flex-1">{t.message}</span>
            <button
              aria-label="Đóng thông báo"
              className="flex-none opacity-60 text-[16px] leading-none"
              onClick={() => setList((cur) => cur.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/**
 * Nút chạy một server action đã bind sẵn, tự hiện toast theo kết quả trả về.
 * Dùng cho các thao tác một-chạm: thả vườn, xoá ảnh, đánh dấu hết chu kỳ…
 */
export function ActionButton({
  action, children, className = "btn btn-ghost btn-sm", pendingLabel, confirm, disabled, style,
}: {
  action: () => Promise<ActionResult | void>;
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  confirm?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      type="button" className={className} style={style} disabled={pending || disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          try {
            const r = await action();
            if (r) toast(r.message, r.ok ? "ok" : "warn");
          } catch {
            toast("Không thực hiện được. Thử lại giúp mình nhé.", "err");
          }
        });
      }}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
