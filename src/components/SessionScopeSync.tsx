"use client";
import { useEffect } from "react";

const KEY = "chic_scope_changed";

/** Token đã đổi ở server; xóa màn hình/cache cũ trên các tab cùng trình duyệt. */
export function scopeChanged() {
  try { localStorage.setItem(KEY, `${Date.now()}-${Math.random()}`); } catch { /* storage có thể bị chặn */ }
}

export default function SessionScopeSync() {
  useEffect(() => {
    const refresh = (event: StorageEvent) => { if (event.key === KEY) window.location.reload(); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("storage", refresh);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pageshow", restore);
    };
  }, []);
  return null;
}
