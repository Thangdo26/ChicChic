"use client";
// Chuông thông báo ở thanh trên.
// Tự làm mới bằng cách hỏi /api/notifications mỗi 20 giây (chỉ khi tab đang mở)
// và ngay khi quay lại tab — nhờ vậy việc bên kia vừa làm xong hiện lên mà
// không cần người dùng tải lại trang.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markNotificationsRead } from "@/app/notification-actions";
import { NOTIFY_ICON, type NotificationVM } from "@/lib/notify-meta";
import { timeAgo } from "@/lib/decor";

const POLL_MS = 20_000;

/** Chưa đọc trong danh sách đang cầm — huy hiệu chỉ hiện tới "9+" nên vậy là đủ. */
const unread = (list: NotificationVM[]) => list.filter((n) => !n.read).length;

export default function NotificationBell({ initialList }: { initialList: NotificationVM[] }) {
  const [list, setList] = useState(initialList);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const count = unread(list);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { list: NotificationVM[] };
      setList(data.list);
    } catch {
      /* mất mạng thì thôi, lần poll sau thử lại */
    }
  }, []);

  // Poll định kỳ + làm mới khi quay lại tab
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [refresh]);

  // Bấm ra ngoài / bấm Esc thì đóng
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    await refresh();
    // Mở ra là coi như đã đọc — tắt chấm đỏ ngay ở client rồi mới ghi DB.
    setList((cur) => (cur.some((n) => !n.read) ? cur.map((n) => ({ ...n, read: true })) : cur));
    await markNotificationsRead();
  };

  const go = (href: string | null) => {
    setOpen(false);
    if (href) router.push(href);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={count > 0 ? `Thông báo (${count} mới)` : "Thông báo"}
        aria-expanded={open}
        className="relative grid place-items-center rounded-full"
        style={{ width: 34, height: 34, background: "#fff", border: "1px solid var(--line)" }}
      >
        <span className="text-[15px] leading-none" aria-hidden>🔔</span>
        {count > 0 && (
          <span
            className="absolute grid place-items-center font-bold rounded-full tabular-nums"
            style={{
              top: -4, right: -4, minWidth: 18, height: 18, padding: "0 4px",
              fontSize: 10.5, background: "#B4472F", color: "#fff", border: "2px solid var(--paper)",
            }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 rounded-[16px] overflow-hidden"
          style={{
            top: 42, left: 0, width: "min(320px, calc(100vw - 32px))",
            background: "var(--card)", border: "1px solid var(--line)",
            boxShadow: "0 10px 34px rgba(24,34,28,.20)",
          }}
        >
          <div className="flex items-center justify-between px-3.5 py-2.5"
            style={{ borderBottom: "1px solid var(--line-soft)", background: "var(--paper2)" }}>
            <span className="font-bold text-[13.5px]">Thông báo</span>
            <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>{list.length} gần nhất</span>
          </div>

          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            {list.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-[12.8px]" style={{ color: "var(--ink-soft)" }}>
                Chưa có thông báo nào.<br />Mọi việc bạn hoặc nông dân làm xong sẽ hiện ở đây.
              </div>
            ) : (
              list.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => go(n.href)}
                  className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left"
                  style={{
                    borderBottom: "1px solid var(--line-soft)",
                    background: n.read ? "transparent" : "var(--paddy-tint)",
                    cursor: n.href ? "pointer" : "default",
                  }}
                >
                  <span className="flex-none text-[15px] leading-tight" aria-hidden>{NOTIFY_ICON[n.kind] ?? "🔔"}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-[12.9px] leading-snug" style={{ color: "var(--ink)" }}>{n.title}</span>
                    {n.body && (
                      <span className="block text-[11.9px] leading-snug mt-0.5" style={{ color: "var(--ink-soft)" }}>{n.body}</span>
                    )}
                    <span className="block text-[11px] mt-0.5" style={{ color: "var(--ink-soft)", opacity: .8 }}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
